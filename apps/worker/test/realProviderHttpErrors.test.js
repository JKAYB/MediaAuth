const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { UnrecoverableError } = require("bullmq");
const { errorForHttpStatus, throwIfHttpError } = require("../src/detection/providers/realProviderResponse");
const {
  ProviderAuthError,
  ProviderRateLimitError,
  ProviderServerError,
  ProviderBadResponseError,
  TemporaryProviderError,
  ConfigurationError
} = require("../src/detection/providers/realProviderErrors");
const { isTerminal, isRetryable } = require("./helpers/classify");

describe("typed real-provider errors (retry vs terminal)", () => {
  it("ConfigurationError is terminal", () => {
    const e = new ConfigurationError("bad config", {});
    assert.ok(isTerminal(e));
  });
});

describe("errorForHttpStatus / throwIfHttpError classification", () => {
  it("401 -> ProviderAuthError terminal", () => {
    const e = errorForHttpStatus(401, null, "nope");
    assert.ok(e instanceof ProviderAuthError);
    assert.ok(e instanceof UnrecoverableError);
    assert.equal(e.code, "REAL_PROVIDER_AUTH");
    assert.ok(isTerminal(e));
  });

  it("403 -> terminal auth", () => {
    const e = errorForHttpStatus(403, { error: "denied" }, "{}");
    assert.ok(e instanceof ProviderAuthError);
    assert.ok(isTerminal(e));
  });

  it("429 -> ProviderRateLimitError retryable", () => {
    const e = errorForHttpStatus(429, null, "slow down");
    assert.ok(e instanceof ProviderRateLimitError);
    assert.ok(isRetryable(e));
    assert.equal(e.code, "REAL_PROVIDER_RATE_LIMIT");
  });

  it("408 -> TemporaryProviderError retryable", () => {
    const e = errorForHttpStatus(408, null, "timeout");
    assert.ok(e instanceof TemporaryProviderError);
    assert.ok(isRetryable(e));
  });

  it("503 -> ProviderServerError retryable", () => {
    const e = errorForHttpStatus(503, null, "html");
    assert.ok(e instanceof ProviderServerError);
    assert.ok(isRetryable(e));
  });

  it("502 -> ProviderServerError retryable", () => {
    const e = errorForHttpStatus(502, null, "bad gateway");
    assert.ok(e instanceof ProviderServerError);
    assert.ok(isRetryable(e));
  });

  it("400 -> ProviderBadResponseError terminal", () => {
    const e = errorForHttpStatus(400, { error: "bad" }, "{}");
    assert.ok(e instanceof ProviderBadResponseError);
    assert.ok(isTerminal(e));
  });

  it("throwIfHttpError does not throw on ok", () => {
    assert.doesNotThrow(() => throwIfHttpError({ ok: true, status: 200 }, "{}"));
  });

  it("throwIfHttpError throws on 429", () => {
    assert.throws(
      () => throwIfHttpError({ ok: false, status: 429 }, "wait"),
      (e) => e instanceof ProviderRateLimitError && isRetryable(e)
    );
  });

  it("unexpected 3xx maps to TemporaryProviderError retryable", () => {
    const e = errorForHttpStatus(301, null, "moved");
    assert.ok(e instanceof TemporaryProviderError);
    assert.ok(isRetryable(e));
  });
});
