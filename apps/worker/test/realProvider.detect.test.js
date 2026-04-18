const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { UnrecoverableError } = require("bullmq");
const { withEnv } = require("./helpers/env");
const { isTerminal, isRetryable } = require("./helpers/classify");
const { realProvider } = require("../src/detection/providers/realProvider");
const {
  ProviderAuthError,
  ProviderRateLimitError,
  ProviderTimeoutError,
  ProviderBadResponseError
} = require("../src/detection/providers/realProviderErrors");

const baseInput = () => ({
  scanId: "cccccccc-dddd-eeee-ffff-000000000001",
  userId: "dddddddd-eeee-ffff-0000-111111111111",
  sourceType: "upload",
  sourceUrl: null,
  localPath: null,
  storageKey: "cccccccc-dddd-eeee-ffff-000000000001/x.bin",
  originalFilename: "x.bin",
  mimeType: "application/octet-stream",
  fileSizeBytes: 10,
  legacyMetadataOnly: false
});

describe("realProvider.detect with mocked fetch", () => {
  let originalFetch;
  let originalInfo;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalInfo = console.info;
    console.info = () => {};
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    console.info = originalInfo;
  });

  it("successful JSON mode returns normalized shape", async () => {
    await withEnv({ DETECTION_REAL_URL: "http://127.0.0.1:9/detect" }, async () => {
      globalThis.fetch = async (url, opts) => {
        assert.match(String(url), /127\.0\.0\.1:9\/detect/);
        assert.equal(opts.method, "POST");
        assert.equal(opts.headers["Content-Type"], "application/json");
        const body = JSON.parse(String(opts.body));
        assert.equal(body.scanId, "cccccccc-dddd-eeee-ffff-000000000001");
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              confidence: 12.34,
              is_ai_generated: false,
              message: "ok",
              request_id: "req-abc"
            })
        };
      };

      const out = await realProvider.detect(baseInput());
      assert.equal(out.providerId, "real");
      assert.equal(out.confidence, 12.34);
      assert.equal(out.isAiGenerated, false);
      assert.equal(out.summary, "ok");
      assert.equal(out.details.requestMode, "json");
      assert.equal(out.details.usedMultipart, false);
      assert.equal(out.details.httpStatus, 200);
      assert.equal(out.details.providerRequestId, "req-abc");
    });
  });

  it("429 maps to retryable ProviderRateLimitError", async () => {
    await withEnv({ DETECTION_REAL_URL: "http://127.0.0.1:9/detect" }, async () => {
      globalThis.fetch = async () => ({
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ error: "slow" })
      });

      await assert.rejects(
        async () => realProvider.detect(baseInput()),
        (e) => e instanceof ProviderRateLimitError && isRetryable(e) && e.code === "REAL_PROVIDER_RATE_LIMIT"
      );
    });
  });

  it("401 maps to terminal ProviderAuthError", async () => {
    await withEnv({ DETECTION_REAL_URL: "http://127.0.0.1:9/detect" }, async () => {
      globalThis.fetch = async () => ({
        ok: false,
        status: 401,
        text: async () => "{}"
      });

      await assert.rejects(
        async () => realProvider.detect(baseInput()),
        (e) => e instanceof ProviderAuthError && isTerminal(e) && e instanceof UnrecoverableError
      );
    });
  });

  it("timeout/abort maps to ProviderTimeoutError retryable", async () => {
    await withEnv(
      { DETECTION_REAL_URL: "http://127.0.0.1:9/detect", DETECTION_REAL_TIMEOUT_MS: "40" },
      async () => {
        globalThis.fetch = async (_url, opts) =>
          new Promise((_resolve, reject) => {
            opts.signal.addEventListener("abort", () => {
              const err = new Error("Aborted");
              err.name = "AbortError";
              reject(err);
            });
          });

        await assert.rejects(
          async () => realProvider.detect(baseInput()),
          (e) => e instanceof ProviderTimeoutError && isRetryable(e)
        );
      }
    );
  });

  it("invalid upstream JSON on 200 throws ProviderBadResponseError terminal", async () => {
    await withEnv({ DETECTION_REAL_URL: "http://127.0.0.1:9/detect" }, async () => {
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        text: async () => "NOT_JSON_AT_ALL"
      });

      await assert.rejects(
        async () => realProvider.detect(baseInput()),
        (e) => e instanceof ProviderBadResponseError && isTerminal(e)
      );
    });
  });

  it("malformed 200 JSON shape throws ProviderBadResponseError", async () => {
    await withEnv({ DETECTION_REAL_URL: "http://127.0.0.1:9/detect" }, async () => {
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ confidence: 50, is_ai_generated: "false", summary: "x" })
      });

      await assert.rejects(
        async () => realProvider.detect(baseInput()),
        (e) => e instanceof ProviderBadResponseError && isTerminal(e)
      );
    });
  });

  it("multipart mode sets multipart request and omits JSON Content-Type", async () => {
    const fs = require("fs/promises");
    const os = require("os");
    const path = require("path");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mauth-detect-"));
    const fp = path.join(dir, "u.bin");
    await fs.writeFile(fp, Buffer.from("hello-world"));

    await withEnv(
      {
        DETECTION_REAL_URL: "http://127.0.0.1:9/m",
        DETECTION_REAL_SEND_FILE: "1"
      },
      async () => {
        globalThis.fetch = async (_url, opts) => {
          assert.ok(opts.body instanceof FormData);
          assert.ok(!Object.prototype.hasOwnProperty.call(opts.headers, "Content-Type"));
          const meta = JSON.parse(String(opts.body.get("metadata")));
          assert.equal(meta.sourceType, "upload");
          const blob = opts.body.get("file");
          assert.ok(blob instanceof Blob);
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                confidence: 9,
                isAiGenerated: true,
                summary: "multipart ok"
              })
          };
        };

        const out = await realProvider.detect(
          Object.assign(baseInput(), {
            localPath: fp,
            fileSizeBytes: 11
          })
        );
        assert.equal(out.details.usedMultipart, true);
        assert.equal(out.details.requestMode, "multipart");
        assert.equal(out.summary, "multipart ok");
      }
    );

    await fs.rm(dir, { recursive: true, force: true });
  });
});
