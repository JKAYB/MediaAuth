const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../db/pool");

async function signup(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = uuidv4();

    await pool.query(
      "INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)",
      [userId, email, passwordHash]
    );

    return res.status(201).json({ id: userId, email });
  } catch (error) {
    return next(error);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1 LIMIT 1", [email]);
    const user = rows[0];

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { sub: user.id, email: user.email },
      process.env.JWT_SECRET || "change-me",
      { expiresIn: "1d" }
    );

    return res.json({ token });
  } catch (error) {
    return next(error);
  }
}

async function listApiKeys(req, res, next) {
  try {
    const { rows } = await pool.query(
      "SELECT id, name, key_value, created_at FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC",
      [req.user.id]
    );
    return res.json({ data: rows });
  } catch (error) {
    return next(error);
  }
}

async function createApiKey(req, res, next) {
  try {
    const id = uuidv4();
    const keyValue = `mak_${uuidv4()}`;
    const name = req.body.name || "Default key";

    await pool.query(
      "INSERT INTO api_keys (id, user_id, key_value, name) VALUES ($1, $2, $3, $4)",
      [id, req.user.id, keyValue, name]
    );

    return res.status(201).json({ id, name, key: keyValue });
  } catch (error) {
    return next(error);
  }
}

async function deleteApiKey(req, res, next) {
  try {
    await pool.query("DELETE FROM api_keys WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
}

async function getMe(req, res, next) {
  try {
    let email = req.user.email;
    if (!email) {
      const { rows } = await pool.query("SELECT id, email FROM users WHERE id = $1 LIMIT 1", [req.user.id]);
      const row = rows[0];
      if (!row) {
        return res.status(404).json({ error: "User not found" });
      }
      email = row.email;
    }
    return res.json({ id: req.user.id, email });
  } catch (error) {
    return next(error);
  }
}

module.exports = { signup, login, listApiKeys, createApiKey, deleteApiKey, getMe };
