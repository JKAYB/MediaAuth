"use strict";

/**
 * Provider-agnostic dashboard categories for "detection mix" and similar widgets.
 * Extend mapping here when new providers need nuanced rules (e.g. read normalized fields
 * from `result_payload`) — keep controllers free of vendor checks.
 *
 * @typedef {"authentic" | "suspicious" | "manipulated"} DetectionMixCategory
 */

/** Stable ordering for API responses */
const DETECTION_MIX_KEYS = /** @type {const} */ (["authentic", "suspicious", "manipulated"]);

const DETECTION_MIX_LABELS = {
  authentic: "Authentic",
  suspicious: "Suspicious",
  manipulated: "Manipulated"
};

/**
 * Map a scan row to a mix category. Only **completed** and **failed** scans participate;
 * pending/processing are excluded (no final verdict).
 *
 * @param {{ status: string; is_ai_generated: boolean | null }} row
 * @returns {DetectionMixCategory | null}
 */
function classifyScanForMix(row) {
  const status = String(row.status || "").toLowerCase();
  if (status !== "completed" && status !== "failed") {
    return null;
  }
  if (status === "failed") {
    return "suspicious";
  }
  if (row.is_ai_generated === true) {
    return "manipulated";
  }
  if (row.is_ai_generated === false) {
    return "authentic";
  }
  return "suspicious";
}

/**
 * Optional future hook: derive category from normalized `result_payload` when present.
 * Currently unused; keeps extension point in one module.
 *
 * @param {unknown} _resultPayload
 * @returns {DetectionMixCategory | null}
 */
function classifyFromResultPayload(_resultPayload) {
  return null;
}

module.exports = {
  DETECTION_MIX_KEYS,
  DETECTION_MIX_LABELS,
  classifyScanForMix,
  classifyFromResultPayload
};
