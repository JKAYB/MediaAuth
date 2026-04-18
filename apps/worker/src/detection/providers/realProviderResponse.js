const {
  ProviderAuthError,
  ProviderBadResponseError,
  ProviderRateLimitError,
  ProviderServerError,
  TemporaryProviderError
} = require("./realProviderErrors");

const SNIP = 400;

function safeSnippet(text, max = SNIP) {
  if (typeof text !== "string") return "";
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max)}…`;
}

/**
 * @param {string} text
 * @param {number} httpStatus
 * @returns {unknown}
 */
function parseJsonBodyOrThrow(text, httpStatus) {
  if (!text || !String(text).trim()) {
    throw new ProviderBadResponseError("Real provider returned an empty body", {
      httpStatus,
      snippet: ""
    });
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderBadResponseError(
      `Real provider returned non-JSON (HTTP ${httpStatus})`,
      { httpStatus, snippet: safeSnippet(text) }
    );
  }
}

/**
 * Strict validation of upstream JSON (before global normalize clamps confidence).
 *
 * @param {unknown} json
 * @param {{ httpStatus: number }} ctx
 * @returns {{ confidence: number; isAiGenerated: boolean; summary: string; details: Record<string, unknown> }}
 */
function validateAndMapUpstreamJson(json, ctx) {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    throw new ProviderBadResponseError("Real provider JSON must be a plain object", {
      httpStatus: ctx.httpStatus,
      snippet: safeSnippet(JSON.stringify(json))
    });
  }

  const o = /** @type {Record<string, unknown>} */ (json);

  const confidenceRaw = o.confidence != null ? o.confidence : o.score;
  if (confidenceRaw === undefined || confidenceRaw === null) {
    throw new ProviderBadResponseError("Real provider JSON missing confidence (or score)", {
      httpStatus: ctx.httpStatus,
      snippet: safeSnippet(JSON.stringify(json))
    });
  }
  const confidence = Number(confidenceRaw);
  if (!Number.isFinite(confidence)) {
    throw new ProviderBadResponseError("Real provider confidence must be a finite number", {
      httpStatus: ctx.httpStatus,
      snippet: safeSnippet(JSON.stringify(json))
    });
  }
  if (confidence < 0 || confidence > 100) {
    throw new ProviderBadResponseError(
      `Real provider confidence out of range [0,100]: ${confidence}`,
      { httpStatus: ctx.httpStatus, snippet: safeSnippet(JSON.stringify(json)) }
    );
  }

  const aiRaw = o.isAiGenerated != null ? o.isAiGenerated : o.is_ai_generated;
  if (typeof aiRaw !== "boolean") {
    throw new ProviderBadResponseError(
      "Real provider JSON must include boolean isAiGenerated (or is_ai_generated)",
      { httpStatus: ctx.httpStatus, snippet: safeSnippet(JSON.stringify(json)) }
    );
  }

  const summaryRaw = o.summary != null ? o.summary : o.message;
  if (typeof summaryRaw !== "string" || !summaryRaw.trim()) {
    throw new ProviderBadResponseError(
      "Real provider JSON must include non-empty string summary (or message)",
      { httpStatus: ctx.httpStatus, snippet: safeSnippet(JSON.stringify(json)) }
    );
  }

  let details = o.details;
  if (details != null && (typeof details !== "object" || Array.isArray(details))) {
    throw new ProviderBadResponseError("Real provider field details must be a plain object when present", {
      httpStatus: ctx.httpStatus,
      snippet: safeSnippet(JSON.stringify(json))
    });
  }
  if (!details || typeof details !== "object") {
    details = { upstreamKeys: Object.keys(o) };
  }

  return {
    confidence: Number(confidence.toFixed(2)),
    isAiGenerated: aiRaw,
    summary: summaryRaw.trim(),
    details: /** @type {Record<string, unknown>} */ (details)
  };
}

/**
 * @param {number} status
 * @param {unknown} json
 * @param {string} text
 */
function errorForHttpStatus(status, json, text) {
  const preview =
    typeof json === "object" && json && "error" in json
      ? String(/** @type {Record<string, unknown>} */ (json).error)
      : safeSnippet(text);

  if (status === 401 || status === 403) {
    return new ProviderAuthError(`Real provider auth failed (HTTP ${status})`, {
      httpStatus: status,
      snippet: preview
    });
  }
  if (status === 429) {
    return new ProviderRateLimitError(`Real provider rate limited (HTTP ${status})`, {
      httpStatus: status,
      snippet: preview
    });
  }
  if (status >= 500) {
    return new ProviderServerError(`Real provider server error (HTTP ${status})`, {
      httpStatus: status,
      snippet: preview
    });
  }
  if (status === 408) {
    return new TemporaryProviderError(`Real provider request timeout (HTTP ${status})`, {
      httpStatus: status,
      snippet: preview
    });
  }
  if (status >= 400) {
    return new ProviderBadResponseError(`Real provider rejected request (HTTP ${status})`, {
      httpStatus: status,
      snippet: preview
    });
  }
  return new TemporaryProviderError(`Real provider unexpected HTTP ${status}`, {
    httpStatus: status,
    snippet: preview
  });
}

/**
 * Optional JSON parse for error responses (HTML body is ignored).
 * @param {string} text
 * @returns {unknown | null}
 */
function tryParseJsonLoose(text) {
  const t = text && String(text).trim();
  if (!t || (t[0] !== "{" && t[0] !== "[")) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * @param {{ ok: boolean; status: number }} res
 * @param {string} text
 */
function throwIfHttpError(res, text) {
  if (res.ok) {
    return;
  }
  const json = tryParseJsonLoose(text);
  throw errorForHttpStatus(res.status, json, text);
}

module.exports = {
  safeSnippet,
  parseJsonBodyOrThrow,
  validateAndMapUpstreamJson,
  errorForHttpStatus,
  tryParseJsonLoose,
  throwIfHttpError
};
