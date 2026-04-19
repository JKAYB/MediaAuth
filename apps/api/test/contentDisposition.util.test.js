"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  buildContentDisposition,
  wantsAttachmentDownload
} = require("../src/utils/contentDisposition.util");

test("buildContentDisposition escapes quotes and newlines", () => {
  assert.equal(
    buildContentDisposition("inline", 'a"b\n.png'),
    'inline; filename="a_b_.png"'
  );
});

test("wantsAttachmentDownload", () => {
  assert.equal(wantsAttachmentDownload(undefined), false);
  assert.equal(wantsAttachmentDownload("0"), false);
  assert.equal(wantsAttachmentDownload("1"), true);
  assert.equal(wantsAttachmentDownload("true"), true);
  assert.equal(wantsAttachmentDownload("YES"), true);
  assert.equal(wantsAttachmentDownload("download"), true);
});
