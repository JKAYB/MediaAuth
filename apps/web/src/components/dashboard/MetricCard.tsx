import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  delta,
  trend,
  index = 0,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  delta: string;
  trend: "up" | "down";
  index?: number;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const positive = trend === "up";
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -3 }}
      className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-5 backdrop-blur-xl elevated"
    >
      <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 opacity-50 blur-2xl transition-opacity group-hover:opacity-80" />
      <div className="relative flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {Icon && (
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-muted/60 text-primary ring-1 ring-border">
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
      <div className="relative mt-3 flex items-end justify-between">
        <div className="font-display text-3xl font-semibold tracking-tight">{value}</div>
        <div
          className={cn(
            "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium",
            positive
              ? "bg-[oklch(0.74_0.17_155_/_0.12)] text-[oklch(0.85_0.17_155)]"
              : "bg-destructive/15 text-[oklch(0.8_0.2_22)]",
          )}
        >
          {positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {delta}
        </div>
      </div>
    </motion.div>
  );
}
