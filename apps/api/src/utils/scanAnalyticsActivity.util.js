"use strict";

/**
 * @param {string[]} datesOrdered
 * @param {Array<{ day: string; status: string; cnt: number }>} rows
 */
function mergeActivityRows(datesOrdered, rows) {
  /** @type {Map<string, { date: string; total: number; pending: number; processing: number; completed: number; failed: number; other: number }>} */
  const byDay = new Map();
  for (const date of datesOrdered) {
    byDay.set(date, {
      date,
      total: 0,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      other: 0
    });
  }

  for (const r of rows) {
    const day = String(r.day);
    const bucket = byDay.get(day);
    if (!bucket) {
      continue;
    }
    const c = Number(r.cnt) || 0;
    const st = String(r.status || "").toLowerCase();
    bucket.total += c;
    if (st === "pending") bucket.pending += c;
    else if (st === "processing") bucket.processing += c;
    else if (st === "completed") bucket.completed += c;
    else if (st === "failed") bucket.failed += c;
    else bucket.other += c;
  }

  return datesOrdered.map((d) => byDay.get(d));
}

/**
 * @param {Array<{ total: number; pending: number; processing: number; completed: number; failed: number; other: number }>} points
 */
function summarizeActivityPoints(points) {
  return points.reduce(
    (acc, p) => ({
      total: acc.total + p.total,
      pending: acc.pending + p.pending,
      processing: acc.processing + p.processing,
      completed: acc.completed + p.completed,
      failed: acc.failed + p.failed,
      other: acc.other + p.other
    }),
    { total: 0, pending: 0, processing: 0, completed: 0, failed: 0, other: 0 }
  );
}

module.exports = {
  mergeActivityRows,
  summarizeActivityPoints
};
