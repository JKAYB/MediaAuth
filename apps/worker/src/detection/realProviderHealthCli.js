#!/usr/bin/env node
const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "../../../../.env")
});

const { validateRealProviderEnv } = require("./realProviderHealth");

const r = validateRealProviderEnv();
console.log(JSON.stringify(r, null, 2));
process.exit(r.active && !r.ok ? 1 : 0);
