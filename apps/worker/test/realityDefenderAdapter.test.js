const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { withEnv } = require("./helpers/env");
const { normalizeProviderResult } = require("../src/detection/validate");
const {
  mapMediaToProviderFields,
  parsePresignResponse,
  detectRealityDefender,
  DEFAULT_BASE_URL
} = require("../src/detection/providers/realityDefenderAdapter");
const {
  ConfigurationError,
  UnsupportedInputError,
  ProviderBadResponseError,
  ProviderTimeoutError,
  FileMissingError
} = require("../src/detection/providers/realProviderErrors");
const { realProvider } = require("../src/detection/providers/realProvider");

describe("realityDefenderAdapter.mapMediaToProviderFields", () => {
  it("maps AUTHENTIC + finalScore to boolean false and 0–100 confidence", () => {
    const out = mapMediaToProviderFields({
      requestId: "rid",
      overallStatus: "X",
      mediaType: "IMAGE",
      resultsSummary: { status: "AUTHENTIC", metadata: { finalScore: 22.5 } },
      models: []
    });
    assert.equal(out.isAiGenerated, false);
    assert.equal(out.confidence, 22.5);
    assert.match(out.summary, /AUTHENTIC/);
  });

  it("maps FAKE to AI-generated true (aligned with SDK FAKE→MANIPULATED wording)", () => {
    const out = mapMediaToProviderFields({
      requestId: "rid",
      resultsSummary: { status: "FAKE", metadata: { finalScore: 88 } },
      models: []
    });
    assert.equal(out.isAiGenerated, true);
    assert.equal(out.confidence, 88);
    assert.match(out.summary, /likely manipulated|MANIPULATED|manipulated/i);
  });

  it("maps SUSPICIOUS to inconclusive (null) with neutral confidence fallback", () => {
    const out = mapMediaToProviderFields({
      requestId: "rid",
      resultsSummary: { status: "SUSPICIOUS", metadata: { finalScore: null } },
      models: []
    });
    assert.equal(out.isAiGenerated, null);
    assert.equal(out.confidence, 50);
    assert.match(out.summary, /inconclusive/i);
  });

  it("throws when resultsSummary missing", () => {
    assert.throws(
      () => mapMediaToProviderFields({ requestId: "x", models: [] }),
      (e) => e instanceof ProviderBadResponseError
    );
  });
});

describe("realityDefenderAdapter.parsePresignResponse", () => {
  it("parses signedUrl and requestId", () => {
    const out = parsePresignResponse(
      {
        errno: 0,
        requestId: "r1",
        mediaId: "m1",
        response: { signedUrl: "https://example.com/put" }
      },
      200
    );
    assert.equal(out.requestId, "r1");
    assert.equal(out.signedUrl, "https://example.com/put");
    assert.equal(out.mediaId, "m1");
  });

  it("throws on missing signedUrl", () => {
    assert.throws(
      () => parsePresignResponse({ errno: 0, requestId: "r1", response: {} }, 200),
      (e) => e instanceof ProviderBadResponseError
    );
  });

  it("throws on nonzero errno", () => {
    assert.throws(
      () => parsePresignResponse({ errno: 1, response: { signedUrl: "x" }, requestId: "r" }, 200),
      (e) => e instanceof ProviderBadResponseError
    );
  });
});

describe("realityDefenderAdapter.detectRealityDefender (mocked fetch)", () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  async function writePng(dir) {
    const p = path.join(dir, "x.png");
    await fs.writeFile(p, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    return p;
  }

  it("happy path: presign + PUT + poll AUTHENTIC", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rd-test-"));
    const localPath = await writePng(tmp);
    try {
      await withEnv(
        {
          REALITY_DEFENDER_API_KEY: "test-key",
          REALITY_DEFENDER_BASE_URL: "https://api.example.test",
          DETECTION_REAL_TIMEOUT_MS: "5000",
          REALITY_DEFENDER_POLL_INTERVAL_MS: "1",
          REALITY_DEFENDER_POLL_TIMEOUT_MS: "10000"
        },
        async () => {
          globalThis.fetch = async (url, opts) => {
            const u = String(url);
            if (opts.method === "POST" && u.includes("/api/files/aws-presigned")) {
              assert.equal(opts.headers["X-API-KEY"], "test-key");
              const body = JSON.parse(String(opts.body));
              assert.equal(body.fileName, "x.png");
              return {
                ok: true,
                status: 200,
                text: async () =>
                  JSON.stringify({
                    errno: 0,
                    requestId: "req-1",
                    mediaId: "med-1",
                    response: { signedUrl: "https://s3.example.test/upload-target" }
                  })
              };
            }
            if (opts.method === "PUT" && u.includes("s3.example.test")) {
              assert.ok(opts.body);
              return { ok: true, status: 200, text: async () => "" };
            }
            if (opts.method === "GET" && u.includes("/api/media/users/req-1")) {
              return {
                ok: true,
                status: 200,
                text: async () =>
                  JSON.stringify({
                    requestId: "req-1",
                    mediaType: "IMAGE",
                    overallStatus: "DONE",
                    resultsSummary: { status: "AUTHENTIC", metadata: { finalScore: 30 } },
                    models: [{ name: "m1", status: "AUTHENTIC", predictionNumber: 0.1 }]
                  })
              };
            }
            assert.fail(`unexpected fetch ${opts.method} ${u}`);
          };

          const out = await detectRealityDefender({
            scanId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
            userId: null,
            sourceType: "upload",
            sourceUrl: null,
            localPath,
            storageKey: "k",
            originalFilename: "x.png",
            mimeType: "image/png",
            fileSizeBytes: 8,
            legacyMetadataOnly: false
          });
          assert.equal(out.providerId, "real");
          assert.equal(out.isAiGenerated, false);
          assert.equal(out.confidence, 30);
          assert.equal(out.details.detectionVendor, "reality_defender");
          assert.equal(out.details.requestId, "req-1");
        }
      );
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("poll timeout when status stays ANALYZING", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rd-test-"));
    const localPath = await writePng(tmp);
    try {
      await withEnv(
        {
          REALITY_DEFENDER_API_KEY: "k",
          REALITY_DEFENDER_BASE_URL: "https://api.example.test",
          DETECTION_REAL_TIMEOUT_MS: "5000",
          REALITY_DEFENDER_POLL_INTERVAL_MS: "5",
          REALITY_DEFENDER_POLL_TIMEOUT_MS: "40"
        },
        async () => {
          globalThis.fetch = async (url, opts) => {
            const u = String(url);
            if (opts.method === "POST" && u.includes("aws-presigned")) {
              return {
                ok: true,
                status: 200,
                text: async () =>
                  JSON.stringify({
                    errno: 0,
                    requestId: "r2",
                    mediaId: "m",
                    response: { signedUrl: "https://s3.example.test/up" }
                  })
              };
            }
            if (opts.method === "PUT") {
              return { ok: true, status: 200, text: async () => "" };
            }
            if (opts.method === "GET") {
              return {
                ok: true,
                status: 200,
                text: async () =>
                  JSON.stringify({
                    requestId: "r2",
                    resultsSummary: { status: "ANALYZING", metadata: { finalScore: null } },
                    models: []
                  })
              };
            }
            assert.fail("unexpected");
          };
          await assert.rejects(
            () =>
              detectRealityDefender({
                scanId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
                userId: null,
                sourceType: "upload",
                sourceUrl: null,
                localPath,
                storageKey: "k",
                originalFilename: "x.png",
                mimeType: "image/png",
                fileSizeBytes: 8,
                legacyMetadataOnly: false
              }),
            (e) => e instanceof ProviderTimeoutError
          );
        }
      );
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("missing API key throws ConfigurationError", async () => {
    await withEnv({ REALITY_DEFENDER_API_KEY: undefined }, async () => {
      delete process.env.REALITY_DEFENDER_API_KEY;
      await assert.rejects(
        () =>
          detectRealityDefender({
            scanId: "s",
            userId: null,
            sourceType: "upload",
            sourceUrl: null,
            localPath: "/nope",
            storageKey: "k",
            originalFilename: "x.png",
            mimeType: "image/png",
            fileSizeBytes: 1,
            legacyMetadataOnly: false
          }),
        (e) => e instanceof ConfigurationError
      );
    });
  });

  it("rejects URL scans", async () => {
    await withEnv({ REALITY_DEFENDER_API_KEY: "x" }, async () => {
      await assert.rejects(
        () =>
          detectRealityDefender({
            scanId: "s",
            userId: null,
            sourceType: "url",
            sourceUrl: "https://a.com/x.png",
            localPath: null,
            storageKey: null,
            originalFilename: "x.png",
            mimeType: "image/png",
            fileSizeBytes: 1,
            legacyMetadataOnly: false
          }),
        (e) => e instanceof UnsupportedInputError
      );
    });
  });

  it("rejects missing local file", async () => {
    await withEnv({ REALITY_DEFENDER_API_KEY: "x" }, async () => {
      await assert.rejects(
        () =>
          detectRealityDefender({
            scanId: "s",
            userId: null,
            sourceType: "upload",
            sourceUrl: null,
            localPath: path.join(os.tmpdir(), `missing-${Date.now()}.png`),
            storageKey: "k",
            originalFilename: "x.png",
            mimeType: "image/png",
            fileSizeBytes: 1,
            legacyMetadataOnly: false
          }),
        (e) => e instanceof FileMissingError
      );
    });
  });

  it("rejects unsupported MIME (non-image)", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rd-mime-"));
    const localPath = path.join(tmp, "x.bin");
    await fs.writeFile(localPath, Buffer.from("hello"));
    try {
      await withEnv({ REALITY_DEFENDER_API_KEY: "x" }, async () => {
        await assert.rejects(
          () =>
            detectRealityDefender({
              scanId: "s",
              userId: null,
              sourceType: "upload",
              sourceUrl: null,
              localPath,
              storageKey: "k",
              originalFilename: "x.bin",
              mimeType: "application/octet-stream",
              fileSizeBytes: 5,
              legacyMetadataOnly: false
            }),
          (e) => e instanceof UnsupportedInputError
        );
      });
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("invalid resultsSummary type in media detail throws ProviderBadResponseError", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rd-test-"));
    const localPath = await writePng(tmp);
    try {
      await withEnv(
        {
          REALITY_DEFENDER_API_KEY: "k",
          REALITY_DEFENDER_BASE_URL: "https://api.example.test",
          REALITY_DEFENDER_POLL_INTERVAL_MS: "1",
          REALITY_DEFENDER_POLL_TIMEOUT_MS: "5000"
        },
        async () => {
          globalThis.fetch = async (url, opts) => {
            const u = String(url);
            if (opts.method === "POST") {
              return {
                ok: true,
                status: 200,
                text: async () =>
                  JSON.stringify({
                    errno: 0,
                    requestId: "r3",
                    mediaId: "m",
                    response: { signedUrl: "https://s3.example.test/up" }
                  })
              };
            }
            if (opts.method === "PUT") {
              return { ok: true, status: 200, text: async () => "" };
            }
            return {
              ok: true,
              status: 200,
              text: async () =>
                JSON.stringify({ requestId: "r3", models: [], resultsSummary: "not-an-object" })
            };
          };
          await assert.rejects(
            () =>
              detectRealityDefender({
                scanId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
                userId: null,
                sourceType: "upload",
                sourceUrl: null,
                localPath,
                storageKey: "k",
                originalFilename: "x.png",
                mimeType: "image/png",
                fileSizeBytes: 8,
                legacyMetadataOnly: false
              }),
            (e) => e instanceof ProviderBadResponseError
          );
        }
      );
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

describe("normalizeProviderResult accepts null isAiGenerated", () => {
  it("normalizes Reality Defender–style row", () => {
    const n = normalizeProviderResult(
      {
        providerId: "ignored",
        confidence: 50,
        isAiGenerated: null,
        summary: "Reality Defender: inconclusive",
        details: { detectionVendor: "reality_defender" }
      },
      "real"
    );
    assert.equal(n.providerId, "real");
    assert.equal(n.isAiGenerated, null);
    assert.equal(n.confidence, 50);
  });
});

describe("realProvider with DETECTION_REAL_VENDOR=reality_defender", () => {
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

  it("unknown vendor throws ConfigurationError before fetch", async () => {
    await withEnv({ DETECTION_REAL_VENDOR: "acme_corp" }, async () => {
      await assert.rejects(
        () =>
          realProvider.detect({
            scanId: "s",
            userId: null,
            sourceType: "upload",
            localPath: "/x",
            sourceUrl: null,
            storageKey: "k",
            originalFilename: "a.png",
            mimeType: "image/png",
            fileSizeBytes: 1,
            legacyMetadataOnly: false
          }),
        (e) => e instanceof ConfigurationError
      );
    });
  });

  it("uses Reality Defender path when vendor set (mocked fetch)", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rd-rp-"));
    const localPath = path.join(tmp, "z.png");
    await fs.writeFile(localPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    try {
      await withEnv(
        {
          DETECTION_REAL_VENDOR: "reality_defender",
          REALITY_DEFENDER_API_KEY: "secret",
          REALITY_DEFENDER_BASE_URL: "https://api.rd.test",
          REALITY_DEFENDER_POLL_INTERVAL_MS: "1",
          REALITY_DEFENDER_POLL_TIMEOUT_MS: "8000"
        },
        async () => {
          globalThis.fetch = async (url, opts) => {
            const u = String(url);
            if (opts.method === "POST" && u.includes("aws-presigned")) {
              assert.equal(opts.headers["X-API-KEY"], "secret");
              return {
                ok: true,
                status: 200,
                text: async () =>
                  JSON.stringify({
                    errno: 0,
                    requestId: "RID",
                    mediaId: "MID",
                    response: { signedUrl: "https://s3.rd.test/p" }
                  })
              };
            }
            if (opts.method === "PUT") {
              return { ok: true, status: 200, text: async () => "" };
            }
            if (u.includes("/api/media/users/RID")) {
              return {
                ok: true,
                status: 200,
                text: async () =>
                  JSON.stringify({
                    requestId: "RID",
                    mediaType: "IMAGE",
                    overallStatus: "OK",
                    resultsSummary: { status: "MANIPULATED", metadata: { finalScore: 92 } },
                    models: []
                  })
              };
            }
            assert.fail(`unexpected ${u}`);
          };

          const out = await realProvider.detect({
            scanId: "bbbbbbbb-cccc-dddd-eeee-ffffffffffff",
            userId: null,
            sourceType: "upload",
            sourceUrl: null,
            localPath,
            storageKey: "k",
            originalFilename: "z.png",
            mimeType: "image/png",
            fileSizeBytes: 8,
            legacyMetadataOnly: false
          });
          assert.equal(out.isAiGenerated, true);
          assert.equal(out.confidence, 92);
        }
      );
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

describe("realityDefenderAdapter defaults", () => {
  it("DEFAULT_BASE_URL matches Reality Defender production host", () => {
    assert.ok(String(DEFAULT_BASE_URL).includes("api.prd.realitydefender.xyz"));
  });
});
