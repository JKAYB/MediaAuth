const express = require("express");
const authRoutes = require("./routes/auth.routes");
const scanRoutes = require("./routes/scan.routes");
const { errorHandler, notFoundHandler } = require("./middleware/error.middleware");

function createApp() {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/auth", authRoutes);
  app.use("/scan", scanRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
