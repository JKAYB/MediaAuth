/**
 * Strict MIME allow-lists for in-browser preview of user uploads (auth blob URL).
 * Broader types may still be downloaded from GET /scan/:id/media?download=1.
 */
const PREVIEW_IMAGE = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const PREVIEW_VIDEO = new Set(["video/mp4", "video/webm", "video/quicktime"]);

const PREVIEW_AUDIO = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
]);

export type StrictUploadPreviewKind = "image" | "video" | "audio";

/** Normalize MIME for comparisons (lowercase base type, strip parameters). */
export function normalizeMimeBase(mime: string | null | undefined): string {
  const t = (mime || "").trim().toLowerCase();
  if (!t) return "";
  return t.split(";")[0].trim();
}

/**
 * When `null`, the upload is not shown as image/video/audio preview (use file card + download).
 */
export function strictUploadPreviewKind(
  mime: string | null | undefined,
): StrictUploadPreviewKind | null {
  const m = normalizeMimeBase(mime);
  if (!m) return null;
  if (PREVIEW_IMAGE.has(m)) return "image";
  if (PREVIEW_VIDEO.has(m)) return "video";
  if (PREVIEW_AUDIO.has(m)) return "audio";
  return null;
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
