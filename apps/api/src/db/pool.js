const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Check your .env loading path.");
}

const databaseUrl = process.env.DATABASE_URL || "";
// Match common local URLs (e.g. .env.docker.example uses 127.0.0.1, not "localhost").
const isLikelyLocalPostgres =
  databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLikelyLocalPostgres ? false : { rejectUnauthorized: false },
});

module.exports = { pool };