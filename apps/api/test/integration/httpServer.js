const http = require("http");
const { createApp } = require("../../src/app");

/**
 * @returns {Promise<{ baseUrl: string; close: () => Promise<void> }>}
 */
function startTestServer() {
  const app = createApp();
  const server = http.createServer(app);
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      try {
        const addr = server.address();
        if (!addr || typeof addr === "string") {
          reject(new Error("invalid server address"));
          return;
        }
        const baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve({
          baseUrl,
          close: () =>
            new Promise((res, rej) => {
              server.close((err) => (err ? rej(err) : res()));
            })
        });
      } catch (e) {
        reject(e);
      }
    });
    server.on("error", reject);
  });
}

module.exports = { startTestServer };
