const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Check your .env loading path.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

module.exports = { pool };
