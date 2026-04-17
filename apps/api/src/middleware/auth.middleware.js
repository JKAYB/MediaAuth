const jwt = require("jsonwebtoken");

function authMiddleware(req, _res, next) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    return next();
  }

  const token = auth.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "change-me");
    req.user = { id: payload.sub, email: payload.email };
    return next();
  } catch (_error) {
    return next();
  }
}

function requireUser(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  return next();
}

module.exports = { authMiddleware, requireUser };
