const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { getScanObjectStorage } = require("@media-auth/scan-storage");
const { pool } = require("../db/pool");
const { scanQueue } = require("../queues/scan.queue");

const SCAN_SELECT_FIELDS = `id, filename, mime_type, file_size_bytes, status, confidence, is_ai_generated,
            result_payload, error_message, summary, source_type, source_url, storage_key, storage_provider, detection_provider,
            created_at, updated_at, completed_at`;

const queuePayload = (scanId, userId) => ({ scanId, userId });

const defaultJobOpts = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 1000
  }
};

async function createScanFromUpload({ userId, file }) {
  const scanId = uuidv4();
  const buffer = file.buffer;
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error("Upload buffer missing (memory storage required)");
  }

  const storage = getScanObjectStorage();
  const saved = await storage.saveUpload({
    scanId,
    buffer,
    originalName: file.originalname,
    contentType: file.mimetype
  });

  await pool.query(
    `INSERT INTO scans (id, user_id, filename, mime_type, file_size_bytes, status,
                        source_type, storage_key, storage_provider, source_url)
     VALUES ($1, $2, $3, $4, $5, 'pending', 'upload', $6, $7, NULL)`,
    [scanId, userId, file.originalname, file.mimetype, file.size, saved.storageKey, saved.storageProvider]
  );

  await scanQueue.add("scan-media", queuePayload(scanId, userId), {
    jobId: scanId,
    ...defaultJobOpts
  });

  return { id: scanId, status: "pending" };
}

function filenameFromUrl(urlString) {
  try {
    const u = new URL(urlString);
    const base = path.basename(u.pathname);
    const trimmed = (base || "remote-media").slice(0, 200);
    return trimmed || "remote-media";
  } catch {
    return "remote-media";
  }
}

async function createScanFromUrl({ userId, url }) {
  const scanId = uuidv4();
  const filename = filenameFromUrl(url);

  await pool.query(
    `INSERT INTO scans (id, user_id, filename, mime_type, file_size_bytes, status,
                        source_type, storage_key, storage_provider, source_url)
     VALUES ($1, $2, $3, 'application/octet-stream', 0, 'pending', 'url', NULL, NULL, $4)`,
    [scanId, userId, filename, url]
  );

  await scanQueue.add("scan-media", queuePayload(scanId, userId), {
    jobId: scanId,
    ...defaultJobOpts
  });

  return { id: scanId, status: "pending" };
}

async function getScanById({ scanId, userId }) {
  const { rows } = await pool.query(
    `SELECT ${SCAN_SELECT_FIELDS}
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
      `SELECT ${SCAN_SELECT_FIELDS}
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
  createScanFromUpload,
  createScanFromUrl,
  getScanById,
  getScanHistory
};
