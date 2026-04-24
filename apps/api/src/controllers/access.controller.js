const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../db/pool");
const {
  canManageTeam,
  getEffectivePlan,
  PLAN_CODE_FREE,
  PLAN_CODE_INDIVIDUAL_MONTHLY,
  PLAN_CODE_INDIVIDUAL_YEARLY,
  PLAN_CODE_TEAM,
} = require("../services/access-control.service");

const PAID_DURATION_DAYS = {
  [PLAN_CODE_INDIVIDUAL_MONTHLY]: 30,
  [PLAN_CODE_INDIVIDUAL_YEARLY]: 365,
  [PLAN_CODE_TEAM]: 30,
};

function randomTempPassword() {
  return `Temp${Math.random().toString(36).slice(2, 10)}A1!`;
}

async function selectPlan(req, res, next) {
  try {
    const planCode = String(req.body?.planCode || "").trim().toLowerCase();
    const allowed = new Set([
      PLAN_CODE_FREE,
      PLAN_CODE_INDIVIDUAL_MONTHLY,
      PLAN_CODE_INDIVIDUAL_YEARLY,
      PLAN_CODE_TEAM,
    ]);
    if (!allowed.has(planCode)) {
      return res.status(400).json({ error: "Invalid plan selection" });
    }

    const effectiveBefore = await getEffectivePlan(req.user.id);
    if (effectiveBefore.teamRole === "team_member") {
      return res.status(403).json({ error: "Plan is managed by your team owner" });
    }

    await pool.query("BEGIN");
    try {
      // Always clear existing team associations before recomputing new entitlement context.
      // This prevents stale team-based unlimited access after switching away from Team.
      const ownedTeams = await pool.query("SELECT id FROM teams WHERE owner_user_id = $1", [req.user.id]);
      for (const t of ownedTeams.rows) {
        await pool.query("DELETE FROM teams WHERE id = $1", [t.id]);
      }
      await pool.query("DELETE FROM team_members WHERE user_id = $1", [req.user.id]);

      await pool.query("UPDATE users SET plan = $1, plan_selected = TRUE WHERE id = $2", [
        planCode,
        req.user.id,
      ]);

      if (planCode === PLAN_CODE_FREE) {
        await pool.query("COMMIT");
        return res.json({ ok: true, planCode });
      }

      if (planCode === PLAN_CODE_TEAM) {
        const teamId = uuidv4();
        await pool.query("INSERT INTO teams (id, owner_user_id, name) VALUES ($1, $2, $3)", [
          teamId,
          req.user.id,
          "My Team",
        ]);
        await pool.query(
          `INSERT INTO subscriptions (id, user_id, team_id, plan_code, status, started_at, expires_at)
           VALUES ($1, NULL, $2, $3, 'active', NOW(), NOW() + INTERVAL '30 days')`,
          [uuidv4(), teamId, PLAN_CODE_TEAM],
        );
        await pool.query("COMMIT");
        return res.json({ ok: true, planCode, teamId });
      }

      const days = PAID_DURATION_DAYS[planCode] || 30;
      await pool.query(
        `INSERT INTO subscriptions (id, user_id, team_id, plan_code, status, started_at, expires_at)
         VALUES ($1, $2, NULL, $3, 'active', NOW(), NOW() + ($4::text || ' days')::interval)`,
        [uuidv4(), req.user.id, planCode, String(days)],
      );

      await pool.query("COMMIT");
      return res.json({ ok: true, planCode });
    } catch (txError) {
      await pool.query("ROLLBACK");
      throw txError;
    }
  } catch (error) {
    return next(error);
  }
}

async function getAccessState(req, res, next) {
  try {
    const effectivePlan = await getEffectivePlan(req.user.id);
    return res.json({
      plan_code: effectivePlan.planCode,
      access_state: effectivePlan.accessState,
      scans_used: effectivePlan.scansUsed,
      scan_limit: effectivePlan.scanLimit,
      has_paid_history: effectivePlan.hasPaidHistory,
      plan_selected: effectivePlan.planSelected,
      must_change_password: effectivePlan.mustChangePassword,
      team_role: effectivePlan.teamRole,
      team_id: effectivePlan.teamId,
    });
  } catch (error) {
    return next(error);
  }
}

async function getMyTeam(req, res, next) {
  try {
    const effectivePlan = await getEffectivePlan(req.user.id);
    if (!effectivePlan.teamId) {
      return res.json({ team: null, members: [] });
    }
    const teamQ = await pool.query("SELECT id, owner_user_id, name, created_at FROM teams WHERE id = $1", [
      effectivePlan.teamId,
    ]);
    const membersQ = await pool.query(
      `SELECT u.id, u.email, tm.role, tm.status, u.must_change_password
       FROM team_members tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.team_id = $1
       ORDER BY u.email ASC`,
      [effectivePlan.teamId],
    );
    return res.json({
      team: teamQ.rows[0] || null,
      members: membersQ.rows,
      role: effectivePlan.teamRole,
    });
  } catch (error) {
    return next(error);
  }
}

async function addTeamMember(req, res, next) {
  try {
    const teamCheck = await canManageTeam(req.user.id);
    if (!teamCheck.ok) {
      return res.status(403).json({ error: "Only team owner can manage members" });
    }
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "email is required" });

    let user = (await pool.query("SELECT id FROM users WHERE email = $1 LIMIT 1", [email])).rows[0];
    const tempPassword = randomTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    if (!user) {
      const newId = uuidv4();
      await pool.query(
        `INSERT INTO users (id, email, password_hash, plan, plan_selected, must_change_password)
         VALUES ($1, $2, $3, $4, TRUE, TRUE)`,
        [newId, email, passwordHash, PLAN_CODE_TEAM],
      );
      user = { id: newId };
    } else {
      await pool.query(
        `UPDATE users
         SET password_hash = $1, must_change_password = TRUE, plan = $2, plan_selected = TRUE
         WHERE id = $3`,
        [passwordHash, PLAN_CODE_TEAM, user.id],
      );
    }

    await pool.query(
      `INSERT INTO team_members (team_id, user_id, role, status)
       VALUES ($1, $2, 'team_member', 'active')
       ON CONFLICT (team_id, user_id) DO UPDATE SET role = 'team_member', status = 'active'`,
      [teamCheck.effectivePlan.teamId, user.id],
    );

    return res.status(201).json({
      ok: true,
      user_id: user.id,
      email,
      temporary_password: tempPassword,
      must_change_password: true,
    });
  } catch (error) {
    return next(error);
  }
}

async function removeTeamMember(req, res, next) {
  try {
    const teamCheck = await canManageTeam(req.user.id);
    if (!teamCheck.ok) {
      return res.status(403).json({ error: "Only team owner can manage members" });
    }
    const userId = String(req.params.userId || "").trim();
    if (!userId) return res.status(400).json({ error: "userId is required" });
    await pool.query("DELETE FROM team_members WHERE team_id = $1 AND user_id = $2", [
      teamCheck.effectivePlan.teamId,
      userId,
    ]);
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  selectPlan,
  getAccessState,
  getMyTeam,
  addTeamMember,
  removeTeamMember,
};
