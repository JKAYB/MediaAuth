require("dotenv").config({
  path: require("path").resolve(__dirname, "../../../.env")
});
const { startWorker } = require("./worker");

startWorker();
