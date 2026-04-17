import { cn } from "@/lib/utils";
import type { ScanStatus } from "@/lib/mock-data";
import { statusMeta } from "@/lib/mock-data";
import { CheckCircle2, AlertTriangle, ShieldAlert, Loader2 } from "lucide-react";

const styles: Record<ScanStatus, string> = {
  safe: "bg-[oklch(0.74_0.17_155_/_0.12)] text-[oklch(0.85_0.17_155)] ring-[oklch(0.74_0.17_155_/_0.3)]",
  flagged: "bg-destructive/15 text-[oklch(0.78_0.2_22)] ring-destructive/30",
  suspicious:
    "bg-[oklch(0.8_0.16_80_/_0.12)] text-[oklch(0.88_0.16_80)] ring-[oklch(0.8_0.16_80_/_0.3)]",
  pending: "bg-primary/15 text-primary ring-primary/30",
};

const icons: Record<ScanStatus, React.ComponentType<{ className?: string }>> = {
  safe: CheckCircle2,
  flagged: ShieldAlert,
  suspicious: AlertTriangle,
  pending: Loader2,
};

export function StatusBadge({ status, className }: { status: ScanStatus; className?: string }) {
  const meta = statusMeta(status);
  const Icon = icons[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
        styles[status],
        className,
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", status === "pending" && "animate-spin")} />
      {meta.label}
    </span>
  );
}
