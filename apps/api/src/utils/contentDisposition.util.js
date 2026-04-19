"use strict";

/**
 * Build a safe RFC 6266-style Content-Disposition value (ASCII filename= only).
 * @param {"inline" | "attachment"} disposition
 * @param {string} rawName
 * @returns {string}
 */
function buildContentDisposition(disposition, rawName) {
  const base =
    typeof rawName === "string" && rawName.trim()
      ? rawName.trim().replace(/[\r\n\x00-\x1f\\"]/g, "_").slice(0, 200)
      : "upload";
  const safe = base || "upload";
  return `${disposition}; filename="${safe}"`;
}

/**
 * @param {unknown} queryValue - req.query.download
 * @returns {boolean}
 */
function wantsAttachmentDownload(queryValue) {
  if (queryValue == null) return false;
  if (Array.isArray(queryValue)) return wantsAttachmentDownload(queryValue[0]);
  if (typeof queryValue === "boolean") return queryValue;
  const s = String(queryValue).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "download";
}

module.exports = {
  buildContentDisposition,
  wantsAttachmentDownload
};
