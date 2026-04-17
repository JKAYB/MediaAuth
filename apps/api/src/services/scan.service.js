const { v4: uuidv4 } = require("uuid");
const { pool } = require("../db/pool");
const { scanQueue } = require("../queues/scan.queue");

async function createScan({ userId, file }) {
  const scanId = uuidv4();

  await pool.query(
    `INSERT INTO scans (id, user_id, filename, mime_type, file_size_bytes, status)
     VALUES ($1, $2, $3, $4, $5, 'pending')`,
    [scanId, userId, file.originalname, file.mimetype, file.size]
  );

  await scanQueue.add(
    "scan-media",
    {
      scanId,
      userId,
      filename: file.originalname,
      mimeType: file.mimetype,
      fileSizeBytes: file.size
    },
    {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000
      }
    }
  );

  return { id: scanId, status: "pending" };
}

async function getScanById({ scanId, userId }) {
  const { rows } = await pool.query(
    `SELECT id, filename, mime_type, file_size_bytes, status, confidence, is_ai_generated,
            result_payload, error_message, created_at, updated_at, completed_at
     FROM scans
     WHERE id = $1 AND user_id = $2`,
    [scanId, userId]
  );

  return rows[0] || null;
}

async function getScanHistory({ userId, page, limit }) {
  const offset = (page - 1) * limit;
  const [{ rows: dataRows }, { rows: countRows }] = await Promise.all([
    pool.query(
      `SELECT id, filename, mime_type, file_size_bytes, status, confidence, is_ai_generated,
              result_payload, error_message, created_at, updated_at, completed_at
       FROM scans
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    ),
    pool.query("SELECT COUNT(*)::INT AS total FROM scans WHERE user_id = $1", [userId])
  ]);

  const total = countRows[0] ? countRows[0].total : 0;
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    data: dataRows
  };
}

module.exports = {
  createScan,
  getScanById,
  getScanHistory
};
