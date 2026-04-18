"use strict";

const { pool } = require("../db/pool");
const {
  parseScanAnalyticsRange,
  parseScanAnalyticsGroupBy,
  getUtcRangeBounds,
  enumerateUtcCalendarDays
} = require("../utils/scanAnalyticsRange.util");
const {
  DETECTION_MIX_KEYS,
  DETECTION_MIX_LABELS,
  classifyScanForMix
} = require("../utils/detectionCategory.util");
const { mergeActivityRows, summarizeActivityPoints } = require("../utils/scanAnalyticsActivity.util");

function validationError(message) {
  const e = new Error(message);
  /** @type {import('express').Error & { status?: number }} */
  const err = e;
  err.status = 400;
  return err;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * @param {{ userId: string; range?: string; groupBy?: string; clock?: Date }} opts
 */
async function getScanActivityAnalytics(opts) {
  const rangeParsed = parseScanAnalyticsRange(opts.range);
  if (!rangeParsed.ok) {
    throw validationError(rangeParsed.error);
  }
  const groupParsed = parseScanAnalyticsGroupBy(opts.groupBy);
  if (!groupParsed.ok) {
    throw validationError(groupParsed.error);
  }

  const clock = opts.clock || new Date();
  const { firstDayStart, lastDayStart, endExclusive } = getUtcRangeBounds(rangeParsed.days, clock);
  const dates = enumerateUtcCalendarDays(firstDayStart, lastDayStart);

  const { rows } = await pool.query(
    `SELECT to_char((created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
            status,
            COUNT(*)::int AS cnt
     FROM scans
     WHERE user_id = $1::uuid
       AND created_at >= $2::timestamptz
       AND created_at < $3::timestamptz
     GROUP BY day, status
     ORDER BY day`,
    [opts.userId, firstDayStart, endExclusive]
  );

  const points = mergeActivityRows(dates, rows);
  const summary = summarizeActivityPoints(points);

  return {
    range: rangeParsed.range,
    groupBy: groupParsed.groupBy,
    summary,
    points
  };
}

/**
 * @param {{ userId: string; range?: string; clock?: Date }} opts
 */
async function getDetectionMixAnalytics(opts) {
  const rangeParsed = parseScanAnalyticsRange(opts.range);
  if (!rangeParsed.ok) {
    throw validationError(rangeParsed.error);
  }

  const clock = opts.clock || new Date();
  const { firstDayStart, endExclusive } = getUtcRangeBounds(rangeParsed.days, clock);

  const { rows } = await pool.query(
    `SELECT status, is_ai_generated, COUNT(*)::int AS cnt
     FROM scans
     WHERE user_id = $1::uuid
       AND created_at >= $2::timestamptz
       AND created_at < $3::timestamptz
       AND status IN ('completed', 'failed')
     GROUP BY status, is_ai_generated`,
    [opts.userId, firstDayStart, endExclusive]
  );

  /** @type {Record<string, number>} */
  const counts = { authentic: 0, suspicious: 0, manipulated: 0 };
  for (const r of rows) {
    const cat = classifyScanForMix(r);
    if (cat) {
      counts[cat] += Number(r.cnt) || 0;
    }
  }

  const total = counts.authentic + counts.suspicious + counts.manipulated;
  const items = DETECTION_MIX_KEYS.map((key) => {
    const count = counts[key];
    const percentage = total === 0 ? 0 : round2((count / total) * 100);
    return {
      key,
      label: DETECTION_MIX_LABELS[key],
      count,
      percentage
    };
  });

  return {
    range: rangeParsed.range,
    total,
    items
  };
}

module.exports = {
  getScanActivityAnalytics,
  getDetectionMixAnalytics
};
