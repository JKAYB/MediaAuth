const { pool } = require("../db/pool");

async function apiKeyMiddleware(req, _res, next) {
  if (req.user) {
    return next();
  }

  const header = req.headers["x-api-key"];
  if (!header) {
    return next();
  }

  const { rows } = await pool.query(
    "SELECT user_id FROM api_keys WHERE key_value = $1 LIMIT 1",
    [header]
  );

  if (rows[0]) {
    req.user = { id: rows[0].user_id };
  }
  return next();
}

module.exports = { apiKeyMiddleware };
