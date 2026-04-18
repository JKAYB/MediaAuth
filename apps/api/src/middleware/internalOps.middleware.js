const crypto = require("crypto");

/**
 * Constant-time compare of two UTF-8 strings via fixed-length digests.
 * @param {string} a
 * @param {string} b
 */
function timingSafeStringEqual(a, b) {
  const ha = crypto.createHash("sha256").update(a, "utf8").digest();
  const hb = crypto.createHash("sha256").update(b, "utf8").digest();
  return ha.length === hb.length && crypto.timingSafeEqual(ha, hb);
}

/**
 * Protects internal/operational routes. Configure `INTERNAL_OPS_TOKEN` (non-empty) to mount routes in `createApp`.
 * Send token as `X-Internal-Token: <token>` (preferred) or `Authorization: Internal <token>`.
 */
function internalOpsMiddleware(req, res, next) {
  const expected = process.env.INTERNAL_OPS_TOKEN;
  if (!expected || !String(expected).trim()) {
    return res.status(404).json({ error: "Not found" });
  }

  const header = req.get("x-internal-token") || "";
  const auth = req.get("authorization") || "";
  const bearer = auth.startsWith("Internal ") ? auth.slice("Internal ".length).trim() : "";

  const provided = header.trim() || bearer;
  if (!provided || !timingSafeStringEqual(provided, String(expected).trim())) {
    return res.status(403).json({ error: "Forbidden" });
  }

  return next();
}

module.exports = { internalOpsMiddleware };
