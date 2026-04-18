const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { withEnv } = require("./helpers/env");
const { validateRealProviderEnv } = require("../src/detection/realProviderHealth");

describe("realProviderHealth", () => {
  it("readiness ok when not using real provider", async () => {
    await withEnv({ DETECTION_PROVIDER: "mock" }, () => {
      const v = validateRealProviderEnv();
      assert.equal(v.active, false);
      assert.equal(v.ok, true);
      assert.deepEqual(v.issues, []);
    });
  });

  it("readiness fails when real selected but URL missing", async () => {
    await withEnv({ DETECTION_PROVIDER: "real", DETECTION_REAL_URL: undefined }, () => {
      delete process.env.DETECTION_REAL_URL;
      const v = validateRealProviderEnv();
      assert.equal(v.active, true);
      assert.equal(v.ok, false);
      assert.ok(v.issues.some((m) => m.includes("DETECTION_REAL_URL")));
    });
  });

  it("readiness ok when real and URL set", async () => {
    await withEnv(
      {
        DETECTION_PROVIDER: "real",
        DETECTION_REAL_URL: "http://127.0.0.1:9/x"
      },
      () => {
        const v = validateRealProviderEnv();
        assert.equal(v.active, true);
        assert.equal(v.ok, true);
        assert.deepEqual(v.issues, []);
      }
    );
  });

  it("readiness ok when real + Reality Defender vendor + API key", async () => {
    await withEnv(
      {
        DETECTION_PROVIDER: "real",
        DETECTION_REAL_VENDOR: "reality_defender",
        REALITY_DEFENDER_API_KEY: "k",
        DETECTION_REAL_URL: undefined
      },
      () => {
        delete process.env.DETECTION_REAL_URL;
        const v = validateRealProviderEnv();
        assert.equal(v.active, true);
        assert.equal(v.ok, true);
        assert.deepEqual(v.issues, []);
      }
    );
  });

  it("readiness fails when Reality Defender selected but API key missing", async () => {
    await withEnv(
      {
        DETECTION_PROVIDER: "real",
        DETECTION_REAL_VENDOR: "reality_defender",
        REALITY_DEFENDER_API_KEY: undefined
      },
      () => {
        delete process.env.REALITY_DEFENDER_API_KEY;
        delete process.env.DETECTION_REAL_URL;
        const v = validateRealProviderEnv();
        assert.equal(v.active, true);
        assert.equal(v.ok, false);
        assert.ok(v.issues.some((m) => m.includes("REALITY_DEFENDER_API_KEY")));
      }
    );
  });

  it("readiness fails for unsupported DETECTION_REAL_VENDOR", async () => {
    await withEnv(
      {
        DETECTION_PROVIDER: "real",
        DETECTION_REAL_VENDOR: "other_vendor",
        DETECTION_REAL_URL: "http://127.0.0.1:9/x"
      },
      () => {
        const v = validateRealProviderEnv();
        assert.equal(v.active, true);
        assert.equal(v.ok, false);
        assert.ok(v.issues.some((m) => m.includes("DETECTION_REAL_VENDOR")));
      }
    );
  });
});
