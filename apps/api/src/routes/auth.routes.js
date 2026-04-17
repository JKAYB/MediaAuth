const express = require("express");
const {
  signup,
  login,
  listApiKeys,
  createApiKey,
  deleteApiKey
} = require("../controllers/auth.controller");
const { authMiddleware, requireUser } = require("../middleware/auth.middleware");

const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);
router.get("/apikeys", authMiddleware, requireUser, listApiKeys);
router.post("/apikeys", authMiddleware, requireUser, createApiKey);
router.delete("/apikeys/:id", authMiddleware, requireUser, deleteApiKey);

module.exports = router;
