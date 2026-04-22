"use strict";

function privateCacheNoStore(_req, res, next) {
  res.setHeader("Cache-Control", "no-store, private, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
}

module.exports = { privateCacheNoStore };
