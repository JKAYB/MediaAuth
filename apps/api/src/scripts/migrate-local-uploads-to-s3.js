#!/usr/bin/env node
"use strict";

/**
 * Operational migration: copy legacy local upload objects to S3 and update `scans` rows.
 * Does not delete local files. See docs/OPERATIONS.md and --help.
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
  plannedStructuredS3StorageKey
} = require("@media-auth/scan-storage");
const {
  parseCliArgs,
  printHelp,
  buildCandidateQuery,
  isEligibleLocalUploadScan
} = require("./migrateLocalUploadsToS3.lib");

function log(tag, msg, meta) {
  const extra = meta != null ? ` ${JSON.stringify(meta)}` : "";
  process.stdout.write(`[${tag}] ${msg}${extra}\n`);
}

async function main() {
  let filters;
  try {
    filters = parseCliArgs(process.argv.slice(2));
  } catch (e) {
    console.error(String(e && e.message ? e.message : e));
    process.exit(1);
  }
  if (filters.help) {
    printHelp();
    process.exit(0);
  }

  const summary = {
    candidatesQueried: 0,
    migrated: 0,
    skippedIneligible: 0,
    skippedInvalidStorageKey: 0,
    skippedMissingUserId: 0,
    missingLocalFile: 0,
    unreadableLocalFile: 0,
    failedS3UploadOrVerify: 0,
    failedDbUpdate: 0,
    dryRunListed: 0,
    verifyLocalOk: 0,
    verifyLocalMissing: 0,
    verifyS3Present: 0,
    verifyS3Missing: 0,
    verifyS3Error: 0
  };

  const needsS3Client =
    !filters.dryRun && !filters.verifyOnly ? true : filters.verifyOnly && filters.checkS3InVerify;

  if (needsS3Client) {
    assertS3ObjectStorageEnv();
  }

  // eslint-disable-next-line global-require
  const { pool } = require("../db/pool");
  const { sql, values } = buildCandidateQuery(filters);
  const { rows } = await pool.query(sql, values);
  summary.candidatesQueried = rows.length;

  log("INFO", `Candidate rows: ${rows.length}`, {
    dryRun: filters.dryRun,
    verifyOnly: filters.verifyOnly
  });

  const prefix = process.env.OBJECT_STORAGE_PREFIX || "";

  for (const row of rows) {
    const scanId = row.id;
    if (!isEligibleLocalUploadScan(row)) {
      summary.skippedIneligible += 1;
      log("SKIP", "not eligible", { scanId });
      continue;
    }

    const legacyKey = String(row.storage_key).trim();
    if (!row.user_id) {
      summary.skippedMissingUserId += 1;
      log("SKIP", "missing user_id (required for structured S3 key)", { scanId });
      continue;
    }
    let targetKey;
    try {
      targetKey = plannedStructuredS3StorageKey(row, prefix);
    } catch (e) {
      summary.skippedInvalidStorageKey += 1;
      log("SKIP", "cannot build structured S3 key", { scanId, error: String(e && e.message ? e.message : e) });
      continue;
    }

    let absLocal;
    try {
      absLocal = absolutePathForStorageKey(legacyKey);
    } catch (e) {
      summary.skippedInvalidStorageKey += 1;
      log("SKIP", "absolutePathForStorageKey failed", {
        scanId,
        legacyKey,
        error: String(e && e.message ? e.message : e)
      });
      continue;
    }

    if (filters.dryRun) {
      let exists = false;
      let size = null;
      try {
        const st = await fs.stat(absLocal);
        exists = st.isFile();
        size = exists ? st.size : null;
      } catch {
        exists = false;
      }
      summary.dryRunListed += 1;
      log("DRY-RUN", "would migrate if executed", {
        scanId,
        legacyKey,
        targetS3Key: targetKey,
        localPath: absLocal,
        localFileExists: exists,
        localSize: size
      });
      continue;
    }

    if (filters.verifyOnly) {
      try {
        const st = await fs.stat(absLocal);
        if (!st.isFile()) {
          summary.verifyLocalMissing += 1;
          log("VERIFY", "local path is not a file", { scanId, absLocal });
        } else {
          summary.verifyLocalOk += 1;
          await fs.open(absLocal, "r").then((h) => h.close());
          log("VERIFY", "local file ok", { scanId, absLocal, size: st.size });
        }
      } catch {
        summary.verifyLocalMissing += 1;
        log("VERIFY", "local file missing or unreadable", { scanId, absLocal });
      }
      if (filters.checkS3InVerify) {
        try {
          const s3 = getStorageForProvider("s3");
          const info = await s3.getObjectInfo(targetKey);
          if (info.exists) {
            summary.verifyS3Present += 1;
            log("VERIFY", "S3 object exists", { scanId, targetKey, size: info.size });
          } else {
            summary.verifyS3Missing += 1;
            log("VERIFY", "S3 object missing", { scanId, targetKey });
          }
        } catch (e) {
          summary.verifyS3Error += 1;
          log("VERIFY", "S3 head failed", {
            scanId,
            targetKey,
            error: String(e && e.message ? e.message : e)
          });
        }
      }
      continue;
    }

    let localStat;
    try {
      localStat = await fs.stat(absLocal);
      if (!localStat.isFile()) {
        summary.missingLocalFile += 1;
        log("ERROR", "local path is not a file", { scanId, absLocal });
        continue;
      }
    } catch (e) {
      summary.missingLocalFile += 1;
      log("ERROR", "missing local file", { scanId, absLocal, error: String(e && e.message ? e.message : e) });
      continue;
    }

    let buffer;
    try {
      buffer = await fs.readFile(absLocal);
    } catch (e) {
      summary.unreadableLocalFile += 1;
      log("ERROR", "failed to read local file", {
        scanId,
        absLocal,
        error: String(e && e.message ? e.message : e)
      });
      continue;
    }

    const dbDeclared = Number(row.file_size_bytes) || 0;
    if (dbDeclared > 0 && dbDeclared !== buffer.length) {
      log("WARN", "file_size_bytes differs from bytes on disk (using disk)", {
        scanId,
        dbDeclared,
        diskSize: buffer.length
      });
    }

    const s3 = getStorageForProvider("s3");
    const contentType = row.mime_type && String(row.mime_type).trim()
      ? String(row.mime_type).trim()
      : "application/octet-stream";

    try {
      const headBefore = await s3.getObjectInfo(targetKey);
      const skipPut =
        headBefore.exists && headBefore.size != null && Number(headBefore.size) === buffer.length;
      if (!skipPut) {
        await s3.putBufferAtStorageKey({
          storageKey: targetKey,
          buffer,
          contentType
        });
      } else {
        log("INFO", "S3 object already present with matching size; skipping PutObject", {
          scanId,
          targetKey
        });
      }

      const headAfter = await s3.getObjectInfo(targetKey);
      if (!headAfter.exists || headAfter.size == null || Number(headAfter.size) !== buffer.length) {
        throw new Error(
          `post-upload Head verification failed: exists=${headAfter.exists} size=${headAfter.size} expected=${buffer.length}`
        );
      }
    } catch (e) {
      summary.failedS3UploadOrVerify += 1;
      log("ERROR", "S3 upload or verify failed", {
        scanId,
        targetKey,
        error: String(e && e.message ? e.message : e)
      });
      continue;
    }

    try {
      const upd = await pool.query(
        `UPDATE scans
         SET storage_provider = 's3',
             storage_key = $1,
             updated_at = NOW()
         WHERE id = $2
           AND source_type = 'upload'
           AND storage_key IS NOT NULL
           AND TRIM(storage_key) <> ''
           AND (storage_provider IS NULL OR LOWER(TRIM(storage_provider)) = 'local')
         RETURNING id`,
        [targetKey, scanId]
      );
      if (!upd.rowCount) {
        summary.failedDbUpdate += 1;
        log("ERROR", "DB update affected 0 rows (already migrated or concurrent change?); S3 may contain object", {
          scanId,
          targetKey,
          reconcile: "Re-run after confirming row state; or delete stray S3 object if row is already s3 with another key."
        });
        continue;
      }
      summary.migrated += 1;
      log("OK", "migrated", { scanId, legacyKey, targetS3Key: targetKey, bytes: buffer.length });
    } catch (e) {
      summary.failedDbUpdate += 1;
      log("ERROR", "DB update threw after successful S3 upload — reconcile manually", {
        scanId,
        targetKey,
        error: String(e && e.message ? e.message : e)
      });
    }
  }

  await pool.end();

  log("INFO", "Summary", summary);
  const hardFail =
    summary.failedDbUpdate > 0 ||
    summary.failedS3UploadOrVerify > 0 ||
    summary.verifyS3Error > 0;
  process.exit(hardFail ? 1 : 0);
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
