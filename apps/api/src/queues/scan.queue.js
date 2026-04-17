const { Queue } = require("bullmq");
const { connection } = require("../db/redis");

const scanQueue = new Queue("scan-jobs", { connection });

module.exports = { scanQueue };
