import { motion } from "framer-motion";

const data = [12, 18, 14, 22, 30, 26, 34, 28, 40, 36, 48, 42, 52, 60];

export function ActivityChart() {
  const max = Math.max(...data);
  return (
    <div className="flex h-40 items-end gap-1.5">
      {data.map((v, i) => {
        const h = (v / max) * 100;
        return (
          <motion.div
            key={i}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: `${h}%`, opacity: 1 }}
            transition={{ duration: 0.6, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
            className="group relative flex-1 rounded-sm bg-gradient-to-t from-primary/40 to-accent/70 hover:from-primary hover:to-accent"
          >
            <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 rounded bg-card px-1.5 py-0.5 text-[10px] font-mono opacity-0 ring-1 ring-border transition group-hover:opacity-100">
              {v}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}
