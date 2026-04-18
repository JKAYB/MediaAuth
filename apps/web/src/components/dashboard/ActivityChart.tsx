import { motion } from "framer-motion";
import type { ScanActivityPoint } from "@/lib/api";

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
};

export function ActivityChart({ points, useDemoFallback }: ActivityChartProps) {
  const series = useDemoFallback ? DEMO_POINTS : points;
  const values = series.map((p) => p.total);
  const max = Math.max(1, ...values);

  return (
    <div className="flex h-40 items-end gap-1.5">
      {series.map((p, i) => {
        const v = p.total;
        const h = (v / max) * 100;
        return (
          <motion.div
            key={p.date}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: `${h}%`, opacity: 1 }}
            transition={{ duration: 0.6, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
            className="group relative flex-1 rounded-sm bg-gradient-to-t from-primary/40 to-accent/70 hover:from-primary hover:to-accent"
          >
            <span className="pointer-events-none absolute -top-7 left-1/2 z-10 w-max max-w-[8rem] -translate-x-1/2 rounded bg-card px-1.5 py-0.5 text-center text-[10px] font-mono opacity-0 ring-1 ring-border transition group-hover:opacity-100">
              {useDemoFallback ? v : `${p.date}: ${v}`}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}
