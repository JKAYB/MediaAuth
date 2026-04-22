"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  parseMigrateS3KeysCli,
  classifyRowForS3StructuredMigration,
  plannedStructuredS3StorageKey
} = require("../src/scripts/migrateS3ScanKeys.lib");

describe("migrateS3ScanKeys.lib", () => {
  it("defaults to dry-run when no mode flag", () => {
    const o = parseMigrateS3KeysCli([]);
    assert.equal(o.dryRun, true);
    assert.equal(o.execute, false);
  });

  it("parses --execute and --delete-old-objects", () => {
    const o = parseMigrateS3KeysCli(["--execute", "--delete-old-objects", "--limit", "3"]);
    assert.equal(o.execute, true);
    assert.equal(o.dryRun, false);
    assert.equal(o.deleteOldObjects, true);
    assert.equal(o.limit, 3);
  });

  it("rejects --delete-old-objects without --execute", () => {
    assert.throws(() => parseMigrateS3KeysCli(["--delete-old-objects"]), /requires --execute/);
  });

  it("classifyRowForS3StructuredMigration", () => {
    const uid = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee";
    const sid = "bbbbbbbb-bbbb-4ccc-dddd-ffffffffffff";
    assert.equal(
      classifyRowForS3StructuredMigration({ user_id: null, storage_key: "a/b" }, "").ok,
      false
    );
    assert.equal(
      classifyRowForS3StructuredMigration(
        {
          user_id: uid,
          id: sid,
          storage_key: `scans/users/${uid}/${sid}/original/source.png`
        },
        ""
      ).ok,
      false
    );
    assert.equal(
      classifyRowForS3StructuredMigration(
        { user_id: uid, id: sid, storage_key: `${sid}/old.png` },
        ""
      ).ok,
      true
    );
  });

  it("plannedStructuredS3StorageKey is re-exported", () => {
    const uid = "cccccccc-cccc-4ccc-cccc-cccccccccccc";
    const sid = "dddddddd-dddd-4ddd-dddd-dddddddddddd";
    const k = plannedStructuredS3StorageKey(
      { user_id: uid, id: sid, mime_type: "image/webp" },
      "pre"
    );
    assert.ok(k.includes("source.webp"));
  });
});
