const { UnrecoverableError } = require("bullmq");
const {
  ConfigurationError,
  ProviderTimeoutError,
  TemporaryProviderError
} = require("./realProviderErrors");
const { buildRequestPayload } = require("./realProviderRequest");
const {
  parseJsonBodyOrThrow,
  validateAndMapUpstreamJson,
  throwIfHttpError
} = require("./realProviderResponse");
const { detectRealityDefender, normalizeVendor } = require("./realityDefenderAdapter");

const LOG = "[real-provider]";

/**
 * HTTP adapter (`id: "real"`).
 *
 * Modes:
 * - **Generic** (default): `DETECTION_REAL_URL` JSON/multipart — see `realProviderRequest.js`.
 * - **Reality Defender**: `DETECTION_REAL_VENDOR=reality_defender` + `REALITY_DEFENDER_API_KEY` (+ optional `REALITY_DEFENDER_BASE_URL`).
 *
 * Env: DETECTION_REAL_VENDOR, DETECTION_REAL_URL, DETECTION_REAL_API_KEY, DETECTION_REAL_TIMEOUT_MS,
 * DETECTION_REAL_SEND_FILE, DETECTION_REAL_MAX_FILE_BYTES, DETECTION_REAL_DISALLOW_URL,
 * DETECTION_REAL_EXPOSE_LOCAL_PATH (basename unless DETECTION_REAL_EXPOSE_FULL_LOCAL_PATH).
 */

function logEvent(payload) {
  console.info(`${LOG} ${JSON.stringify(payload)}`);
}

function classifyNetworkError(err, timeoutMs) {
  if (err && err.name === "AbortError") {
    return new ProviderTimeoutError(`Request timed out after ${timeoutMs}ms`, { snippet: "abort" });
  }
  return new TemporaryProviderError(`Network error: ${err && err.message ? err.message : "unknown"}`, {
    snippet: err && err.name ? err.name : undefined
  });
}

function isRetryable(err) {
  if (!err) return true;
  if (err instanceof UnrecoverableError) {
    return false;
  }
  if (typeof err.retryable === "boolean") {
    return err.retryable;
  }
  return true;
}

const realProvider = {
  id: "real",

  /**
   * @param {import('../contract').ProviderInput} input
   */
  async detect(input) {
    const vendor = normalizeVendor(process.env.DETECTION_REAL_VENDOR);
    if (vendor && vendor !== "reality_defender") {
      throw new ConfigurationError(
        `DETECTION_REAL_VENDOR="${String(process.env.DETECTION_REAL_VENDOR).trim()}" is not supported. Use "reality_defender" or leave unset for the generic DETECTION_REAL_URL integration.`,
        { snippet: vendor }
      );
    }

    if (vendor === "reality_defender") {
      const started = Date.now();
      logEvent({
        event: "real_provider_request_start",
        provider: "real",
        vendor: "reality_defender",
        scanId: input.scanId,
        sourceType: input.sourceType,
        retryableHint: "see outcome log"
      });
      try {
        const out = await detectRealityDefender(input);
        logEvent({
          event: "real_provider_request_ok",
          provider: "real",
          vendor: "reality_defender",
          scanId: input.scanId,
          sourceType: input.sourceType,
          durationMs: Date.now() - started,
          retryable: false
        });
        return out;
      } catch (err) {
        logEvent({
          event: "real_provider_request_failed",
          provider: "real",
          vendor: "reality_defender",
          scanId: input.scanId,
          sourceType: input.sourceType,
          durationMs: Date.now() - started,
          code: err && err.code,
          retryable: isRetryable(err),
          message: err && err.message
        });
        throw err;
      }
    }

    const started = Date.now();
    const req = await buildRequestPayload(input);

    logEvent({
      event: "real_provider_request_start",
      provider: "real",
      scanId: input.scanId,
      sourceType: input.sourceType,
      requestMode: req.requestMode,
      usedMultipart: req.usedMultipart,
      localPathInMetadata: req.localPathIncludedInMeta,
      fileBytes: req.usedMultipart ? req.fileSizeBytes : undefined,
      timeoutMs: req.timeoutMs,
      retryableHint: "see outcome log"
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), req.timeoutMs);

    let res;
    try {
      res = await fetch(req.url, {
        method: "POST",
        headers: req.headers,
        body: req.body,
        signal: controller.signal
      });
    } catch (e) {
      const err = classifyNetworkError(e, req.timeoutMs);
      logEvent({
        event: "real_provider_request_failed",
        provider: "real",
        scanId: input.scanId,
        sourceType: input.sourceType,
        requestMode: req.requestMode,
        usedMultipart: req.usedMultipart,
        durationMs: Date.now() - started,
        httpStatus: null,
        code: err.code,
        retryable: isRetryable(err),
        message: err.message
      });
      throw err;
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    const durationMs = Date.now() - started;

    try {
      throwIfHttpError(res, text);
    } catch (err) {
      logEvent({
        event: "real_provider_request_failed",
        provider: "real",
        scanId: input.scanId,
        sourceType: input.sourceType,
        requestMode: req.requestMode,
        usedMultipart: req.usedMultipart,
        durationMs,
        httpStatus: res.status,
        code: err.code,
        retryable: isRetryable(err),
        message: err.message
      });
      throw err;
    }

    const parsed = parseJsonBodyOrThrow(text, res.status);
    const mapped = validateAndMapUpstreamJson(parsed, { httpStatus: res.status });
    const providerRequestId =
      typeof parsed === "object" && parsed && "request_id" in parsed && typeof parsed.request_id === "string"
        ? parsed.request_id
        : undefined;

    logEvent({
      event: "real_provider_request_ok",
      provider: "real",
      scanId: input.scanId,
      sourceType: input.sourceType,
      requestMode: req.requestMode,
      usedMultipart: req.usedMultipart,
      durationMs,
      httpStatus: res.status,
      retryable: false
    });

    return {
      providerId: "real",
      confidence: mapped.confidence,
      isAiGenerated: mapped.isAiGenerated,
      summary: mapped.summary,
      details: {
        ...mapped.details,
        httpStatus: res.status,
        requestMode: req.requestMode,
        usedMultipart: req.usedMultipart,
        timedOut: false,
        durationMs,
        ...(providerRequestId ? { providerRequestId } : {})
      }
    };
  }
};

module.exports = { realProvider };
