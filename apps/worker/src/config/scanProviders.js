"use strict";

const SCAN_PROVIDERS = [
  {
    id: "reality_defender",
    name: "Reality Defender",
    enabled: true,
    supports: { image: true, video: true, audio: true, url: false },
    access: { free: true, individual: true, organization: true },
    sortOrder: 1,
  },
  {
    id: "hive",
    name: "Hive",
    enabled: true,
    supports: { image: true, video: true, audio: false, url: false },
    access: { free: false, individual: true, organization: true },
    sortOrder: 2,
  },
];

function scanProviders() {
  return SCAN_PROVIDERS.slice().sort((a, b) => a.sortOrder - b.sortOrder);
}

function enabledScanProviders() {
  return scanProviders().filter((p) => p.enabled);
}

module.exports = {
  scanProviders,
  enabledScanProviders,
};
