const express = require("express");
const {
  list,
  listStuck,
  countsByStatus,
  getOne,
  retry,
  resetStuck
} = require("../controllers/scanAdmin.controller");

const router = express.Router();

router.get("/counts-by-status", countsByStatus);
router.get("/stuck", listStuck);
router.get("/", list);
router.get("/:id", getOne);
router.post("/:id/retry", retry);
router.post("/:id/reset-stuck", resetStuck);

module.exports = router;
