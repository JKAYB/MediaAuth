"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { parseBytesRange } = require("../src/utils/scanMediaRange.util");

describe("parseBytesRange", () => {
  it("returns full when header missing", () => {
    assert.deepEqual(parseBytesRange(undefined, 100), { kind: "full" });
  });

  it("parses bytes=0-9", () => {
    assert.deepEqual(parseBytesRange("bytes=0-9", 100), { kind: "partial", start: 0, end: 9 });
  });

  it("parses bytes=0- as through end", () => {
    assert.deepEqual(parseBytesRange("bytes=0-", 100), { kind: "partial", start: 0, end: 99 });
  });

  it("parses suffix bytes=-5", () => {
    assert.deepEqual(parseBytesRange("bytes=-5", 100), { kind: "partial", start: 95, end: 99 });
  });

  it("suffix covering whole file becomes full", () => {
    assert.deepEqual(parseBytesRange("bytes=-200", 100), { kind: "full" });
  });

  it("returns unsatisfiable when start past end", () => {
    assert.deepEqual(parseBytesRange("bytes=50-40", 100), { kind: "unsatisfiable" });
  });

  it("returns unsatisfiable when start >= totalSize", () => {
    assert.deepEqual(parseBytesRange("bytes=100-200", 100), { kind: "unsatisfiable" });
  });

  it("clips end to totalSize - 1", () => {
    assert.deepEqual(parseBytesRange("bytes=0-500", 100), { kind: "partial", start: 0, end: 99 });
  });
});
