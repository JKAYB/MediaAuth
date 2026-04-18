/**
 * @param {string[]} keys
 * @returns {Record<string, string | undefined>}
 */
function snapshotEnv(keys) {
  const snap = {};
  for (const k of keys) {
    snap[k] = process.env[k];
  }
  return snap;
}

/**
 * @param {Record<string, string | undefined>} snapshot
 */
function restoreEnv(snapshot) {
  for (const k of Object.keys(snapshot)) {
    if (snapshot[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = snapshot[k];
    }
  }
}

/**
 * @param {Record<string, string | undefined>} updates
 * @param {() => void | Promise<void>} fn
 */
async function withEnv(updates, fn) {
  const keys = Object.keys(updates);
  const snap = snapshotEnv(keys);
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  try {
    await fn();
  } finally {
    restoreEnv(snap);
  }
}

module.exports = {
  snapshotEnv,
  restoreEnv,
  withEnv
};
