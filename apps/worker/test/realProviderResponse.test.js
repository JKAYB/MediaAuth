const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { UnrecoverableError } = require("bullmq");
const {
  parseJsonBodyOrThrow,
  validateAndMapUpstreamJson,
  safeSnippet
} = require("../src/detection/providers/realProviderResponse");
const { ProviderBadResponseError } = require("../src/detection/providers/realProviderErrors");

describe("realProviderResponse", () => {
  const http = 200;

  it("accepts valid object response", () => {
    const out = validateAndMapUpstreamJson(
      { confidence: 42.5, isAiGenerated: true, summary: "Looks synthetic", details: { a: 1 } },
      { httpStatus: http }
    );
    assert.equal(out.confidence, 42.5);
    assert.equal(out.isAiGenerated, true);
    assert.equal(out.summary, "Looks synthetic");
    assert.deepEqual(out.details, { a: 1 });
  });

  it("accepts aliases score, is_ai_generated, message", () => {
    const out = validateAndMapUpstreamJson(
      { score: 10, is_ai_generated: false, message: "Natural" },
      { httpStatus: http }
    );
    assert.equal(out.confidence, 10);
    assert.equal(out.isAiGenerated, false);
    assert.equal(out.summary, "Natural");
    assert.ok(Array.isArray(out.details.upstreamKeys));
  });

  it("rejects arrays", () => {
    assert.throws(() => validateAndMapUpstreamJson([], { httpStatus: http }), /plain object/);
  });

  it("rejects missing confidence", () => {
    assert.throws(
      () => validateAndMapUpstreamJson({ isAiGenerated: false, summary: "x" }, { httpStatus: http }),
      /missing confidence/
    );
  });

  it("rejects non-finite confidence", () => {
    assert.throws(
      () =>
        validateAndMapUpstreamJson(
          { confidence: Number.NaN, isAiGenerated: false, summary: "x" },
          { httpStatus: http }
        ),
      /finite number/
    );
  });

  it("rejects confidence outside 0..100", () => {
    assert.throws(
      () =>
        validateAndMapUpstreamJson(
          { confidence: 101, isAiGenerated: false, summary: "x" },
          { httpStatus: http }
        ),
      /out of range/
    );
    assert.throws(
      () =>
        validateAndMapUpstreamJson(
          { confidence: -0.01, isAiGenerated: false, summary: "x" },
          { httpStatus: http }
        ),
      /out of range/
    );
  });

  it("rejects missing boolean flag", () => {
    assert.throws(
      () => validateAndMapUpstreamJson({ confidence: 50, summary: "x" }, { httpStatus: http }),
      /boolean isAiGenerated/
    );
  });

  it("rejects string boolean", () => {
    assert.throws(
      () =>
        validateAndMapUpstreamJson(
          { confidence: 50, is_ai_generated: "true", summary: "x" },
          { httpStatus: http }
        ),
      /boolean isAiGenerated/
    );
  });

  it("rejects empty summary/message", () => {
    assert.throws(
      () =>
        validateAndMapUpstreamJson(
          { confidence: 50, isAiGenerated: false, summary: "   " },
          { httpStatus: http }
        ),
      /non-empty string summary/
    );
  });

  it("rejects non-object details", () => {
    assert.throws(
      () =>
        validateAndMapUpstreamJson(
          { confidence: 50, isAiGenerated: false, summary: "ok", details: [1] },
          { httpStatus: http }
        ),
      /plain object when present/
    );
  });

  it("defaults details safely when omitted", () => {
    const out = validateAndMapUpstreamJson(
      { confidence: 1, isAiGenerated: false, summary: "ok" },
      { httpStatus: http }
    );
    assert.ok(out.details && typeof out.details === "object");
    assert.ok(Array.isArray(out.details.upstreamKeys));
  });

  it("parseJsonBodyOrThrow rejects empty body", () => {
    assert.throws(() => parseJsonBodyOrThrow("", http), /empty body/);
  });

  it("parseJsonBodyOrThrow rejects invalid JSON (terminal bad response)", () => {
    assert.throws(
      () => parseJsonBodyOrThrow("not-json{", http),
      (e) => e instanceof ProviderBadResponseError && e instanceof UnrecoverableError
    );
  });

  it("safeSnippet truncates long text", () => {
    const s = safeSnippet("a".repeat(500));
    assert.ok(s.endsWith("…"));
    assert.ok(s.length < 500);
  });
});
