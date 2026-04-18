"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  parseScanAnalyticsRange,
  parseScanAnalyticsGroupBy,
  getUtcRangeBounds,
  enumerateUtcCalendarDays
} = require("../src/utils/scanAnalyticsRange.util");
const { classifyScanForMix, DETECTION_MIX_KEYS } = require("../src/utils/detectionCategory.util");
const {
  mergeActivityRows,
  summarizeActivityPoints
} = require("../src/utils/scanAnalyticsActivity.util");

describe("parseScanAnalyticsRange", () => {
  it("defaults to 14d", () => {
    const r = parseScanAnalyticsRange(undefined);
    assert.equal(r.ok, true);
    assert.equal(r.range, "14d");
    assert.equal(r.days, 14);
  });

  it("accepts 7d 14d 30d case-insensitively", () => {
    const r = parseScanAnalyticsRange("7D");
    assert.equal(r.ok, true);
    assert.equal(r.range, "7d");
    assert.equal(r.days, 7);
  });

  it("rejects invalid range", () => {
    const r = parseScanAnalyticsRange("1y");
    assert.equal(r.ok, false);
    assert.match(String(r.error), /7d, 14d, 30d/);
  });
});

describe("parseScanAnalyticsGroupBy", () => {
  it("defaults to day", () => {
    const g = parseScanAnalyticsGroupBy(undefined);
    assert.equal(g.ok, true);
    assert.equal(g.groupBy, "day");
  });

  it("rejects non-day", () => {
    const g = parseScanAnalyticsGroupBy("week");
    assert.equal(g.ok, false);
  });
});

describe("getUtcRangeBounds / enumerateUtcCalendarDays", () => {
  it("returns consecutive UTC days count matching range", () => {
    const clock = new Date(Date.UTC(2026, 3, 18, 15, 30, 0));
    const { firstDayStart, lastDayStart, endExclusive } = getUtcRangeBounds(7, clock);
    assert.equal(firstDayStart.toISOString(), "2026-04-12T00:00:00.000Z");
    assert.equal(lastDayStart.toISOString(), "2026-04-18T00:00:00.000Z");
    assert.equal(endExclusive.toISOString(), "2026-04-19T00:00:00.000Z");
    const days = enumerateUtcCalendarDays(firstDayStart, lastDayStart);
    assert.equal(days.length, 7);
    assert.equal(days[0], "2026-04-12");
    assert.equal(days[6], "2026-04-18");
  });
});

describe("mergeActivityRows", () => {
  it("fills zeros for missing days and merges statuses", () => {
    const dates = ["2026-04-10", "2026-04-11", "2026-04-12"];
    const rows = [
      { day: "2026-04-10", status: "pending", cnt: 2 },
      { day: "2026-04-10", status: "completed", cnt: 1 },
      { day: "2026-04-12", status: "failed", cnt: 1 },
      { day: "2026-04-12", status: "weird", cnt: 3 }
    ];
    const points = mergeActivityRows(dates, rows);
    assert.equal(points.length, 3);
    assert.deepEqual(points[0], {
      date: "2026-04-10",
      total: 3,
      pending: 2,
      processing: 0,
      completed: 1,
      failed: 0,
      other: 0
    });
    assert.deepEqual(points[1], {
      date: "2026-04-11",
      total: 0,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      other: 0
    });
    assert.equal(points[2].total, 4);
    assert.equal(points[2].failed, 1);
    assert.equal(points[2].other, 3);
  });
});

describe("summarizeActivityPoints", () => {
  it("sums across points", () => {
    const s = summarizeActivityPoints([
      { total: 2, pending: 1, processing: 0, completed: 1, failed: 0, other: 0 },
      { total: 1, pending: 0, processing: 0, completed: 0, failed: 1, other: 0 }
    ]);
    assert.deepEqual(s, { total: 3, pending: 1, processing: 0, completed: 1, failed: 1, other: 0 });
  });
});

describe("classifyScanForMix", () => {
  it("maps completed rows by is_ai_generated", () => {
    assert.equal(classifyScanForMix({ status: "completed", is_ai_generated: false }), "authentic");
    assert.equal(classifyScanForMix({ status: "completed", is_ai_generated: true }), "manipulated");
    assert.equal(classifyScanForMix({ status: "completed", is_ai_generated: null }), "suspicious");
  });

  it("maps failed to suspicious", () => {
    assert.equal(classifyScanForMix({ status: "failed", is_ai_generated: null }), "suspicious");
  });

  it("excludes pending and processing", () => {
    assert.equal(classifyScanForMix({ status: "pending", is_ai_generated: null }), null);
    assert.equal(classifyScanForMix({ status: "processing", is_ai_generated: false }), null);
  });
});

describe("DETECTION_MIX_KEYS", () => {
  it("has stable three-way ordering", () => {
    assert.deepEqual([...DETECTION_MIX_KEYS], ["authentic", "suspicious", "manipulated"]);
  });
});
