const { Worker } = require("bullmq");
const { connection, redisUrl } = require("../db/redis");
const { pool } = require("../db/pool");
const { uploadBaseDir } = require("@media-auth/scan-storage");
const { logRealProviderReadiness } = require("../detection/realProviderHealth");
const { processScanJob, handleProcessorError } = require("../services/scanJobProcessor");

const LOG = "[scan-worker]";

function parseConcurrency() {
  const raw = process.env.SCAN_WORKER_CONCURRENCY;
  const n = raw ? Number.parseInt(raw, 10) : 2;
  return Number.isFinite(n) && n > 0 ? n : 2;
}

function createScanWorker() {
  console.info(`${LOG} connecting redis=${redisUrl.replace(/:[^:@/]+@/, ":****@")}`);
  console.info(`${LOG} local upload dir=${uploadBaseDir()}`);
  logRealProviderReadiness();
  console.info(`${LOG} queue=scan-jobs concurrency=${parseConcurrency()}`);

  const worker = new Worker(
    "scan-jobs",
    async (job) => {
      try {
        return await processScanJob(job);
      } catch (error) {
        await handleProcessorError(job, error);
        throw error;
      }
    },
    {
      connection,
      concurrency: parseConcurrency(),
      limiter: (() => {
        const max = Number.parseInt(process.env.SCAN_WORKER_RATE_MAX || "", 10);
        const duration = Number.parseInt(
          process.env.SCAN_WORKER_RATE_DURATION_MS || "1000",
          10
        );
        if (Number.isFinite(max) && max > 0 && Number.isFinite(duration) && duration > 0) {
          return { max, duration };
        }
        return undefined;
      })()
    }
  );

  worker.on("completed", (job, result) => {
    if (result && result.skipped) {
      return;
    }
    console.info(`${LOG} bullmq completed job=${job.id}`);
  });

  worker.on("failed", (job, error) => {
    console.error(`${LOG} bullmq failed job=${job ? job.id : "unknown"}`, error);
  });

  worker.on("error", (error) => {
    console.error(`${LOG} worker runtime error`, error);
  });

  worker.on("stalled", (jobId) => {
    console.warn(`${LOG} stalled jobId=${jobId}`);
  });

  console.info(`${LOG} listening`);

  async function shutdown(signal) {
    console.info(`${LOG} ${signal} received, closing…`);
    await worker.close();
    await pool.end();
    try {
      await connection.quit();
    } catch {
      connection.disconnect();
    }
    process.exit(0);
  }

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  return worker;
}

module.exports = { createScanWorker };
