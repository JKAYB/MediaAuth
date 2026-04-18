/**
 * Optional API + worker upload flow against real S3 / MinIO.
 *
 * Not part of the default `*.integration.test.js` glob — run explicitly via
 * `npm run test:integration:api:s3` (see root package.json).
 *
 * Requires: RUN_API_INTEGRATION=1, RUN_API_S3_STORAGE_INTEGRATION=1, RUN_API_INTEGRATION_WORKER=1,
 * DATABASE_URL, REDIS_URL, JWT_SECRET, and full OBJECT_STORAGE_* for S3 (see OPERATIONS MinIO section).
 */

"use strict";

const path = require("path");
const crypto = require("crypto");

require("dotenv").config({
  path: path.resolve(__dirname, "../../../../.env")
});

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { resetScanObjectStorageSingletonForTests } = require("@media-auth/scan-storage");

function truthy(v) {
  const s = String(v || "")
    .trim()
    .toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

function s3EnvComplete() {
  return (
    Boolean(process.env.OBJECT_STORAGE_BUCKET?.trim()) &&
    Boolean(process.env.OBJECT_STORAGE_REGION?.trim()) &&
    Boolean(process.env.OBJECT_STORAGE_ACCESS_KEY_ID?.trim()) &&
    Boolean(process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY?.trim())
  );
}

const enabled =
  truthy(process.env.RUN_API_INTEGRATION) &&
  truthy(process.env.RUN_API_S3_STORAGE_INTEGRATION) &&
  truthy(process.env.RUN_API_INTEGRATION_WORKER) &&
  Boolean(process.env.DATABASE_URL) &&
  Boolean(process.env.REDIS_URL) &&
  Boolean(process.env.JWT_SECRET) &&
  s3EnvComplete();

const d = enabled ? describe : describe.skip;

/** 1×1 transparent PNG */
const MIN_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { _raw: text };
  }
  return { res, body };
}

async function signupLogin(baseUrl, email, password) {
  let r = await fetchJson(`${baseUrl}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  assert.equal(r.res.status, 201, JSON.stringify(r.body));

  r = await fetchJson(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  assert.equal(r.res.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.token);
  return r.body.token;
}

async function waitForScanStatus(pool, scanId, want, timeoutMs = 35000, intervalMs = 200) {
  const deadline = Date.now() + timeoutMs;
  // eslint-disable-next-line no-constant-condition -- poll
  while (true) {
    const { rows } = await pool.query(`SELECT status FROM scans WHERE id = $1`, [scanId]);
    const st = rows[0] && rows[0].status;
    if (st === want) {
      return;
    }
    if (Date.now() > deadline) {
      throw new Error(`Timeout waiting for scan ${scanId} status ${want}, got ${st}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

d("API + worker upload with OBJECT_STORAGE_PROVIDER=s3 (optional)", () => {
  let baseUrl;
  let closeServer;
  /** @type {import('pg').Pool} */
  let pool;
  let worker;
  let queue;
  const createdUserIds = [];
  const createdScanIds = [];
  /** @type {Record<string, string | undefined>} */
  const savedEnv = {};

  function saveEnv(key) {
    savedEnv[key] = process.env[key];
  }

  function restoreEnv(key) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }

  before(async () => {
    process.env.DETECTION_PROVIDER = "mock";
    delete process.env.DETECTION_REAL_URL;

    saveEnv("OBJECT_STORAGE_PROVIDER");
    process.env.OBJECT_STORAGE_PROVIDER = "s3";

    resetScanObjectStorageSingletonForTests();

    // eslint-disable-next-line global-require
    pool = require("../../src/db/pool").pool;
    const { startTestServer } = require("./httpServer");
    const s = await startTestServer();
    baseUrl = s.baseUrl;
    closeServer = s.close;

    const workerHarnessPath = path.join(__dirname, "../../../worker/test/integration/workerHarness.js");
    // eslint-disable-next-line global-require
    const { createTestWorker, createTestQueue } = require(workerHarnessPath);
    queue = createTestQueue();
    worker = createTestWorker();
    await new Promise((r) => setTimeout(r, 400));
  });

  after(async () => {
    const { getStorageForProvider } = require("@media-auth/scan-storage");
    let s3;
    try {
      s3 = getStorageForProvider("s3");
    } catch {
      s3 = null;
    }

    const { Queue } = require("bullmq");
    const { connection } = require("../../src/db/redis");
    const qCleanup = new Queue("scan-jobs", { connection });
    try {
      for (const scanId of createdScanIds) {
        if (s3) {
          try {
            const { rows } = await pool.query(`SELECT storage_key FROM scans WHERE id = $1`, [scanId]);
            const sk = rows[0] && rows[0].storage_key;
            if (sk) {
              await s3.deleteObject(String(sk)).catch(() => {});
            }
          } catch {
            /* ignore */
          }
        }
        try {
          const j = await qCleanup.getJob(scanId);
          if (j) {
            await j.remove();
          }
        } catch {
          /* ignore */
        }
        try {
          await pool.query("DELETE FROM scans WHERE id = $1", [scanId]);
        } catch {
          /* ignore */
        }
      }
    } finally {
      await qCleanup.close();
    }

    for (const uid of createdUserIds) {
      try {
        await pool.query("DELETE FROM api_keys WHERE user_id = $1", [uid]);
        await pool.query("DELETE FROM scans WHERE user_id = $1", [uid]);
        await pool.query("DELETE FROM users WHERE id = $1", [uid]);
      } catch {
        /* ignore */
      }
    }

    if (worker) {
      await worker.close();
    }
    if (queue) {
      await queue.close();
    }
    if (closeServer) {
      await closeServer();
    }

    restoreEnv("OBJECT_STORAGE_PROVIDER");
    resetScanObjectStorageSingletonForTests();
  });

  it("upload via API persists s3 row and worker completes with mock detection", async () => {
    const email = `s3e2e-${crypto.randomBytes(6).toString("hex")}@t.local`;
    const password = "TestUser1!";
    const token = await signupLogin(baseUrl, email, password);
    const userId = (await pool.query(`SELECT id FROM users WHERE email = $1`, [email])).rows[0].id;
    createdUserIds.push(userId);

    const fd = new FormData();
    fd.append("file", new Blob([MIN_PNG], { type: "image/png" }), "s3-e2e.png");
    const { res, body } = await fetchJson(`${baseUrl}/scan`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd
    });
    assert.equal(res.status, 202, JSON.stringify(body));
    const scanId = body.id;
    createdScanIds.push(scanId);

    const { rows } = await pool.query(
      `SELECT status, storage_provider, storage_key, source_type FROM scans WHERE id = $1`,
      [scanId]
    );
    assert.equal(rows[0].source_type, "upload");
    assert.equal(rows[0].storage_provider, "s3");
    assert.ok(rows[0].storage_key && String(rows[0].storage_key).length > 0);

    await waitForScanStatus(pool, scanId, "completed");

    const detail = await fetchJson(`${baseUrl}/scan/${scanId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(detail.res.status, 200);
    assert.equal(detail.body.status, "completed");
    assert.ok(String(detail.body.summary || "").includes("Mock"));
    assert.equal(detail.body.detection_provider, "mock");
  });
});
