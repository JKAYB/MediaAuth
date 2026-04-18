const { runMockDetection } = require("../mockDetectionService");

/**
 * Mock / fallback provider — safe default for local dev and when no external API is configured.
 *
 * @type {{ id: string; detect: (input: import('../contract').ProviderInput) => Promise<import('../contract').ProviderResult> }}
 */
const mockProvider = {
  id: "mock",

  async detect(input) {
    const out = await runMockDetection(input);
    return {
      providerId: "mock",
      confidence: out.confidence,
      isAiGenerated: out.isAiGenerated,
      summary: out.summary,
      details: out.processorPayload
    };
  }
};

module.exports = { mockProvider };
