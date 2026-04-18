const {
  getScanAdmin,
  listScansAdmin,
  listStuckProcessingAdmin,
  countsByStatusAdmin,
  retryScanAdmin,
  resetStuckProcessingScanAdmin
} = require("../services/scanAdmin.service");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function truthyQuery(v) {
  const s = String(v || "")
    .trim()
    .toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

function assertUuid(id) {
  if (!id || !UUID_RE.test(String(id))) {
    const err = new Error("Invalid scan id");
    err.status = 400;
    throw err;
  }
}

async function list(req, res, next) {
  try {
    const result = await listScansAdmin({
      status: req.query.status || undefined,
      detectionProvider: req.query.detection_provider || undefined,
      createdAfter: req.query.created_after || undefined,
      createdBefore: req.query.created_before || undefined,
      limit: req.query.limit,
      offset: req.query.offset
    });
    return res.json(result);
  } catch (e) {
    return next(e);
  }
}

async function listStuck(req, res, next) {
  try {
    const result = await listStuckProcessingAdmin({
      staleMinutes: req.query.minutes,
      limit: req.query.limit
    });
    return res.json(result);
  } catch (e) {
    return next(e);
  }
}

async function countsByStatus(req, res, next) {
  try {
    const result = await countsByStatusAdmin();
    return res.json(result);
  } catch (e) {
    return next(e);
  }
}

async function getOne(req, res, next) {
  try {
    assertUuid(req.params.id);
    const row = await getScanAdmin(req.params.id);
    if (!row) {
      return res.status(404).json({ error: "Scan not found" });
    }
    return res.json(row);
  } catch (e) {
    return next(e);
  }
}

async function retry(req, res, next) {
  try {
    assertUuid(req.params.id);
    const allowCompleted = truthyQuery(req.query.allow_completed);
    const row = await retryScanAdmin(req.params.id, { allowCompleted });
    return res.status(200).json({ ok: true, scan: row });
  } catch (e) {
    return next(e);
  }
}

async function resetStuck(req, res, next) {
  try {
    assertUuid(req.params.id);
    const staleMinutes = req.query.minutes != null ? req.query.minutes : req.body?.minutes;
    const row = await resetStuckProcessingScanAdmin(req.params.id, { staleMinutes });
    return res.status(200).json({ ok: true, scan: row });
  } catch (e) {
    return next(e);
  }
}

module.exports = {
  list,
  listStuck,
  countsByStatus,
  getOne,
  retry,
  resetStuck
};
