const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { withEnv } = require("./helpers/env");
const {
  buildRequestPayload,
  buildMetadata,
  assertInputSupported
} = require("../src/detection/providers/realProviderRequest");
const {
  ConfigurationError,
  UnsupportedInputError,
  FileTooLargeError,
  FileMissingError,
  EmptyFileError
} = require("../src/detection/providers/realProviderErrors");

function baseInput(overrides = {}) {
  return {
    scanId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    userId: "bbbbbbbb-cccc-dddd-eeee-ffffffffffff",
    sourceType: "upload",
    sourceUrl: null,
    localPath: null,
    storageKey: null,
    originalFilename: "f.jpg",
    mimeType: "image/jpeg",
    fileSizeBytes: 123,
    legacyMetadataOnly: false,
    ...overrides
  };
}

describe("realProviderRequest", () => {
  it("throws ConfigurationError when DETECTION_REAL_URL missing", async () => {
    await withEnv({ DETECTION_REAL_URL: undefined }, async () => {
      delete process.env.DETECTION_REAL_URL;
      await assert.rejects(
        async () => buildRequestPayload(baseInput()),
        (e) => e instanceof ConfigurationError && e.code === "REAL_CONFIG"
      );
    });
  });

  it("URL input builds JSON body with sourceType url", async () => {
    await withEnv({ DETECTION_REAL_URL: "http://127.0.0.1:9/detect" }, async () => {
      const req = await buildRequestPayload(
        baseInput({
          sourceType: "url",
          sourceUrl: "https://cdn.example.com/a.mp4",
          mimeType: "application/octet-stream",
          fileSizeBytes: 0
        })
      );
      assert.equal(req.requestMode, "json");
      assert.equal(req.isMultipart, false);
      const meta = JSON.parse(String(req.body));
      assert.equal(meta.sourceType, "url");
      assert.equal(meta.sourceUrl, "https://cdn.example.com/a.mp4");
      assert.equal(meta.scanId, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    });
  });

  it("upload input builds JSON body", async () => {
    await withEnv({ DETECTION_REAL_URL: "http://127.0.0.1:9/detect" }, async () => {
      const req = await buildRequestPayload(
        baseInput({
          storageKey: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/f.jpg",
          localPath: "/tmp/ignored-for-json-mode"
        })
      );
      assert.equal(req.requestMode, "json");
      const meta = JSON.parse(String(req.body));
      assert.equal(meta.sourceType, "upload");
      assert.equal(meta.storageKey, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/f.jpg");
    });
  });

  it("multipart includes metadata + file when allowed", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mauth-rp-"));
    const filePath = path.join(dir, "blob.bin");
    await fs.writeFile(filePath, Buffer.alloc(400, 7));

    await withEnv(
      {
        DETECTION_REAL_URL: "http://127.0.0.1:9/up",
        DETECTION_REAL_SEND_FILE: "1",
        DETECTION_REAL_MAX_FILE_BYTES: "20971520"
      },
      async () => {
        const req = await buildRequestPayload(
          baseInput({
            localPath: filePath,
            originalFilename: "blob.bin",
            mimeType: "application/octet-stream",
            fileSizeBytes: 400
          })
        );
        assert.equal(req.usedMultipart, true);
        assert.equal(req.requestMode, "multipart");
        assert.ok(req.body instanceof FormData);
        const metaRaw = req.body.get("metadata");
        assert.equal(typeof metaRaw, "string");
        const meta = JSON.parse(metaRaw);
        assert.equal(meta.scanId, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
        const file = req.body.get("file");
        assert.ok(file instanceof Blob);
        assert.ok(file.size > 0);
      }
    );

    await fs.rm(dir, { recursive: true, force: true });
  });

  it("multipart rejects legacyMetadataOnly", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mauth-rp-"));
    const filePath = path.join(dir, "x.bin");
    await fs.writeFile(filePath, Buffer.from("x"));

    await withEnv({ DETECTION_REAL_URL: "http://127.0.0.1:9/up", DETECTION_REAL_SEND_FILE: "1" }, async () => {
      await assert.rejects(
        async () =>
          buildRequestPayload(
            baseInput({
              localPath: filePath,
              legacyMetadataOnly: true
            })
          ),
        (e) => e instanceof UnsupportedInputError
      );
    });

    await fs.rm(dir, { recursive: true, force: true });
  });

  it("multipart rejects URL scans", async () => {
    await withEnv({ DETECTION_REAL_URL: "http://127.0.0.1:9/up", DETECTION_REAL_SEND_FILE: "1" }, async () => {
      await assert.rejects(
        async () =>
          buildRequestPayload(
            baseInput({
              sourceType: "url",
              sourceUrl: "https://a.example/x.png",
              localPath: null
            })
          ),
        (e) => e instanceof UnsupportedInputError
      );
    });
  });

  it("local path exposure sends basename by default", async () => {
    await withEnv({ DETECTION_REAL_EXPOSE_LOCAL_PATH: "1", DETECTION_REAL_EXPOSE_FULL_LOCAL_PATH: undefined }, () => {
      delete process.env.DETECTION_REAL_EXPOSE_FULL_LOCAL_PATH;
      const meta = buildMetadata(
        baseInput({ localPath: "/very/long/path/secret/file.jpg" })
      );
      assert.equal(meta.localPath, "file.jpg");
      assert.equal(meta.localPathBasenameOnly, true);
    });
  });

  it("full local path only when DETECTION_REAL_EXPOSE_FULL_LOCAL_PATH=1", async () => {
    await withEnv(
      {
        DETECTION_REAL_EXPOSE_LOCAL_PATH: "1",
        DETECTION_REAL_EXPOSE_FULL_LOCAL_PATH: "1"
      },
      () => {
        const p = "/very/long/path/secret/file.jpg";
        const meta = buildMetadata(baseInput({ localPath: p }));
        assert.equal(meta.localPath, p);
        assert.equal(meta.localPathBasenameOnly, undefined);
      }
    );
  });

  it("DETECTION_REAL_DISALLOW_URL blocks URL input", async () => {
    await withEnv(
      {
        DETECTION_REAL_URL: "http://127.0.0.1:9/detect",
        DETECTION_REAL_DISALLOW_URL: "1"
      },
      async () => {
        await assert.rejects(
          async () =>
            buildRequestPayload(
              baseInput({
                sourceType: "url",
                sourceUrl: "https://x.example/a"
              })
            ),
          (e) => e instanceof UnsupportedInputError && e.code === "REAL_UNSUPPORTED_INPUT"
        );
      }
    );
  });

  it("size cap rejects oversized file", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mauth-rp-"));
    const filePath = path.join(dir, "big.bin");
    await fs.writeFile(filePath, Buffer.alloc(800, 1));

    await withEnv(
      {
        DETECTION_REAL_URL: "http://127.0.0.1:9/up",
        DETECTION_REAL_SEND_FILE: "1",
        DETECTION_REAL_MAX_FILE_BYTES: "500"
      },
      async () => {
        await assert.rejects(
          async () =>
            buildRequestPayload(
              baseInput({
                localPath: filePath,
                fileSizeBytes: 800
              })
            ),
          (e) => e instanceof FileTooLargeError && e.code === "REAL_FILE_TOO_LARGE"
        );
      }
    );

    await fs.rm(dir, { recursive: true, force: true });
  });

  it("missing file -> FileMissingError", async () => {
    await withEnv({ DETECTION_REAL_URL: "http://127.0.0.1:9/up", DETECTION_REAL_SEND_FILE: "1" }, async () => {
      await assert.rejects(
        async () =>
          buildRequestPayload(
            baseInput({
              localPath: path.join(os.tmpdir(), "does-not-exist-mauth-xyz.bin")
            })
          ),
        (e) => e instanceof FileMissingError && e.code === "REAL_FILE_MISSING"
      );
    });
  });

  it("empty file -> EmptyFileError", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mauth-rp-"));
    const filePath = path.join(dir, "empty.bin");
    await fs.writeFile(filePath, Buffer.alloc(0));

    await withEnv({ DETECTION_REAL_URL: "http://127.0.0.1:9/up", DETECTION_REAL_SEND_FILE: "1" }, async () => {
      await assert.rejects(
        async () => buildRequestPayload(baseInput({ localPath: filePath })),
        (e) => e instanceof EmptyFileError && e.code === "REAL_FILE_EMPTY"
      );
    });

    await fs.rm(dir, { recursive: true, force: true });
  });

  it("assertInputSupported rejects multipart + url", () => {
    const caps = {
      supportsUrlInput: true,
      supportsLocalFileInput: true,
      allowsLocalPathExposure: false,
      allowsFullLocalPathInMetadata: false,
      allowsMultipartUpload: true
    };
    assert.throws(
      () =>
        assertInputSupported(
          baseInput({ sourceType: "url", sourceUrl: "https://x", localPath: null }),
          caps
        ),
      UnsupportedInputError
    );
  });
});
