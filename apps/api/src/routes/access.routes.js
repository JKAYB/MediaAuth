const express = require("express");
const {
  selectPlan,
  getAccessState,
  getMyTeam,
  addTeamMember,
  removeTeamMember,
} = require("../controllers/access.controller");
const { authMiddleware, requireUser } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(authMiddleware);
router.use(requireUser);

router.get("/me", getAccessState);
router.post("/select", selectPlan);
router.get("/team", getMyTeam);
router.post("/team/members", addTeamMember);
router.delete("/team/members/:userId", removeTeamMember);

module.exports = router;
