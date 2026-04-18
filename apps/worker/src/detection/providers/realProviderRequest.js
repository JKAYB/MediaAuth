const fs = require("fs/promises");
const path = require("path");
const { getRealProviderCapabilities, truthy } = require("./realProviderCapabilities");
const {
  ConfigurationError,
  UnsupportedInputError,
  FileTooLargeError,
  FileMissingError,
  EmptyFileError
} = require("./realProviderErrors");

/**
 * @param {import('../contract').ProviderInput} input
 * @param {ReturnType<typeof getRealProviderCapabilities>} caps
 */
function assertInputSupported(input, caps) {
  if (input.sourceType === "url" && !caps.supportsUrlInput) {
    throw new UnsupportedInputError(
      "URL scans are disabled for the real provider (set DETECTION_REAL_DISALLOW_URL off, or use mock).",
      { snippet: input.scanId }
    );
  }

  const wantsMultipart = caps.allowsMultipartUpload;
  if (wantsMultipart && input.sourceType === "url") {
    throw new UnsupportedInputError(
      "DETECTION_REAL_SEND_FILE is enabled but this scan is a URL source (no local file to upload). Disable multipart or use an upload scan.",
      { snippet: input.scanId }
    );
  }

  if (wantsMultipart && input.legacyMetadataOnly) {
    throw new UnsupportedInputError(
      "DETECTION_REAL_SEND_FILE is enabled but this scan has no persisted file (legacy row).",
      { snippet: input.scanId }
    );
  }
}

/**
 * @param {import('../contract').ProviderInput} input
 */
function buildMetadata(input) {
  const meta = {
    scanId: input.scanId,
    userId: input.userId,
    sourceType: input.sourceType,
    sourceUrl: input.sourceUrl,
    storageKey: input.storageKey,
    originalFilename: input.originalFilename,
    mimeType: input.mimeType,
    fileSizeBytes: input.fileSizeBytes,
    legacyMetadataOnly: input.legacyMetadataOnly
  };
  const caps = getRealProviderCapabilities();
  if (caps.allowsLocalPathExposure && input.localPath) {
    if (caps.allowsFullLocalPathInMetadata) {
      meta.localPath = input.localPath;
    } else {
      meta.localPath = path.basename(input.localPath);
      meta.localPathBasenameOnly = true;
    }
  }
  return meta;
}

function requestHeaders(isMultipart) {
  /** @type {Record<string, string>} */
  const headers = {};
  const key = process.env.DETECTION_REAL_API_KEY?.trim();
  if (key) {
    headers.Authorization = `Bearer ${key}`;
  }
  if (!isMultipart) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

/**
 * @param {import('../contract').ProviderInput} input
 */
async function buildRequestPayload(input) {
  const url = process.env.DETECTION_REAL_URL?.trim();
  if (!url) {
    throw new ConfigurationError(
      "DETECTION_REAL_URL is not set. Point it at your analysis HTTP endpoint, or set DETECTION_PROVIDER=mock.",
      {}
    );
  }

  const caps = getRealProviderCapabilities();
  assertInputSupported(input, caps);

  const timeoutMs = Math.min(
    Math.max(Number.parseInt(process.env.DETECTION_REAL_TIMEOUT_MS || "120000", 10) || 120000, 1000),
    600000
  );

  const maxBytes = Math.min(
    Math.max(Number.parseInt(process.env.DETECTION_REAL_MAX_FILE_BYTES || "20971520", 10) || 20971520, 1),
    100 * 1024 * 1024
  );

  const meta = buildMetadata(input);
  let body;
  let isMultipart = false;
  let usedMultipart = false;
  let fileSizeBytes = 0;
  let localPathIncludedInMeta = Boolean(meta.localPath);

  if (caps.allowsMultipartUpload && input.localPath && !input.legacyMetadataOnly) {
    let stat;
    try {
      stat = await fs.stat(input.localPath);
    } catch (e) {
      if (/** @type {NodeJS.ErrnoException} */ (e).code === "ENOENT") {
        throw new FileMissingError("Local media file is missing on disk before upload.", {
          snippet: path.basename(input.localPath)
        });
      }
      throw new ConfigurationError(`Cannot stat local file: ${e.message}`, { snippet: path.basename(input.localPath) });
    }
    if (!stat.isFile()) {
      throw new FileMissingError("Local media path is not a regular file.", {
        snippet: path.basename(input.localPath)
      });
    }
    fileSizeBytes = stat.size;
    if (fileSizeBytes === 0) {
      throw new EmptyFileError("Local media file is empty; refusing to upload.", {
        snippet: path.basename(input.localPath)
      });
    }
    if (fileSizeBytes > maxBytes) {
      throw new FileTooLargeError(
        `File exceeds DETECTION_REAL_MAX_FILE_BYTES (${fileSizeBytes} > ${maxBytes})`,
        { snippet: String(fileSizeBytes) }
      );
    }

    const buf = await fs.readFile(input.localPath);
    if (buf.length !== fileSizeBytes) {
      throw new FileMissingError("Read size mismatch after stat; aborting upload.", {
        snippet: path.basename(input.localPath)
      });
    }

    const form = new FormData();
    form.append("metadata", JSON.stringify(meta));
    const mime = input.mimeType || "application/octet-stream";
    const name = input.originalFilename || "upload.bin";
    form.append("file", new Blob([buf], { type: mime }), name);
    body = form;
    isMultipart = true;
    usedMultipart = true;
  } else {
    body = JSON.stringify(meta);
  }

  return {
    url,
    body,
    isMultipart,
    headers: requestHeaders(isMultipart),
    timeoutMs,
    maxBytes,
    usedMultipart,
    fileSizeBytes,
    localPathIncludedInMeta,
    requestMode: usedMultipart ? "multipart" : "json"
  };
}

module.exports = {
  truthy,
  buildMetadata,
  buildRequestPayload,
  requestHeaders,
  assertInputSupported
};
