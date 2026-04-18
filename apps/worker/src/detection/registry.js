const { mockProvider } = require("./providers/mockProvider");
const { realProvider } = require("./providers/realProvider");

/**
 * Register detection providers here. Each must implement:
 *   `id: string`
 *   `detect(input: ProviderInput): Promise<Partial<ProviderResult> & { confidence, isAiGenerated: boolean|null, summary, details? }>`
 * Return values are normalized by `validate.normalizeProviderResult`.
 */
const providersById = {
  [mockProvider.id]: mockProvider,
  [realProvider.id]: realProvider
};

function normalizeEnvId(raw) {
  const s = String(raw || "mock")
    .trim()
    .toLowerCase();
  return s || "mock";
}

/**
 * Active provider id from `DETECTION_PROVIDER` (default `mock`). Unknown ids fall back to mock.
 */
function resolveActiveProviderId() {
  const wanted = normalizeEnvId(process.env.DETECTION_PROVIDER);
  if (!providersById[wanted]) {
    console.warn(
      `[detection] DETECTION_PROVIDER="${wanted}" is not registered; using "${mockProvider.id}"`
    );
    return mockProvider.id;
  }
  return wanted;
}

function getProvider(providerId) {
  return providersById[providerId] || mockProvider;
}

module.exports = {
  providersById,
  resolveActiveProviderId,
  getProvider
};
