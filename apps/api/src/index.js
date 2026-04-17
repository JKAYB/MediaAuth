require("dotenv").config({
  path: require("path").resolve(__dirname, "../../../.env")
});

const { createApp } = require("./app");

const port = Number(process.env.PORT || 4000);
const app = createApp();

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
