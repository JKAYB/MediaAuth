const { v4: uuidv4 } = require("uuid");
const { pool } = require("../db/pool");
const { scanQueue } = require("../queues/scan.queue");

async function submitScan(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "file is required" });
    }

    const scanId = uuidv4();
    await pool.query(
      "INSERT INTO scans (id, user_id, filename, mime_type, status) VALUES ($1, $2, $3, $4, 'queued')",
      [scanId, req.user.id, req.file.originalname, req.file.mimetype]
    );

    await scanQueue.add(
      "scan-media",
      {
        scanId,
        userId: req.user.id,
        filename: req.file.originalname,
        mimeType: req.file.mimetype
      },
      {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000
        }
      }
    );

    return res.status(202).json({ id: scanId, status: "queued" });
  } catch (error) {
    return next(error);
  }
}

async function getScanResult(req, res, next) {
  try {
    const { rows } = await pool.query(
      "SELECT id, status, confidence, is_ai_generated, created_at, completed_at FROM scans WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.id]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: "Scan not found" });
    }

    return res.json(rows[0]);
  } catch (error) {
    return next(error);
  }
}

async function scanHistory(req, res, next) {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 10)));
    const offset = (page - 1) * limit;

    const { rows } = await pool.query(
      "SELECT id, filename, status, confidence, is_ai_generated, created_at, completed_at FROM scans WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
      [req.user.id, limit, offset]
    );

    return res.json({ page, limit, data: rows });
  } catch (error) {
    return next(error);
  }
}

module.exports = { submitScan, getScanResult, scanHistory };
