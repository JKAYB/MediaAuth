const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { pipeline } = require("stream/promises");

/**
 * Streams object bytes to a unique temp file (0600). Caller should unlink when done.
 * @param {{ readStream: import('stream').Readable; scanId: string; filenameHint?: string }} params
 * @returns {Promise<string>} absolute path
 */
async function materializeDownloadStreamToTempFile({ readStream, scanId, filenameHint }) {
  const ext = path.extname(String(filenameHint || "")) || ".bin";
  const safeExt = ext.length <= 16 ? ext : ".bin";
  const rand = crypto.randomBytes(8).toString("hex");
  const base = `mediaauth-scan-${scanId}-${rand}${safeExt}`;
  const dest = path.join(os.tmpdir(), base);
  try {
    await pipeline(readStream, fs.createWriteStream(dest, { flags: "wx", mode: 0o600 }));
    return dest;
  } catch (e) {
    await safeUnlink(dest);
    throw e;
  }
}

/**
 * @param {string | null | undefined} p
 */
async function safeUnlink(p) {
  if (!p) {
    return;
  }
  await fs.promises.unlink(p).catch(() => {});
}

module.exports = {
  materializeDownloadStreamToTempFile,
  safeUnlink
};
