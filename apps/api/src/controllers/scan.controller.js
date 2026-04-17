const { createScan, getScanById, getScanHistory } = require("../services/scan.service");

function parsePagination(query) {
  const page = Number.parseInt(query.page, 10);
  const limit = Number.parseInt(query.limit, 10);

  return {
    page: Number.isNaN(page) || page < 1 ? 1 : page,
    limit: Number.isNaN(limit) || limit < 1 ? 10 : Math.min(limit, 100)
  };
}

async function submitScan(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "file is required" });
    }

    const scan = await createScan({ userId: req.user.id, file: req.file });
    return res.status(202).json(scan);
  } catch (error) {
    return next(error);
  }
}

async function getScanResult(req, res, next) {
  try {
    const scan = await getScanById({ scanId: req.params.id, userId: req.user.id });
    if (!scan) {
      return res.status(404).json({ error: "Scan not found" });
    }

    return res.json(scan);
  } catch (error) {
    return next(error);
  }
}

async function scanHistory(req, res, next) {
  try {
    const { page, limit } = parsePagination(req.query);
    const result = await getScanHistory({ userId: req.user.id, page, limit });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

module.exports = { submitScan, getScanResult, scanHistory };
