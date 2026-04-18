const Redis = require("ioredis");

const url = process.env.REDIS_URL || "redis://127.0.0.1:6379";

const connection = new Redis(url, {
  maxRetriesPerRequest: null
});

module.exports = { connection, redisUrl: url };
