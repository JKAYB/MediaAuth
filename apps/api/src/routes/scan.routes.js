const express = require("express");
const {
  submitScan,
  getScanResult,
  scanHistory
} = require("../controllers/scan.controller");
const { authMiddleware, requireUser } = require("../middleware/auth.middleware");
const { apiKeyMiddleware } = require("../middleware/apikey.middleware");
const { upload } = require("../middleware/upload.middleware");

const router = express.Router();

router.use(authMiddleware);
router.use(apiKeyMiddleware);
router.use(requireUser);

router.post("/", upload.single("file"), submitScan);
router.get("/history", scanHistory);
router.get("/:id", getScanResult);

module.exports = router;
