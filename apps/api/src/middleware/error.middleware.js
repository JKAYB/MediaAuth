function notFoundHandler(_req, res) {
  res.status(404).json({ error: "Not found" });
}

function errorHandler(error, _req, res, _next) {
  const status = error.status || 500;
  const body = { error: error.message || "Unexpected error" };

  if (process.env.NODE_ENV !== "production") {
    body.stack = error.stack;
  }

  res.status(status).json(body);
}

module.exports = { notFoundHandler, errorHandler };
