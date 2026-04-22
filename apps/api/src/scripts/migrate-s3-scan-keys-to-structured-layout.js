#!/usr/bin/env node
"use strict";

/**
 * One-time migration: flat / legacy S3 keys -> scans/users/{userId}/{scanId}/original/source{ext}
 * Safe by default (dry-run). See docs/OPERATIONS.md.
 */

const { getStorageForProvider, assertS3ObjectStorageEnv } = require("@media-auth/scan-storage");
const {
  parseMigrateS3KeysCli,
  buildS3StructuredMigrationQuery,
  classifyRowForS3StructuredMigration,
  plannedStructuredS3StorageKey,
  printMigrateS3KeysHelp
} = require("./migrateS3ScanKeys.lib");

function log(tag, msg, meta) {
  const extra = meta != null ? ` ${JSON.stringify(meta)}` : "";
  process.stdout.write(`[migrate-s3-scan-keys] [${tag}] ${msg}${extra}\n`);
}

async function main() {
  let opts;
  try {
    opts = parseMigrateS3KeysCli(process.argv.slice(2));
  } catch (e) {
    console.error(String(e && e.message ? e.message : e));
    process.exit(1);
  }
  if (opts.help) {
    printMigrateS3KeysHelp();
    process.exit(0);
  }

  const summary = {
    candidates: 0,
    skippedAlreadyStructured: 0,
    skippedMissingUser: 0,
    skippedTargetExists: 0,
    dryRunPlanned: 0,
    copiedVerified: 0,
    dbUpdated: 0,
    oldObjectDeleted: 0,
    errors: 0
  };

  const prefix = process.env.OBJECT_STORAGE_PREFIX || "";

  if (opts.execute) {
    assertS3ObjectStorageEnv();
  }

  // eslint-disable-next-line global-require
  const { pool } = require("../db/pool");
  const { sql, values } = buildS3StructuredMigrationQuery(opts);
  const { rows } = await pool.query(sql, values);
  summary.candidates = rows.length;

  log("INFO", "Loaded candidate rows", {
    count: rows.length,
    dryRun: opts.dryRun,
    execute: opts.execute,
    deleteOldObjects: opts.deleteOldObjects
  });

  let s3 = null;
  if (opts.execute) {
    s3 = getStorageForProvider("s3");
  }

  for (const row of rows) {
    let copied = false;
    const scanId = String(row.id);
    const gate = classifyRowForS3StructuredMigration(row, prefix);
    if (!gate.ok) {
      if (gate.reason === "already_structured") {
        summary.skippedAlreadyStructured += 1;
        log("SKIP", "already using structured original key", { scanId, reason: gate.reason });
      } else if (gate.reason === "missing_user_id") {
        summary.skippedMissingUser += 1;
        log("SKIP", "missing user_id", { scanId });
      } else {
        log("SKIP", gate.reason, { scanId });
      }
      continue;
    }

    const oldKey = String(row.storage_key).trim();
    const newKey = plannedStructuredS3StorageKey(row, prefix);

    if (oldKey === newKey) {
      summary.skippedAlreadyStructured += 1;
      log("SKIP", "old and new key identical", { scanId });
      continue;
    }

    if (opts.dryRun) {
      summary.dryRunPlanned += 1;
      log("DRY_RUN", "would copy", { scanId, oldKey, newKey, mimeType: row.mime_type });
      continue;
    }

    if (!s3) {
      throw new Error("S3 client missing");
    }

    try {
      const headOld = await s3.getObjectInfo(oldKey);
      if (!headOld.exists) {
        summary.errors += 1;
        log("ERROR", "source object missing", { scanId, oldKey });
        continue;
      }

      const headNewBefore = await s3.getObjectInfo(newKey);
      if (headNewBefore.exists) {
        summary.skippedTargetExists += 1;
        log("SKIP", "destination key already exists", { scanId, newKey });
        continue;
      }

      await s3.copyObject({ sourceKey: oldKey, destinationKey: newKey });
      copied = true;
      const headNew = await s3.getObjectInfo(newKey);
      if (!headNew.exists || headNew.size !== headOld.size) {
        summary.errors += 1;
        log("ERROR", "copy verification failed", {
          scanId,
          newKey,
          expectedSize: headOld.size,
          actualSize: headNew.exists ? headNew.size : null
        });
        if (copied) {
          await s3.deleteObject(newKey).catch(() => { });
        }
        continue;
      }

      summary.copiedVerified += 1;
      log("OK", "copied and verified", { scanId, oldKey, newKey, size: headNew.size });

      const upd = await pool.query(
        `UPDATE scans
         SET old_storage_key = storage_key,
             storage_key = $1,
             storage_migrated_at = NOW()
         WHERE id = $2
           AND storage_key = $3
           AND LOWER(TRIM(COALESCE(storage_provider,''))) = 's3'`,
        [newKey, scanId, oldKey]
      );

      if (upd.rowCount !== 1) {
        if (copied) {
          await s3.deleteObject(newKey).catch(() => {});
        }
        summary.errors += 1;
        log("ERROR", "DB update did not match exactly one row (manual fix may be needed)", {
          scanId,
          rowCount: upd.rowCount
        });
        continue;
      }

      summary.dbUpdated += 1;
      log("OK", "database row updated", { scanId });

      if (opts.deleteOldObjects) {
        try {
          await s3.deleteObject(oldKey);
          summary.oldObjectDeleted += 1;
          log("OK", "deleted old object", { scanId, oldKey });
        } catch (delErr) {
          summary.errors += 1;
          log("ERROR", "failed to delete old object", {
            scanId,
            oldKey,
            message: delErr && delErr.message ? delErr.message : String(delErr)
          });
        }
      }
    } catch (e) {
      if (copied) {
        await s3.deleteObject(newKey).catch(() => { });
      }
      summary.errors += 1;
      log("ERROR", "migration step failed", {
        scanId,
        message: e && e.message ? e.message : String(e)
      });
    }
  }

  await pool.end();
  log("INFO", "summary", summary);
  if (summary.errors > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
