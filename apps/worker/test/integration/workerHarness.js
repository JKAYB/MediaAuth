const { Worker, Queue } = require("bullmq");
const { connection } = require("../../src/db/redis");
const { processScanJob, handleProcessorError } = require("../../src/services/scanJobProcessor");

/**
 * In-process BullMQ worker for integration tests (no SIGINT handlers, no pool.end).
 */
function createTestWorker() {
  return new Worker(
    "scan-jobs",
    async (job) => {
      try {
        return await processScanJob(job);
      } catch (error) {
        await handleProcessorError(job, error);
        throw error;
      }
    },
    { connection, concurrency: 1 }
  );
}

function createTestQueue() {
  return new Queue("scan-jobs", { connection });
}

module.exports = {
  createTestWorker,
  createTestQueue
};
