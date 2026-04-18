/**
 * @param {unknown} raw
 * @param {string} providerId
 * @returns {import('./contract').ProviderResult}
 */
function normalizeProviderResult(raw, providerId) {
  if (!raw || typeof raw !== "object") {
    throw new Error(`Provider "${providerId}" returned an invalid result`);
  }

  const r = /** @type {Record<string, unknown>} */ (raw);
  const confidence = Number(r.confidence);
  if (!Number.isFinite(confidence)) {
    throw new Error(`Provider "${providerId}" returned a non-finite confidence`);
  }

  const clamped = Math.max(0, Math.min(100, confidence));
  if (r.isAiGenerated !== null && typeof r.isAiGenerated !== "boolean") {
    throw new Error(`Provider "${providerId}" must set isAiGenerated (boolean) or null for inconclusive`);
  }

  const summary = typeof r.summary === "string" ? r.summary.trim() : "";
  if (!summary) {
    throw new Error(`Provider "${providerId}" must set a non-empty summary string`);
  }

  let details = r.details;
  if ((!details || typeof details !== "object" || Array.isArray(details)) && r.processorPayload) {
    details = r.processorPayload;
  }
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    details = {};
  }

  return {
    providerId,
    confidence: Number(clamped.toFixed(2)),
    isAiGenerated: r.isAiGenerated,
    summary,
    details: /** @type {Record<string, unknown>} */ (details)
  };
}

module.exports = { normalizeProviderResult };
