"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  buildStructuredScanRelativeKey,
  applyObjectKeyPrefix,
  stripObjectKeyPrefix,
  isStructuredOriginalScanRelativeKey,
  isStructuredOriginalScanStorageKey,
  plannedStructuredS3StorageKey,
  extensionForMimeType
} = require("../src/keyUtil");

describe("structured scan storage keys", () => {
  const uid = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee";
  const sid = "bbbbbbbb-bbbb-4ccc-dddd-ffffffffffff";

  it("builds original key from mime", () => {
    const k = buildStructuredScanRelativeKey({
      userId: uid,
      scanId: sid,
      mimeType: "image/png",
      kind: "original"
    });
    assert.equal(k, `scans/users/${uid}/${sid}/original/source.png`);
  });

  it("extensionForMimeType defaults for unknown", () => {
    assert.equal(extensionForMimeType("application/x-weird"), ".bin");
  });

  it("applies and strips prefix", () => {
    const rel = buildStructuredScanRelativeKey({
      userId: uid,
      scanId: sid,
      mimeType: "image/jpeg",
      kind: "original"
    });
    const full = applyObjectKeyPrefix("prod", rel);
    assert.equal(full, `prod/${rel}`);
    assert.equal(stripObjectKeyPrefix(full, "prod"), rel);
    assert.equal(stripObjectKeyPrefix(full, "prod/"), rel);
  });

  it("detects structured original relative and full keys", () => {
    const rel = `scans/users/${uid}/${sid}/original/source.jpg`;
    assert.equal(isStructuredOriginalScanRelativeKey(rel), true);
    assert.equal(isStructuredOriginalScanStorageKey(`my/${rel}`, "my"), true);
    assert.equal(isStructuredOriginalScanRelativeKey(`${uid}/x.png`), false);
  });

  it("plannedStructuredS3StorageKey matches row shape", () => {
    const row = { user_id: uid, id: sid, mime_type: "audio/mpeg" };
    assert.equal(
      plannedStructuredS3StorageKey(row, "p"),
      `p/scans/users/${uid}/${sid}/original/source.mp3`
    );
  });

  it("builds derived and metadata paths", () => {
    assert.equal(
      buildStructuredScanRelativeKey({
        userId: uid,
        scanId: sid,
        kind: "derived",
        assetName: "heatmap.png"
      }),
      `scans/users/${uid}/${sid}/derived/heatmap.png`
    );
    assert.equal(
      buildStructuredScanRelativeKey({
        userId: uid,
        scanId: sid,
        kind: "metadata",
        assetName: "result.json"
      }),
      `scans/users/${uid}/${sid}/metadata/result.json`
    );
  });

  it("rejects invalid asset names", () => {
    assert.throws(() =>
      buildStructuredScanRelativeKey({
        userId: uid,
        scanId: sid,
        kind: "derived",
        assetName: "../x"
      })
    );
  });
});
