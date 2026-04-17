const { Worker } = require("bullmq");
const { connection } = require("./db/redis");
const { pool } = require("./db/pool");
const { mockScan } = require("./processors/mockScan");
const { hiveScan } = require("./processors/hiveScan");

function clamp(num, min, max) {
  return Math.max(min, Math.min(max, num));
}

function startWorker() {
  const worker = new Worker(
    "scan-jobs",
    async (job) => {
      const { scanId } = job.data;

      const mock = mockScan(job.data);
      const hive = await hiveScan(job.data);

      const confidence = clamp(mock.confidence + hive.confidenceAdjustment, 0, 100);
      const isAiGenerated = confidence >= 50;

      await pool.query(
        "UPDATE scans SET is_ai_generated = $1, confidence = $2, status = 'completed', completed_at = NOW() WHERE id = $3",
        [isAiGenerated, confidence, scanId]
      );
    },
    {
      connection,
      concurrency: 1
    }
  );

  worker.on("completed", (job) => {
    console.log(`Completed job ${job.id}`);
  });

  worker.on("failed", (job, error) => {
    console.error(`Job ${job ? job.id : "unknown"} failed`, error);
  });

  console.log("Worker started and listening for scan-jobs");
  return worker;
}

module.exports = { startWorker };
