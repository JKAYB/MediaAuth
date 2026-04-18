"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  parseCliArgs,
  isEligibleLocalUploadScan,
  buildS3ObjectKeyFromLegacyLocalStorageKey,
  buildCandidateQuery,
  normalizeUploadStorageProvider
} = require("../src/scripts/migrateLocalUploadsToS3.lib");

describe("migrateLocalUploadsToS3.lib", () => {
  it("normalizeUploadStorageProvider treats null as local", () => {
    assert.equal(normalizeUploadStorageProvider(null), "local");
    assert.equal(normalizeUploadStorageProvider(undefined), "local");
    assert.equal(normalizeUploadStorageProvider("  "), "local");
    assert.equal(normalizeUploadStorageProvider("S3"), "s3");
  });

  it("isEligibleLocalUploadScan rejects url and s3 rows", () => {
    assert.equal(
      isEligibleLocalUploadScan({
        source_type: "url",
        storage_key: "x/y",
        storage_provider: null
      }),
      false
    );
    assert.equal(
      isEligibleLocalUploadScan({
        source_type: "upload",
        storage_key: "a/b.png",
        storage_provider: "s3"
      }),
      false
    );
    assert.equal(
      isEligibleLocalUploadScan({
        source_type: "upload",
        storage_key: null,
        storage_provider: null
      }),
      false
    );
    assert.equal(
      isEligibleLocalUploadScan({
        source_type: "upload",
        storage_key: "  ",
        storage_provider: "local"
      }),
      false
    );
    assert.equal(
      isEligibleLocalUploadScan({
        source_type: "upload",
        storage_key: "uuid/f.png",
        storage_provider: null
      }),
      true
    );
    assert.equal(
      isEligibleLocalUploadScan({
        source_type: "upload",
        storage_key: "uuid/f.png",
        storage_provider: "local"
      }),
      true
    );
  });

  it("buildS3ObjectKeyFromLegacyLocalStorageKey applies prefix like S3ScanStorage", () => {
    assert.equal(
      buildS3ObjectKeyFromLegacyLocalStorageKey("scan/file.png", ""),
      "scan/file.png"
    );
    assert.equal(
      buildS3ObjectKeyFromLegacyLocalStorageKey("scan/file.png", "scans"),
      "scans/scan/file.png"
    );
    assert.equal(
      buildS3ObjectKeyFromLegacyLocalStorageKey("scan/file.png", "scans/"),
      "scans/scan/file.png"
    );
  });

  it("parseCliArgs parses flags and rejects conflicts", () => {
    const a = parseCliArgs(["--dry-run", "--limit", "5", "--scan-id", "550e8400-e29b-41d4-a716-446655440000"]);
    assert.equal(a.dryRun, true);
    assert.equal(a.limit, 5);
    assert.equal(a.scanId, "550e8400-e29b-41d4-a716-446655440000");
    assert.throws(() => parseCliArgs(["--dry-run", "--verify-only"]), /not both/);
    assert.throws(() => parseCliArgs(["--only-provider=s3"]), /only-provider/);
  });

  it("buildCandidateQuery is parameterized and scoped to local-backed uploads", () => {
    const { sql, values } = buildCandidateQuery({
      dryRun: false,
      verifyOnly: false,
      checkS3InVerify: false,
      limit: 2,
      scanId: "11111111-1111-1111-1111-111111111111",
      beforeIso: "2020-01-02",
      afterIso: "2019-12-31",
      onlyProvider: "local"
    });
    assert.match(sql, /source_type = 'upload'/);
    assert.match(sql, /LIMIT \$4/);
    assert.equal(values.length, 4);
    assert.equal(values[0], "11111111-1111-1111-1111-111111111111");
    assert.equal(values[1], "2019-12-31");
    assert.equal(values[2], "2020-01-02");
    assert.equal(values[3], 2);
  });
});
