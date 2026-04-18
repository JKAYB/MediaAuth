const { getRealProviderCapabilities } = require("./providers/realProviderCapabilities");

const LOG = "[real-provider:health]";

/**
 * @returns {{ ok: boolean; active: boolean; issues: string[]; caps: ReturnType<typeof getRealProviderCapabilities> }}
 */
function validateRealProviderEnv() {
  const caps = getRealProviderCapabilities();
  const active = String(process.env.DETECTION_PROVIDER || "")
    .trim()
    .toLowerCase() === "real";

  if (!active) {
    return { ok: true, active: false, issues: [], caps };
  }

  const issues = [];
  const vendorRaw = process.env.DETECTION_REAL_VENDOR?.trim();
  const vendor = vendorRaw
    ? String(vendorRaw)
        .toLowerCase()
        .replace(/-/g, "_")
    : "";

  if (vendor && vendor !== "reality_defender") {
    issues.push(
      `DETECTION_REAL_VENDOR="${vendorRaw}" is not supported (use reality_defender or leave unset for generic HTTP)`
    );
  }

  if (vendor === "reality_defender") {
    if (!process.env.REALITY_DEFENDER_API_KEY?.trim()) {
      issues.push("REALITY_DEFENDER_API_KEY is not set (required for DETECTION_REAL_VENDOR=reality_defender)");
    }
    try {
      const b = process.env.REALITY_DEFENDER_BASE_URL?.trim();
      if (b) void new URL(b);
    } catch {
      issues.push("REALITY_DEFENDER_BASE_URL is not a valid URL");
    }
  } else if (!process.env.DETECTION_REAL_URL?.trim()) {
    issues.push("DETECTION_REAL_URL is not set (required when DETECTION_PROVIDER=real and Reality Defender is not selected)");
  }

  return { ok: issues.length === 0, active: true, issues, caps };
}

function logRealProviderReadiness() {
  const v = validateRealProviderEnv();
  const line = {
    event: "real_provider_readiness",
    active: v.active,
    ok: v.ok,
    issues: v.issues,
    capabilities: v.caps,
    hasApiKey: Boolean(process.env.DETECTION_REAL_API_KEY?.trim()),
    hasRealityDefenderApiKey: Boolean(process.env.REALITY_DEFENDER_API_KEY?.trim()),
    detectionRealVendor: process.env.DETECTION_REAL_VENDOR?.trim() || null,
    timeoutMsDefault: Number.parseInt(process.env.DETECTION_REAL_TIMEOUT_MS || "120000", 10) || 120000
  };
  if (!v.active) {
    console.info(`${LOG} ${JSON.stringify({ ...line, note: "DETECTION_PROVIDER is not real; skipping config check" })}`);
    return;
  }
  if (v.ok) {
    console.info(`${LOG} ${JSON.stringify(line)}`);
  } else {
    console.warn(`${LOG} ${JSON.stringify(line)}`);
  }
}

module.exports = {
  validateRealProviderEnv,
  logRealProviderReadiness
};
