require("dotenv").config({
  path: require("path").resolve(__dirname, "../../../.env")
});

const { describeObjectStorageReadiness } = require("@media-auth/scan-storage");

const os = describeObjectStorageReadiness();
if (!os.ok) {
  console.error(`[scan-worker] object storage configuration invalid: ${os.issues.join("; ")}`);
  process.exit(1);
}
console.info(`[scan-worker] object_storage=${JSON.stringify({ provider: os.provider, ok: true })}`);

const { createScanWorker } = require("./queues/scanWorker");

createScanWorker();
