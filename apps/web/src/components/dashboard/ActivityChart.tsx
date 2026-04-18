import { motion } from "framer-motion";
import type { ScanActivityPoint, ScanActivitySummary } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Demo / fallback heights (relative), same length as previous mock. */
const DEMO_POINTS: ScanActivityPoint[] = [
  12, 18, 14, 22, 30, 26, 34, 28, 40, 36, 48, 42, 52, 60,
].map((total, i) => ({
  date: `demo-${i}`,
  total,
  pending: 0,
  processing: 0,
  completed: 0,
  failed: 0,
  other: 0,
}));

type ActivityChartProps = {
  points: ScanActivityPoint[];
  /** Live demo: show the original illustrative series (ignores `points`). */
  useDemoFallback?: boolean;
  /** Real account data: compact totals under the chart; zeros stay legible. */
  summary?: ScanActivitySummary | null;
  /** Copy for empty state (matches selected range). */
  rangeDayCount?: number;
};

function barHeightPercent(
  v: number,
  maxValue: number,
  scaleMax: number,
  allZeros: boolean,
): number {
  if (allZeros) return 16;
  if (v === 0) return Math.max((v / scaleMax) * 100, 7);
  return (v / scaleMax) * 100;
}

function ActivitySummaryFooter({ summary }: { summary: ScanActivitySummary }) {
  const queue = summary.pending + summary.processing;
  const items = [
    { label: "Total", value: summary.total },
    { label: "Completed", value: summary.completed },
    { label: "In queue", value: queue },
  ];
  return (
    <div
      className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-2 border-t border-border/60 pt-3 sm:justify-between sm:gap-x-8"
      aria-label="Period scan totals"
    >
      {items.map(({ label, value }) => (
        <div key={label} className="min-w-[3.25rem] text-center sm:text-left">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
          <div
            className={cn(
              "mt-0.5 font-mono text-sm tabular-nums tracking-tight text-foreground",
              value === 0 ? "font-semibold" : "font-medium",
            )}
          >
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ActivityChart({
  points,
  useDemoFallback,
  summary,
  rangeDayCount = 14,
}: ActivityChartProps) {
  const series = useDemoFallback ? DEMO_POINTS : points;
  const values = series.map((p) => p.total);
  const maxValue = series.length > 0 ? Math.max(0, ...values) : 0;
  const allZeros = series.length > 0 && maxValue === 0;
  const scaleMax = maxValue > 0 ? maxValue : 1;

  const showEmptyPlaceholder = !useDemoFallback && series.length === 0;

  if (showEmptyPlaceholder) {
    const hasTotalsButNoPoints = summary != null && summary.total > 0;
    return (
      <div>
        <div
          className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/20 px-4 py-6 text-center"
          role="img"
          aria-label="No daily scan activity for this period"
        >
          <p className="text-sm font-medium text-foreground">No scan activity in this period</p>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
            Daily totals will appear after you run scans. Selected range: last {rangeDayCount} days.
          </p>
          {hasTotalsButNoPoints && (
            <p className="mt-3 text-xs text-muted-foreground">
              Period totals are shown below — daily breakdown is unavailable for this range.
            </p>
          )}
        </div>
        {/* {summary != null && <ActivitySummaryFooter summary={summary} />} */}
      </div>
    );
  }

  return (
    <div>
      {allZeros && !useDemoFallback && (
        <p className="mb-2 text-center text-xs text-muted-foreground">
          All days in this range recorded zero scans.
        </p>
      )}
      <div
        className="flex h-40 items-end gap-1.5 border-b border-border/60"
        role="img"
        aria-label={
          allZeros
            ? "Scan activity chart: zero scans for each day in range"
            : "Scan activity by day"
        }
      >
        {series.map((p, i) => {
          const v = p.total;
          const h = barHeightPercent(v, maxValue, scaleMax, allZeros);
          const mutedZero = allZeros || (maxValue > 0 && v === 0);
          const tooltipLabel = useDemoFallback
            ? String(v)
            : `${p.date} · ${v} scan${v === 1 ? "" : "s"}`;
          return (
            <motion.div
              key={p.date}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: `${h}%`, opacity: 1 }}
              transition={{ duration: 0.6, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                "group relative min-w-0 flex-1 rounded-sm",
                mutedZero
                  ? "bg-gradient-to-t from-muted/95 to-muted/55 ring-1 ring-inset ring-border/80 hover:from-muted hover:to-muted/70"
                  : "bg-gradient-to-t from-primary/40 to-accent/70 hover:from-primary hover:to-accent",
              )}
            >
              <span className="pointer-events-none absolute -top-7 left-1/2 z-10 w-max max-w-[10rem] -translate-x-1/2 rounded-md bg-card px-1.5 py-0.5 text-center text-[10px] font-mono text-foreground opacity-0 shadow-sm ring-1 ring-border transition group-hover:opacity-100">
                {tooltipLabel}
              </span>
            </motion.div>
          );
        })}
      </div>
      {/* {summary != null && !useDemoFallback && <ActivitySummaryFooter summary={summary} />} */}
    </div>
  );
}
