const path = require("path");

/**
 * @param {string} name
 */
function safeOriginalSegment(name) {
  const base = path.basename(String(name || "upload")).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  return base || "file.bin";
}

/**
 * @param {{ scanId: string; originalName: string; prefix?: string }} params
 * @returns {{ objectKey: string; segment: string }}
 * @deprecated For new uploads prefer {@link buildStructuredScanRelativeKey} + {@link applyObjectKeyPrefix}.
 */
function buildObjectKey({ scanId, originalName, prefix = "" }) {
  const segment = safeOriginalSegment(originalName);
  const p = prefix && prefix.trim() ? prefix.replace(/\/?$/, "/") : "";
  const objectKey = `${p}${scanId}/${segment}`;
  return { objectKey, segment };
}

/** @param {string} id */
function assertUuid(id, label = "id") {
  const s = String(id || "").trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s)) {
    throw new Error(`Invalid ${label} (expected UUID): ${String(id)}`);
  }
  return s;
}

const MIME_TO_EXT = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/webm": ".webm",
  "audio/mp4": ".m4a",
  "audio/aac": ".aac",
  "audio/ogg": ".ogg",
  "audio/flac": ".flac",
  "audio/alac": ".alac",
  "application/octet-stream": ".bin",
  "text/plain": ".txt"
};

/**
 * Extension for stored original object (`source{ext}`), derived from MIME type.
 * @param {string | null | undefined} mimeType
 * @returns {string}
 */
function extensionForMimeType(mimeType) {
  const m = String(mimeType || "")
    .trim()
    .toLowerCase();
  if (MIME_TO_EXT[m]) {
    return MIME_TO_EXT[m];
  }
  return ".bin";
}

/**
 * @typedef {'original' | 'derived' | 'metadata'} ScanStorageAssetKind
 */

/**
 * Deterministic object key (no bucket prefix) for scan media layout:
 * - `scans/users/{userId}/{scanId}/original/source{ext}`
 * - `scans/users/{userId}/{scanId}/derived/{assetName}`
 * - `scans/users/{userId}/{scanId}/metadata/{assetName}`
 *
 * @param {{ userId: string; scanId: string; mimeType?: string | null; kind: ScanStorageAssetKind; assetName?: string }} params
 * @returns {string}
 */
function buildStructuredScanRelativeKey(params) {
  const userId = assertUuid(params.userId, "userId");
  const scanId = assertUuid(params.scanId, "scanId");
  const kind = params.kind;
  if (kind === "original") {
    const ext = extensionForMimeType(params.mimeType);
    return `scans/users/${userId}/${scanId}/original/source${ext}`;
  }
  if (kind === "derived" || kind === "metadata") {
    const asset = String(params.assetName || "").trim();
    if (!asset || asset.includes("/") || asset.includes("..")) {
      throw new Error(`assetName is required and must be a single path segment (${kind})`);
    }
    if (!/^[A-Za-z0-9._-]+$/.test(asset)) {
      throw new Error(`assetName contains invalid characters: ${asset}`);
    }
    return `scans/users/${userId}/${scanId}/${kind}/${asset}`;
  }
  throw new Error(`Unknown scan storage kind: ${kind}`);
}

/**
 * Prefix used by {@link S3ScanStorage} (`OBJECT_STORAGE_PREFIX`).
 * @param {string} [objectStoragePrefix]
 * @param {string} relativeKey from {@link buildStructuredScanRelativeKey}
 */
function applyObjectKeyPrefix(objectStoragePrefix, relativeKey) {
  const rawPref = String(objectStoragePrefix || "").trim();
  const pref = rawPref ? rawPref.replace(/\/?$/, "/") : "";
  const k = String(relativeKey || "")
    .trim()
    .replace(/^\//, "");

  if (!k) {
    throw new Error("relativeKey is required");
  }
  if (!pref) {
    return k;
  }
  return `${pref}${k}`;
}

/**
 * Strip leading OBJECT_STORAGE_PREFIX from a DB `storage_key` when present.
 * @param {string} dbStorageKey
 * @param {string} objectStoragePrefix
 * @returns {string}
 */
function stripObjectKeyPrefix(dbStorageKey, objectStoragePrefix) {
  const sk = String(dbStorageKey || "").trim();
  const pref = String(objectStoragePrefix || "").trim().replace(/\/?$/, "/");
  if (!pref) {
    return sk;
  }
  if (sk.startsWith(pref)) {
    return sk.slice(pref.length);
  }
  return sk;
}

const STRUCTURED_ORIGINAL_REL_RE =
  /^scans\/users\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/original\/source\.[a-z0-9]+$/i;

/**
 * Whether `relativeKey` (after stripping optional S3 prefix) is a structured original upload key.
 * @param {string} relativeKey
 */
function isStructuredOriginalScanRelativeKey(relativeKey) {
  return STRUCTURED_ORIGINAL_REL_RE.test(String(relativeKey || "").trim());
}

/**
 * @param {string} dbStorageKey full key as stored (may include OBJECT_STORAGE_PREFIX)
 * @param {string} objectStoragePrefix
 */
function isStructuredOriginalScanStorageKey(dbStorageKey, objectStoragePrefix) {
  const rel = stripObjectKeyPrefix(dbStorageKey, objectStoragePrefix);
  return isStructuredOriginalScanRelativeKey(rel);
}

/**
 * Full S3 object key (including {@link applyObjectKeyPrefix}) for a scan's original upload.
 * @param {{ user_id: unknown; id: unknown; mime_type?: unknown }} row
 * @param {string} objectStoragePrefix
 */
function plannedStructuredS3StorageKey(row, objectStoragePrefix) {
  const rel = buildStructuredScanRelativeKey({
    userId: String(row.user_id),
    scanId: String(row.id),
    mimeType: row.mime_type == null ? null : String(row.mime_type),
    kind: "original"
  });
  return applyObjectKeyPrefix(objectStoragePrefix, rel);
}

module.exports = {
  safeOriginalSegment,
  buildObjectKey,
  assertUuid,
  extensionForMimeType,
  buildStructuredScanRelativeKey,
  applyObjectKeyPrefix,
  stripObjectKeyPrefix,
  isStructuredOriginalScanRelativeKey,
  isStructuredOriginalScanStorageKey,
  plannedStructuredS3StorageKey,
  MIME_TO_EXT
};
