/**
 * Scan pipeline integration tests (Postgres + Redis + BullMQ + in-process worker).
 *
 * Requirements: DATABASE_URL, REDIS_URL, migrations applied, DETECTION_PROVIDER=mock (default).
 * Enable with: RUN_SCAN_INTEGRATION=1 npm run test:integration
 *
 * Prefer a dedicated Redis DB index (e.g. redis://localhost:6379/15) to avoid clashing with dev workers.
 */

"use strict";

const path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname, "../../../../.env")
});

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { UnrecoverableError } = require("bullmq");

function truthyRunFlag(v) {
  const s = String(v || "")
    .trim()
    .toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

const integrationEnabled =
  truthyRunFlag(process.env.RUN_SCAN_INTEGRATION) &&
  Boolean(process.env.DATABASE_URL) &&
  Boolean(process.env.REDIS_URL);

const d = integrationEnabled ? describe : describe.skip;

function newScanId() {
  return crypto.randomUUID();
}

function fakeJob(scanId, userId, opts = {}) {
  return {
    id: opts.jobId || `job-${scanId}`,
    data: { scanId, userId: userId != null ? userId : null },
    attemptsMade: opts.attemptsMade ?? 0,
    opts: { attempts: opts.attempts ?? 3 }
  };
}

async function waitForScanRow(pool, scanId, predicate, timeoutMs = 20000, intervalMs = 150) {
  const deadline = Date.now() + timeoutMs;
  // eslint-disable-next-line no-constant-condition -- polling loop
  while (true) {
    const { rows } = await pool.query(
      `SELECT status, confidence, summary, is_ai_generated, result_payload, detection_provider,
              error_message, completed_at, updated_at
       FROM scans WHERE id = $1`,
      [scanId]
    );
    const row = rows[0];
    if (row && predicate(row)) {
      return row;
    }
    if (Date.now() > deadline) {
      throw new Error(`Timeout waiting for scan ${scanId}, last row=${JSON.stringify(row || null)}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

async function removeJobIfExists(queue, jobId) {
  const job = await queue.getJob(jobId);
  if (job) {
    try {
      await job.remove();
    } catch {
      /* ignore */
    }
  }
}

d("scan pipeline integration (queue + worker + postgres)", () => {
  let pool;
  let queue;
  let worker;
  let savedProvider;
  let savedObjectStorageProvider;
  let createTestWorker;
  let createTestQueue;

  before(async () => {
    savedProvider = process.env.DETECTION_PROVIDER;
    process.env.DETECTION_PROVIDER = "mock";
    delete process.env.DETECTION_REAL_URL;

    savedObjectStorageProvider = process.env.OBJECT_STORAGE_PROVIDER;
    process.env.OBJECT_STORAGE_PROVIDER = "local";
    delete process.env.OBJECT_STORAGE_BUCKET;

    // Lazy require so skipped suites never open Redis/Pool.
    ({ createTestWorker, createTestQueue } = require("./workerHarness"));
    // eslint-disable-next-line global-require
    pool = require("../../src/db/pool").pool;
    queue = createTestQueue();
    worker = createTestWorker();
    await new Promise((r) => setTimeout(r, 400));
  });

  after(async () => {
    if (worker) {
      await worker.close();
    }
    if (queue) {
      await queue.close();
    }
    if (savedProvider === undefined) {
      delete process.env.DETECTION_PROVIDER;
    } else {
      process.env.DETECTION_PROVIDER = savedProvider;
    }
    if (savedObjectStorageProvider === undefined) {
      delete process.env.OBJECT_STORAGE_PROVIDER;
    } else {
      process.env.OBJECT_STORAGE_PROVIDER = savedObjectStorageProvider;
    }
  });

  it("pending scan is completed by worker with persisted fields", async () => {
    const scanId = newScanId();
    await pool.query(
      `INSERT INTO scans (id, user_id, filename, mime_type, file_size_bytes, status,
                          source_type, storage_key, source_url)
       VALUES ($1, NULL, 'int.png', 'image/png', 10, 'pending', 'upload', NULL, NULL)`,
      [scanId]
    );

    try {
      await queue.add(
        "scan-media",
        { scanId, userId: null },
        { jobId: scanId, attempts: 3, backoff: { type: "exponential", delay: 50 } }
      );

      const row = await waitForScanRow(pool, scanId, (r) => r.status === "completed");
      assert.equal(row.status, "completed");
      assert.ok(row.summary && String(row.summary).includes("Mock"));
      assert.ok(row.confidence != null);
      assert.ok(typeof row.is_ai_generated === "boolean");
      assert.ok(row.result_payload && typeof row.result_payload === "object");
      assert.equal(row.detection_provider, "mock");
      assert.equal(row.error_message, null);
      assert.ok(row.completed_at);
    } finally {
      await removeJobIfExists(queue, scanId);
      await pool.query("DELETE FROM scans WHERE id = $1", [scanId]);
    }
  });

  it("completed scan is skipped on re-run (idempotent processScanJob)", async () => {
    const scanId = newScanId();
    // eslint-disable-next-line global-require
    const { processScanJob } = require("../../src/services/scanJobProcessor");

    await pool.query(
      `INSERT INTO scans (id, user_id, filename, mime_type, file_size_bytes, status,
                          source_type, storage_key, source_url, confidence, is_ai_generated, summary,
                          result_payload, detection_provider, completed_at)
       VALUES ($1, NULL, 'done.png', 'image/png', 10, 'completed', 'upload', NULL, NULL,
               11.5, false, 'Prior summary', '{"version":2}'::jsonb, 'mock', NOW() - INTERVAL '1 hour')`,
      [scanId]
    );

    try {
      const before = await pool.query(
        `SELECT summary, completed_at, detection_provider FROM scans WHERE id = $1`,
        [scanId]
      );
      const out = await processScanJob(fakeJob(scanId, null));
      assert.deepEqual(out, { skipped: true, scanId });
      const after = await pool.query(
        `SELECT summary, completed_at, detection_provider FROM scans WHERE id = $1`,
        [scanId]
      );
      assert.equal(after.rows[0].summary, before.rows[0].summary);
      assert.equal(String(after.rows[0].completed_at), String(before.rows[0].completed_at));
      assert.equal(after.rows[0].detection_provider, before.rows[0].detection_provider);
    } finally {
      await pool.query("DELETE FROM scans WHERE id = $1", [scanId]);
    }
  });

  it("duplicate jobId does not enqueue two waiting jobs", async () => {
    const scanId = newScanId();
    await pool.query(
      `INSERT INTO scans (id, user_id, filename, mime_type, file_size_bytes, status,
                          source_type, storage_key, source_url)
       VALUES ($1, NULL, 'dup.png', 'image/png', 10, 'pending', 'upload', NULL, NULL)`,
      [scanId]
    );

    try {
      await queue.add(
        "scan-media",
        { scanId, userId: null },
        { jobId: scanId, attempts: 3, backoff: { type: "exponential", delay: 50 } }
      );
      let secondOk = false;
      try {
        await queue.add(
          "scan-media",
          { scanId, userId: null },
          { jobId: scanId, attempts: 3, backoff: { type: "exponential", delay: 50 } }
        );
        secondOk = true;
      } catch {
        /* duplicate job id — expected on some BullMQ versions */
      }
      const waiting = await queue.getJobs(["waiting"], 0, 100, false);
      const sameId = waiting.filter((j) => j.id === scanId);
      assert.ok(
        sameId.length <= 1,
        `expected at most one waiting job for id ${scanId}, got ${sameId.length} (secondAddSucceeded=${secondOk})`
      );

      await waitForScanRow(pool, scanId, (r) => r.status === "completed");
    } finally {
      await removeJobIfExists(queue, scanId);
      await pool.query("DELETE FROM scans WHERE id = $1", [scanId]);
    }
  });

  it("terminal UnrecoverableError marks scan failed", async () => {
    const scanId = newScanId();
    // eslint-disable-next-line global-require
    const { handleProcessorError } = require("../../src/services/scanJobProcessor");

    await pool.query(
      `INSERT INTO scans (id, user_id, filename, mime_type, file_size_bytes, status,
                          source_type, storage_key, source_url)
       VALUES ($1, NULL, 'bad.png', 'image/png', 10, 'processing', 'upload', NULL, NULL)`,
      [scanId]
    );

    try {
      const job = fakeJob(scanId, null, { attemptsMade: 0, attempts: 3 });
      await handleProcessorError(job, new UnrecoverableError("no such media"));
      const row = await waitForScanRow(pool, scanId, (r) => r.status === "failed");
      assert.equal(row.status, "failed");
      assert.match(String(row.error_message || ""), /no such media/);
      assert.equal(row.summary, null);
    } finally {
      await pool.query("DELETE FROM scans WHERE id = $1", [scanId]);
    }
  });

  it("retryable errors do not mark failed until final attempt", async () => {
    const scanId = newScanId();
    // eslint-disable-next-line global-require
    const { handleProcessorError } = require("../../src/services/scanJobProcessor");

    await pool.query(
      `INSERT INTO scans (id, user_id, filename, mime_type, file_size_bytes, status,
                          source_type, storage_key, source_url)
       VALUES ($1, NULL, 'retry.png', 'image/png', 10, 'processing', 'upload', NULL, NULL)`,
      [scanId]
    );

    try {
      await handleProcessorError(fakeJob(scanId, null, { attemptsMade: 0, attempts: 3 }), new Error("transient"));
      let row = (await pool.query(`SELECT status FROM scans WHERE id = $1`, [scanId])).rows[0];
      assert.equal(row.status, "processing");

      await handleProcessorError(fakeJob(scanId, null, { attemptsMade: 1, attempts: 3 }), new Error("transient"));
      row = (await pool.query(`SELECT status FROM scans WHERE id = $1`, [scanId])).rows[0];
      assert.equal(row.status, "processing");

      await handleProcessorError(fakeJob(scanId, null, { attemptsMade: 2, attempts: 3 }), new Error("final fail"));
      row = await waitForScanRow(pool, scanId, (r) => r.status === "failed");
      assert.equal(row.status, "failed");
      const full = (
        await pool.query(`SELECT error_message FROM scans WHERE id = $1`, [scanId])
      ).rows[0];
      assert.match(String(full.error_message || ""), /final fail/);
    } finally {
      await pool.query("DELETE FROM scans WHERE id = $1", [scanId]);
    }
  });

  it("missing scan row: processScanJob throws and handleProcessorError does not crash", async () => {
    const scanId = newScanId();
    // eslint-disable-next-line global-require
    const { processScanJob, handleProcessorError } = require("../../src/services/scanJobProcessor");

    const job = fakeJob(scanId, null);
    let err;
    try {
      await processScanJob(job);
    } catch (e) {
      err = e;
    }
    assert.ok(err instanceof UnrecoverableError);
    await handleProcessorError(job, err);
    const cnt = (await pool.query(`SELECT COUNT(*)::int AS c FROM scans WHERE id = $1`, [scanId])).rows[0].c;
    assert.equal(cnt, 0);
  });
});
