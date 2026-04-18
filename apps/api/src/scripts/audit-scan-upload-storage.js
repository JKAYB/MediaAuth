#!/usr/bin/env node
"use strict";

/**
 * Post-migration audit: classify upload scan rows and optional orphan local files.
 */

const path = require("path");
const fs = require("fs/promises");

require("dotenv").config({
  path: path.resolve(__dirname, "../../../../.env")
});

const {
  absolutePathForStorageKey,
  getStorageForProvider,
  assertS3ObjectStorageEnv,
  uploadBaseDir
} = require("@media-auth/scan-storage");
const {
  parseAuditCliArgs,
  printAuditHelp,
  buildUploadScanAuditQuery,
  classifyUploadScanRow,
  extractLegacyLocalRelativeKey,
  buildS3ObjectKeyFromLegacyLocalStorageKey,
  normalizeUploadStorageProvider,
  loadReferencedLegacyRelativeKeys,
  listOrphanLocalFilesUnderUploadBase
} = require("./scanUploadAudit.lib");

function initCounts() {
  return {
    local_only: 0,
    s3_only: 0,
    local_and_s3: 0,
    missing_local_but_db_local: 0,
    db_s3_but_missing_in_s3: 0,
    invalid_storage_metadata: 0,
    s3_unverified: 0,
    s3_db_local_file_present_unverified: 0,
    s3_probe_error: 0,
    local_file_unverified: 0,
    orphan_local_file: 0
  };
}

async function main() {
  let opts;
  try {
    opts = parseAuditCliArgs(process.argv.slice(2));
  } catch (e) {
    console.error(String(e && e.message ? e.message : e));
    process.exit(1);
  }
  if (opts.help) {
    printAuditHelp();
    process.exit(0);
  }

  if (opts.checkS3) {
    assertS3ObjectStorageEnv();
  }

  // eslint-disable-next-line global-require
  const { pool } = require("../db/pool");
  const prefix = process.env.OBJECT_STORAGE_PREFIX || "";
  const { sql, values } = buildUploadScanAuditQuery(opts);
  const { rows } = await pool.query(sql, values);

  const counts = initCounts();
  /** @type {object[]} */
  const rowDetails = [];

  let s3;
  if (opts.checkS3) {
    s3 = getStorageForProvider("s3");
  }

  for (const row of rows) {
    const normalizedProvider = normalizeUploadStorageProvider(row.storage_provider);

    const hasValidStorageKey = Boolean(row.storage_key && String(row.storage_key).trim());
    const ex = hasValidStorageKey ? extractLegacyLocalRelativeKey(String(row.storage_key), prefix) : { ok: false };
    const extractOk = /** @type {{ ok: boolean }} */ (ex).ok;

    let localFilePresent = false;
    let localFileChecked = false;
    if (opts.checkLocal && extractOk) {
      localFileChecked = true;
      try {
        const abs = absolutePathForStorageKey(/** @type {{ legacyRelative: string }} */ (ex).legacyRelative);
        const st = await fs.stat(abs);
        localFilePresent = st.isFile();
      } catch {
        localFilePresent = false;
      }
    }

    let s3DbKeyChecked = false;
    let s3DbKeyPresent = false;
    let s3MigrationTargetChecked = false;
    let s3MigrationTargetPresent = false;
    let s3ErrorAny = false;

    if (opts.checkS3 && s3 && hasValidStorageKey && extractOk && (normalizedProvider === "local" || normalizedProvider === "s3")) {
      try {
        if (normalizedProvider === "s3") {
          const info = await s3.getObjectInfo(String(row.storage_key).trim());
          s3DbKeyChecked = true;
          s3DbKeyPresent = Boolean(info.exists);
        } else {
          const migKey = buildS3ObjectKeyFromLegacyLocalStorageKey(String(row.storage_key).trim(), prefix);
          const info = await s3.getObjectInfo(migKey);
          s3MigrationTargetChecked = true;
          s3MigrationTargetPresent = Boolean(info.exists);
        }
      } catch {
        s3ErrorAny = true;
      }
    }

    const bucket = classifyUploadScanRow({
      normalizedProvider,
      hasValidStorageKey,
      extractOk,
      localFilePresent,
      localFileChecked,
      s3DbKeyPresent,
      s3DbKeyChecked,
      s3MigrationTargetPresent,
      s3MigrationTargetChecked,
      s3ErrorAny
    });

    counts[bucket] = (counts[bucket] || 0) + 1;
    rowDetails.push({
      id: row.id,
      bucket,
      storage_provider: row.storage_provider,
      storage_key: row.storage_key,
      created_at: row.created_at
    });
  }

  let orphanList = [];
  if (opts.scanOrphans) {
    const ref = await loadReferencedLegacyRelativeKeys(pool, prefix);
    const base = uploadBaseDir();
    const { orphans, error } = await listOrphanLocalFilesUnderUploadBase(base, ref);
    if (error) {
      process.stderr.write(`[WARN] orphan scan skipped: ${error}\n`);
    } else {
      orphanList = orphans;
      counts.orphan_local_file = orphans.length;
    }
  }

  await pool.end();

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          summary: { ...counts, rowsAudited: rows.length },
          rows: rowDetails,
          orphans: orphanList.map((o) => o.relative)
        },
        null,
        2
      ) + "\n"
    );
  } else {
    process.stdout.write("\n=== Upload storage audit ===\n\n");
    process.stdout.write(`Rows scanned (query): ${rows.length}\n`);
    for (const [k, v] of Object.entries(counts)) {
      if (k === "orphan_local_file") {
        continue;
      }
      process.stdout.write(`  ${k}: ${v}\n`);
    }
    process.stdout.write(`  orphan_local_file: ${counts.orphan_local_file}\n`);
    if (orphanList.length) {
      process.stdout.write("\nOrphan files (sample up to 50):\n");
      for (const o of orphanList.slice(0, 50)) {
        process.stdout.write(`  ${o.relative} -> ${o.absolute}\n`);
      }
      if (orphanList.length > 50) {
        process.stdout.write(`  ... and ${orphanList.length - 50} more\n`);
      }
    }
    process.stdout.write("\n");
  }

  const critical =
    counts.invalid_storage_metadata +
      counts.missing_local_but_db_local +
      counts.db_s3_but_missing_in_s3 +
      counts.s3_probe_error >
    0;

  const strictFail =
    opts.strict &&
    (counts.orphan_local_file +
      counts.s3_unverified +
      counts.local_file_unverified +
      counts.s3_db_local_file_present_unverified >
      0);

  process.exit(critical || strictFail ? 1 : 0);
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
