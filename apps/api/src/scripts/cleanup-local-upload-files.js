#!/usr/bin/env node
"use strict";

/**
 * Guarded cleanup: remove legacy local-disk files for scans already backed by S3.
 * Default dry-run. Requires explicit --execute to unlink. Never deletes S3 objects or DB rows.
 */

const path = require("path");
const fs = require("fs/promises");

require("dotenv").config({
  path: path.resolve(__dirname, "../../../../.env")
});

const { absolutePathForStorageKey, getStorageForProvider, assertS3ObjectStorageEnv } = require("@media-auth/scan-storage");
const { extractLegacyLocalRelativeKey } = require("./scanUploadAudit.lib");
const {
  parseCleanupCliArgs,
  printCleanupHelp,
  buildS3UploadCleanupQuery,
  qualifiesForLocalDeletion,
  rowCreatedBefore
} = require("./cleanupLocalUploads.lib");

function log(tag, msg, meta) {
  const extra = meta != null ? ` ${JSON.stringify(meta)}` : "";
  process.stdout.write(`[${tag}] ${msg}${extra}\n`);
}

async function main() {
  let opts;
  try {
    opts = parseCleanupCliArgs(process.argv.slice(2));
  } catch (e) {
    console.error(String(e && e.message ? e.message : e));
    process.exit(1);
  }
  if (opts.help) {
    printCleanupHelp();
    process.exit(0);
  }

  assertS3ObjectStorageEnv();

  // eslint-disable-next-line global-require
  const { pool } = require("../db/pool");
  const prefix = process.env.OBJECT_STORAGE_PREFIX || "";
  const { sql, values } = buildS3UploadCleanupQuery(opts);
  const { rows } = await pool.query(sql, values);

  const s3 = getStorageForProvider("s3");

  const summary = {
    rowsConsidered: rows.length,
    proposedDeletion: 0,
    deleted: 0,
    skipped: 0,
    errors: 0
  };

  if (!opts.execute) {
    log("INFO", "dry-run mode (no files removed); pass --execute to unlink legacy local copies", {});
  }

  for (const row of rows) {
    const ex = extractLegacyLocalRelativeKey(String(row.storage_key), prefix);
    const extractOk = ex.ok;

    let localPath = null;
    let localExists = false;
    let localChecked = false;
    if (extractOk) {
      localChecked = true;
      try {
        localPath = absolutePathForStorageKey(ex.legacyRelative);
        const st = await fs.stat(localPath);
        localExists = st.isFile();
      } catch {
        localExists = false;
      }
    }

    let s3Exists = false;
    let s3Checked = false;
    let s3Err = false;
    try {
      const info = await s3.getObjectInfo(String(row.storage_key).trim());
      s3Checked = true;
      s3Exists = Boolean(info.exists);
    } catch {
      s3Err = true;
    }

    const ageOk = rowCreatedBefore(row.created_at, opts.olderThanIso);

    const q = qualifiesForLocalDeletion({
      isS3BackedRow: true,
      extractOk,
      s3ObjectExists: s3Exists,
      s3Checked: s3Checked && !s3Err,
      localLegacyFileExists: localExists,
      localChecked,
      ageOk
    });

    if (!q.ok) {
      summary.skipped += 1;
      log("SKIP", "row not eligible for local delete", {
        scanId: row.id,
        reason: q.reason || (s3Err ? "s3_head_error" : "unknown")
      });
      continue;
    }

    summary.proposedDeletion += 1;
    if (!opts.execute) {
      log("DRY-RUN", "would delete legacy local file", { scanId: row.id, path: localPath });
      continue;
    }

    try {
      await fs.unlink(/** @type {string} */ (localPath));
      summary.deleted += 1;
      log("EXEC", "deleted legacy local file", { scanId: row.id, path: localPath });
    } catch (e) {
      summary.errors += 1;
      log("ERROR", "unlink failed", {
        scanId: row.id,
        path: localPath,
        error: String(e && e.message ? e.message : e)
      });
    }
  }

  await pool.end();

  log("INFO", "Summary", summary);
  process.exit(summary.errors > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  try {
    // eslint-disable-next-line global-require
    const { pool } = require("../db/pool");
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
