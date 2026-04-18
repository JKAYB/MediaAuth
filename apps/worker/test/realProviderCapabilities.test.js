const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { withEnv } = require("./helpers/env");
const { getRealProviderCapabilities } = require("../src/detection/providers/realProviderCapabilities");

describe("realProviderCapabilities", () => {
  it("capability flags reflect env", async () => {
    await withEnv(
      {
        DETECTION_REAL_SEND_FILE: "true",
        DETECTION_REAL_DISALLOW_URL: "yes",
        DETECTION_REAL_EXPOSE_LOCAL_PATH: undefined,
        DETECTION_REAL_EXPOSE_FULL_LOCAL_PATH: undefined
      },
      () => {
        delete process.env.DETECTION_REAL_EXPOSE_LOCAL_PATH;
        delete process.env.DETECTION_REAL_EXPOSE_FULL_LOCAL_PATH;
        const c = getRealProviderCapabilities();
        assert.equal(c.allowsMultipartUpload, true);
        assert.equal(c.supportsUrlInput, false);
        assert.equal(c.allowsLocalPathExposure, false);
        assert.equal(c.allowsFullLocalPathInMetadata, false);
      }
    );
  });

  it("expose flags turn on when env set", async () => {
    await withEnv(
      {
        DETECTION_REAL_EXPOSE_LOCAL_PATH: "1",
        DETECTION_REAL_EXPOSE_FULL_LOCAL_PATH: "1",
        DETECTION_REAL_SEND_FILE: undefined,
        DETECTION_REAL_DISALLOW_URL: undefined
      },
      () => {
        delete process.env.DETECTION_REAL_SEND_FILE;
        delete process.env.DETECTION_REAL_DISALLOW_URL;
        const c = getRealProviderCapabilities();
        assert.equal(c.allowsLocalPathExposure, true);
        assert.equal(c.allowsFullLocalPathInMetadata, true);
        assert.equal(c.allowsMultipartUpload, false);
        assert.equal(c.supportsUrlInput, true);
      }
    );
  });
});
