const { UnrecoverableError } = require("bullmq");
const { pool } = require("../db/pool");
const { runDetection } = require("../detection");
const { loadScanRow, resolveMediaInput } = require("./scanSource");

const LOG = "[scan-worker]";

function maxAttemptsFor(job) {
  const n = job.opts.attempts;
  return typeof n === "number" && n > 0 ? n : 1;
}

function willRetryAfterFailure(job) {
  return job.attemptsMade + 1 < maxAttemptsFor(job);
}

async function markProcessing(scanId) {
  await pool.query(
    `UPDATE scans
     SET status = 'processing', error_message = NULL, updated_at = NOW()
     WHERE id = $1`,
    [scanId]
  );
}

async function markCompleted({ scanId, confidence, isAiGenerated, summary, resultPayload, detectionProvider }) {
  await pool.query(
    `UPDATE scans
     SET is_ai_generated = $1,
         confidence = $2,
         summary = $3,
         result_payload = $4,
         error_message = NULL,
         status = 'completed',
         detection_provider = $6,
         updated_at = NOW(),
         completed_at = NOW()
     WHERE id = $5`,
    [isAiGenerated, confidence, summary, resultPayload, scanId, detectionProvider || null]
  );
}

async function markFailed({ scanId, errorMessage }) {
  await pool.query(
    `UPDATE scans
     SET status = 'failed',
         error_message = $1,
         summary = NULL,
         updated_at = NOW(),
         completed_at = NOW()
     WHERE id = $2`,
    [errorMessage, scanId]
  );
}

/**
 * @param {import('bullmq').Job} job
 */
async function processScanJob(job) {
  const { scanId, userId } = job.data;
  if (!scanId) {
    throw new UnrecoverableError("Job payload missing scanId");
  }

  const row = await loadScanRow(pool, scanId);
  if (!row) {
    throw new UnrecoverableError(`Scan row not found for id=${scanId}`);
  }
  if (row.status === "completed") {
    console.info(`${LOG} skip job=${job.id} scan=${scanId} (already completed)`);
    return { skipped: true, scanId };
  }

  console.info(
    `${LOG} start job=${job.id} scan=${scanId} attempt=${job.attemptsMade + 1}/${maxAttemptsFor(job)}`
  );

  await markProcessing(scanId);

  /** @type {{ input: object; release: () => Promise<void> } | undefined} */
  let resolved;
  try {
    resolved = await resolveMediaInput(row);
    const detection = await runDetection(resolved.input, { scanId, userId: userId != null ? userId : null });

    await markCompleted({
      scanId,
      confidence: detection.confidence,
      isAiGenerated: detection.isAiGenerated,
      summary: detection.summary,
      resultPayload: detection.resultPayload,
      detectionProvider: detection.providerId
    });

    console.info(
      `${LOG} completed job=${job.id} scan=${scanId} provider=${detection.providerId} confidence=${detection.confidence} ai=${detection.isAiGenerated}`
    );
    return { scanId, confidence: detection.confidence };
  } finally {
    if (resolved) {
      await resolved.release();
    }
  }
}

async function handleProcessorError(job, error) {
  const { scanId } = job.data || {};
  const message = error && error.message ? error.message : "Unexpected worker error";
  const max = maxAttemptsFor(job);

  if (error instanceof UnrecoverableError || error.name === "UnrecoverableError") {
    if (scanId) {
      await markFailed({ scanId, errorMessage: message });
    }
    const code = error && error.code ? String(error.code) : "";
    console.error(
      `${LOG} unrecoverable job=${job.id} scan=${scanId || "?"}${code ? ` code=${code}` : ""}: ${message}`
    );
    return;
  }

  if (willRetryAfterFailure(job)) {
    const code = error && error.code ? String(error.code) : "";
    console.warn(
      `${LOG} transient failure job=${job.id} scan=${scanId || "?"} attempt=${job.attemptsMade + 1}/${max}${
        code ? ` code=${code}` : ""
      }: ${message}`
    );
    return;
  }

  if (scanId) {
    await markFailed({ scanId, errorMessage: message });
  }
  const code = error && error.code ? String(error.code) : "";
  console.error(
    `${LOG} failed permanently job=${job.id} scan=${scanId || "?"}${code ? ` code=${code}` : ""}: ${message}`
  );
}

module.exports = {
  processScanJob,
  handleProcessorError
};
