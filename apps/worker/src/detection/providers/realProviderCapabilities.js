function truthy(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

/**
 * Declares what the real provider will attempt for the current process env.
 * Used for early validation and startup logs (not sent upstream).
 */
function getRealProviderCapabilities() {
  return {
    supportsUrlInput: !truthy(process.env.DETECTION_REAL_DISALLOW_URL),
    supportsLocalFileInput: true,
    allowsLocalPathExposure: truthy(process.env.DETECTION_REAL_EXPOSE_LOCAL_PATH),
    allowsFullLocalPathInMetadata: truthy(process.env.DETECTION_REAL_EXPOSE_FULL_LOCAL_PATH),
    allowsMultipartUpload: truthy(process.env.DETECTION_REAL_SEND_FILE)
  };
}

module.exports = {
  truthy,
  getRealProviderCapabilities
};
