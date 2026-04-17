import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { FileVideo, FileImage, FileAudio, Link2, ChevronRight } from "lucide-react";
import { StatusBadge } from "@/components/ui-ext/StatusBadge";
import type { Scan } from "@/lib/mock-data";
import { timeAgo } from "@/lib/mock-data";

const iconFor = {
  video: FileVideo,
  image: FileImage,
  audio: FileAudio,
  url: Link2,
};

export function ScanRow({ scan, index = 0 }: { scan: Scan; index?: number }) {
  const Icon = iconFor[scan.kind];
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
    >
      <Link
        to="/scans/$id"
        params={{ id: scan.id }}
        className="group flex items-center gap-4 rounded-xl border border-transparent px-3 py-3 transition hover:border-border hover:bg-card/60"
      >
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted/60 text-muted-foreground ring-1 ring-border">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{scan.title}</div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">{scan.id}</span>
            <span>·</span>
            <span>{timeAgo(scan.createdAt)}</span>
          </div>
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          <div className="text-right">
            <div className="font-mono text-sm tabular-nums">{scan.confidence}%</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">conf.</div>
          </div>
        </div>
        <StatusBadge status={scan.status} />
        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
      </Link>
    </motion.div>
  );
}
