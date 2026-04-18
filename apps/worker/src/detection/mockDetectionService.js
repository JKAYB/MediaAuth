const fs = require("fs/promises");
const path = require("path");

/**
 * Placeholder media authenticity check. Invoked only via `providers/mockProvider`.
 * For new backends, add a provider module instead of calling this directly.
 *
 * @param {import('./contract').ProviderInput} input
 * @returns {Promise<{
 *   confidence: number;
 *   isAiGenerated: boolean;
 *   summary: string;
 *   processorPayload: Record<string, unknown>;
 * }>}
 */
async function runMockDetection(input) {
  const latencyMs = 400 + Math.floor(Math.random() * 900);
  await new Promise((resolve) => setTimeout(resolve, latencyMs));

  const confidence = Number((Math.random() * 100).toFixed(2));
  const isAiGenerated = confidence >= 50;
  const mimeType = input.mimeType || "application/octet-stream";
  const kind = mimeType.startsWith("video/")
    ? "video"
    : mimeType.startsWith("audio/")
      ? "audio"
      : mimeType.startsWith("image/")
        ? "image"
        : "media";

  let onDiskBytes = input.fileSizeBytes;
  if (input.localPath) {
    try {
      const st = await fs.stat(input.localPath);
      onDiskBytes = st.size;
    } catch {
      /* keep declared size */
    }
  }

  const sourceLabel =
    input.sourceType === "url"
      ? "URL"
      : input.legacyMetadataOnly
        ? "upload (legacy, no blob)"
        : "upload";

  const target =
    input.sourceType === "url" && input.sourceUrl
      ? input.sourceUrl
      : input.localPath
        ? path.basename(input.localPath)
        : input.originalFilename;

  const verdict = isAiGenerated ? "likely synthetic or heavily AI-assisted" : "consistent with natural capture";
  const summary = `Mock ${kind} scan (${sourceLabel}) "${target}" (${onDiskBytes} bytes): ${verdict} (confidence ${confidence}%).`;

  const processorPayload = {
    model: "mock-detector-v1",
    confidence,
    mimeType,
    fileSizeBytes: input.fileSizeBytes,
    onDiskBytes,
    sourceType: input.sourceType,
    legacyMetadataOnly: input.legacyMetadataOnly,
    localFileName: input.localPath ? path.basename(input.localPath) : null,
    sourceUrl: input.sourceUrl,
    latencyMs
  };

  return {
    confidence,
    isAiGenerated,
    summary,
    processorPayload
  };
}

module.exports = { runMockDetection };
