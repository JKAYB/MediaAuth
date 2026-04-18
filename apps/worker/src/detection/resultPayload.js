const { PAYLOAD_VERSION } = require("./contract");

/**
 * @param {import('./contract').ProviderResult} detection
 */
function buildResultPayload(detection) {
  return {
    version: PAYLOAD_VERSION,
    primaryProvider: detection.providerId,
    processors: {
      [detection.providerId]: detection.details
    }
  };
}

module.exports = { buildResultPayload };
