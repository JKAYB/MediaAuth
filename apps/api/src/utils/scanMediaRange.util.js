"use strict";

/**
 * Parse a single `Range: bytes=...` value (first range if comma-separated).
 * @param {string | undefined} rangeHeader
 * @param {number} totalSize
 * @returns {{ kind: 'full' } | { kind: 'partial'; start: number; end: number } | { kind: 'unsatisfiable' }}
 */
function parseBytesRange(rangeHeader, totalSize) {
  if (rangeHeader == null || rangeHeader === "") {
    return { kind: "full" };
  }
  if (!Number.isFinite(totalSize) || totalSize <= 0) {
    return { kind: "full" };
  }
  const raw = String(rangeHeader).trim();
  const m = raw.match(/^bytes=(.+)$/i);
  if (!m) {
    return { kind: "full" };
  }
  const spec = m[1].split(",")[0].trim();

  if (spec.startsWith("-")) {
    const len = Number(spec.slice(1));
    if (!Number.isFinite(len) || len < 1) {
      return { kind: "unsatisfiable" };
    }
    if (len >= totalSize) {
      return { kind: "full" };
    }
    return { kind: "partial", start: totalSize - len, end: totalSize - 1 };
  }

  const dash = spec.indexOf("-");
  if (dash < 0) {
    return { kind: "full" };
  }
  const left = spec.slice(0, dash);
  const right = spec.slice(dash + 1);
  if (left === "") {
    return { kind: "full" };
  }
  const start = Number(left);
  if (!Number.isFinite(start) || start < 0) {
    return { kind: "unsatisfiable" };
  }
  let end;
  if (right === "") {
    end = totalSize - 1;
  } else {
    end = Number(right);
    if (!Number.isFinite(end) || end < 0) {
      return { kind: "unsatisfiable" };
    }
  }
  if (end >= totalSize) {
    end = totalSize - 1;
  }
  if (start > end || start >= totalSize) {
    return { kind: "unsatisfiable" };
  }
  return { kind: "partial", start, end };
}

module.exports = { parseBytesRange };
