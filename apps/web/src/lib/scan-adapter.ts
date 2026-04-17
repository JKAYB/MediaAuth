import type { MediaKind, Scan, ScanStatus } from "@/lib/mock-data";
import type { ApiScanRow } from "@/lib/api";

function mapApiStatus(row: ApiScanRow): ScanStatus {
  const s = row.status?.toLowerCase() || "";
  if (s === "failed") return "suspicious";
  if (s === "pending" || s === "processing") return "pending";
  if (s === "completed") {
    if (row.is_ai_generated === true) return "flagged";
    if (row.is_ai_generated === false) return "safe";
    return "suspicious";
  }
  return "pending";
}

function kindFromMime(mime: string): MediaKind {
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "image";
  return "image";
}

function numConfidence(c: ApiScanRow["confidence"]): number {
  if (c == null) return 0;
  const n = typeof c === "string" ? Number.parseFloat(c) : c;
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export function apiScanToUiScan(row: ApiScanRow): Scan {
  const status = mapApiStatus(row);
  const confidence = numConfidence(row.confidence);
  const payload = row.result_payload as {
    processors?: { mock?: { confidence?: number }; hive?: unknown };
  } | null;

  const detections =
    payload?.processors?.mock && typeof payload.processors.mock.confidence === "number"
      ? [
          {
            label: "Model confidence (mock)",
            score: Math.min(1, Math.max(0, payload.processors.mock.confidence / 100)),
          },
        ]
      : [];

  const metadata: { key: string; value: string }[] = [
    { key: "MIME type", value: row.mime_type || "—" },
    { key: "Status", value: row.status },
    {
      key: "Size",
      value: row.file_size_bytes != null ? `${(row.file_size_bytes / 1024).toFixed(1)} KB` : "—",
    },
  ];
  if (row.error_message) metadata.push({ key: "Error", value: row.error_message });

  const timeline = [
    { time: "—", event: `Scan record · ${row.status}` },
    ...(row.completed_at ? [{ time: "—", event: `Completed ${row.completed_at}` }] : []),
  ];

  return {
    id: row.id,
    title: row.filename || "Untitled",
    source: "upload",
    kind: kindFromMime(row.mime_type || ""),
    status,
    confidence,
    createdAt: row.created_at,
    detections,
    metadata,
    timeline,
  };
}
