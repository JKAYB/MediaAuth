"use strict";

const VALID_RANGES = /** @type {const} */ ({ "7d": 7, "14d": 14, "30d": 30 });

/**
 * @param {string | import('express').Request['query'][string]} [raw]
 * @returns {{ ok: true, range: keyof typeof VALID_RANGES, days: number } | { ok: false, error: string }}
 */
function parseScanAnalyticsRange(raw) {
  const key = raw == null || raw === "" ? "14d" : String(raw).trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(VALID_RANGES, key)) {
    return {
      ok: false,
      error: `range must be one of: ${Object.keys(VALID_RANGES).join(", ")}`
    };
  }
  return { ok: true, range: /** @type {keyof typeof VALID_RANGES} */ (key), days: VALID_RANGES[key] };
}

/**
 * @param {string | import('express').Request['query'][string]} [raw]
 * @returns {{ ok: true, groupBy: "day" } | { ok: false, error: string }}
 */
function parseScanAnalyticsGroupBy(raw) {
  const v = raw == null || raw === "" ? "day" : String(raw).trim().toLowerCase();
  if (v !== "day") {
    return { ok: false, error: 'groupBy must be "day"' };
  }
  return { ok: true, groupBy: "day" };
}

/**
 * Inclusive first day 00:00 UTC through inclusive last day = today UTC,
 * with exclusive upper bound at start of (last day + 1) for SQL `created_at < endExclusive`.
 *
 * @param {number} days
 * @param {Date} [now]
 * @returns {{ firstDayStart: Date; lastDayStart: Date; endExclusive: Date }}
 */
function getUtcRangeBounds(days, now = new Date()) {
  const y = now.getUTCFullYear();
  const mo = now.getUTCMonth();
  const d = now.getUTCDate();
  const lastDayStart = new Date(Date.UTC(y, mo, d, 0, 0, 0, 0));
  const firstDayStart = new Date(lastDayStart);
  firstDayStart.setUTCDate(firstDayStart.getUTCDate() - (days - 1));
  const endExclusive = new Date(lastDayStart);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return { firstDayStart, lastDayStart, endExclusive };
}

/**
 * @param {Date} firstDayStart UTC midnight
 * @param {Date} lastDayStart UTC midnight
 * @returns {string[]} YYYY-MM-DD
 */
function enumerateUtcCalendarDays(firstDayStart, lastDayStart) {
  const out = [];
  const cur = new Date(firstDayStart);
  while (cur.getTime() <= lastDayStart.getTime()) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

module.exports = {
  VALID_RANGES,
  parseScanAnalyticsRange,
  parseScanAnalyticsGroupBy,
  getUtcRangeBounds,
  enumerateUtcCalendarDays
};
