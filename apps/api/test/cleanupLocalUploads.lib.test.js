"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  parseCleanupCliArgs,
  qualifiesForLocalDeletion,
  rowCreatedBefore,
  buildS3UploadCleanupQuery
} = require("../src/scripts/cleanupLocalUploads.lib");

describe("cleanupLocalUploads.lib", () => {
  it("parseCleanupCliArgs", () => {
    const a = parseCleanupCliArgs(["--limit", "10", "--older-than", "2024-01-01", "--execute"]);
    assert.equal(a.limit, 10);
    assert.equal(a.olderThanIso, "2024-01-01");
    assert.equal(a.execute, true);
  });

  it("rowCreatedBefore", () => {
    assert.equal(rowCreatedBefore("2020-06-01", null), true);
    assert.equal(rowCreatedBefore("2020-06-01", "2021-01-01"), true);
    assert.equal(rowCreatedBefore("2022-06-01", "2021-01-01"), false);
  });

  it("qualifiesForLocalDeletion is conservative", () => {
    assert.equal(
      qualifiesForLocalDeletion({
        isS3BackedRow: false,
        extractOk: true,
        s3ObjectExists: true,
        s3Checked: true,
        localLegacyFileExists: true,
        localChecked: true,
        ageOk: true
      }).ok,
      false
    );
    assert.equal(
      qualifiesForLocalDeletion({
        isS3BackedRow: true,
        extractOk: true,
        s3ObjectExists: false,
        s3Checked: true,
        localLegacyFileExists: true,
        localChecked: true,
        ageOk: true
      }).ok,
      false
    );
    assert.equal(
      qualifiesForLocalDeletion({
        isS3BackedRow: true,
        extractOk: true,
        s3ObjectExists: true,
        s3Checked: true,
        localLegacyFileExists: true,
        localChecked: true,
        ageOk: true
      }).ok,
      true
    );
  });

  it("buildS3UploadCleanupQuery only selects s3 upload rows", () => {
    const { sql, values } = buildS3UploadCleanupQuery({
      help: false,
      execute: false,
      limit: 5,
      scanId: null,
      olderThanIso: "2023-01-01"
    });
    assert.match(sql, /LOWER\(TRIM\(storage_provider\)\) = 's3'/);
    assert.match(sql, /LIMIT \$2/);
    assert.deepEqual(values, ["2023-01-01", 5]);
  });
});
