require("dotenv").config({
  path: require("path").resolve(__dirname, "../../../.env")
});

const { describeObjectStorageReadiness } = require("@media-auth/scan-storage");

const os = describeObjectStorageReadiness();
if (!os.ok) {
  console.error(`[api] object storage configuration invalid: ${os.issues.join("; ")}`);
  process.exit(1);
}
console.info(`[api] object_storage=${JSON.stringify({ provider: os.provider, ok: true })}`);

const { createApp } = require("./app");

const port = Number(process.env.PORT || 4000);
const app = createApp();

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
