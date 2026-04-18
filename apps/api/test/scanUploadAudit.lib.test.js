"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const {
  parseAuditCliArgs,
  classifyUploadScanRow,
  extractLegacyLocalRelativeKey,
  listOrphanLocalFilesUnderUploadBase
} = require("../src/scripts/scanUploadAudit.lib");

describe("scanUploadAudit.lib", () => {
  it("extractLegacyLocalRelativeKey strips prefix", () => {
    assert.deepEqual(extractLegacyLocalRelativeKey("a/b", ""), { ok: false, reason: "legacy_key_shape_mismatch" });
    const u = "550e8400-e29b-41d4-a716-446655440000";
    assert.deepEqual(extractLegacyLocalRelativeKey(`${u}/f.png`, ""), {
      ok: true,
      legacyRelative: `${u}/f.png`
    });
    assert.deepEqual(extractLegacyLocalRelativeKey(`scans/${u}/f.png`, "scans"), {
      ok: true,
      legacyRelative: `${u}/f.png`
    });
  });

  it("classifyUploadScanRow covers main buckets", () => {
    const base = {
      hasValidStorageKey: true,
      extractOk: true,
      localFilePresent: true,
      localFileChecked: true,
      s3DbKeyPresent: false,
      s3DbKeyChecked: false,
      s3MigrationTargetPresent: false,
      s3MigrationTargetChecked: false,
      s3ErrorAny: false
    };
    assert.equal(classifyUploadScanRow({ ...base, normalizedProvider: "local" }), "local_only");
    assert.equal(
      classifyUploadScanRow({
        ...base,
        normalizedProvider: "local",
        s3MigrationTargetChecked: true,
        s3MigrationTargetPresent: true
      }),
      "local_and_s3"
    );
    assert.equal(
      classifyUploadScanRow({
        ...base,
        normalizedProvider: "local",
        localFileChecked: false
      }),
      "local_file_unverified"
    );
    assert.equal(
      classifyUploadScanRow({
        ...base,
        normalizedProvider: "local",
        localFilePresent: false
      }),
      "missing_local_but_db_local"
    );
    assert.equal(
      classifyUploadScanRow({
        ...base,
        normalizedProvider: "s3",
        localFileChecked: false,
        localFilePresent: false,
        s3DbKeyChecked: true,
        s3DbKeyPresent: true
      }),
      "s3_only"
    );
    assert.equal(
      classifyUploadScanRow({
        ...base,
        normalizedProvider: "s3",
        s3DbKeyChecked: true,
        s3DbKeyPresent: false
      }),
      "db_s3_but_missing_in_s3"
    );
    assert.equal(
      classifyUploadScanRow({
        ...base,
        normalizedProvider: "s3",
        localFilePresent: false,
        localFileChecked: true,
        s3DbKeyChecked: false,
        s3DbKeyPresent: false
      }),
      "s3_unverified"
    );
    assert.equal(classifyUploadScanRow({ ...base, normalizedProvider: "gcs" }), "invalid_storage_metadata");
    assert.equal(classifyUploadScanRow({ ...base, s3ErrorAny: true, normalizedProvider: "s3" }), "s3_probe_error");
  });

  it("parseAuditCliArgs", () => {
    const o = parseAuditCliArgs(["--check-s3", "--json", "--only-provider=s3", "--limit", "3"]);
    assert.equal(o.checkS3, true);
    assert.equal(o.json, true);
    assert.equal(o.onlyProvider, "s3");
    assert.equal(o.limit, 3);
  });

  it("listOrphanLocalFilesUnderUploadBase finds orphans", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "audit-orph-"));
    const u = "11111111-1111-1111-1111-111111111111";
    await fs.mkdir(path.join(root, u), { recursive: true });
    await fs.writeFile(path.join(root, u, "orphan.bin"), "x", "utf8");
    await fs.writeFile(path.join(root, u, "tracked.bin"), "y", "utf8");
    const ref = new Set([`${u}/tracked.bin`]);
    const { orphans, error } = await listOrphanLocalFilesUnderUploadBase(root, ref);
    assert.equal(error, null);
    assert.equal(orphans.length, 1);
    assert.match(orphans[0].relative, /orphan\.bin$/);
    await fs.rm(root, { recursive: true, force: true });
  });
});
