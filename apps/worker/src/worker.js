const { Worker } = require("bullmq");
const { connection } = require("./db/redis");
const { pool } = require("./db/pool");
const { mockScan } = require("./processors/mockScan");
const { hiveScan } = require("./processors/hiveScan");

function clamp(num, min, max) {
  return Math.max(min, Math.min(max, num));
}

async function markProcessing(scanId) {
  await pool.query(
    "UPDATE scans SET status = 'processing', updated_at = NOW() WHERE id = $1",
    [scanId]
  );
}

async function markCompleted({ scanId, confidence, isAiGenerated, resultPayload }) {
  await pool.query(
    `UPDATE scans
     SET is_ai_generated = $1,
         confidence = $2,
         result_payload = $3,
         error_message = NULL,
         status = 'completed',
         updated_at = NOW(),
         completed_at = NOW()
     WHERE id = $4`,
    [isAiGenerated, confidence, resultPayload, scanId]
  );
}

async function markFailed({ scanId, errorMessage }) {
  await pool.query(
    `UPDATE scans
     SET status = 'failed',
         error_message = $1,
         updated_at = NOW(),
         completed_at = NOW()
     WHERE id = $2`,
    [errorMessage, scanId]
  );
}

function startWorker() {
  const worker = new Worker(
    "scan-jobs",
    async (job) => {
      const { scanId } = job.data;
      await markProcessing(scanId);

      try {
        const mock = mockScan(job.data);
        const hive = await hiveScan(job.data);

        const confidence = clamp(mock.confidence + hive.confidenceAdjustment, 0, 100);
        const isAiGenerated = confidence >= 50;
        const resultPayload = {
          processors: {
            mock,
            hive
          }
        };

        await markCompleted({
          scanId,
          confidence,
          isAiGenerated,
          resultPayload
        });
      } catch (error) {
        await markFailed({
          scanId,
          errorMessage: error.message || "Unexpected worker error"
        });
        throw error;
      }
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
