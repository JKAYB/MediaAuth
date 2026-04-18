/**
 * Detection provider contracts (JSDoc types for CommonJS).
 *
 * @typedef {import('../services/scanSource').ScanMediaInput & {
 *   scanId: string;
 *   userId: string | null;
 * }} ProviderInput
 */

/**
 * Normalized output every provider must produce (before optional enrichment).
 *
 * @typedef {object} ProviderResult
 * @property {string} providerId Stable id, e.g. "mock"
 * @property {number} confidence 0–100
 * @property {boolean | null} isAiGenerated Null = inconclusive (e.g. Reality Defender SUSPICIOUS / UNABLE_TO_EVALUATE)
 * @property {string} summary Human-readable outcome
 * @property {Record<string, unknown>} details Provider-specific payload stored under result_payload.processors[id]
 */

const PAYLOAD_VERSION = 2;

module.exports = {
  PAYLOAD_VERSION
};
