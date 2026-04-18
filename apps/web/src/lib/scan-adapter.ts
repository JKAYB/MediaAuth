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

function scanKind(row: ApiScanRow): MediaKind {
  if (row.source_type === "url") return "url";
  return kindFromMime(row.mime_type || "");
}

function numConfidence(c: ApiScanRow["confidence"]): number {
  if (c == null) return 0;
  const n = typeof c === "string" ? Number.parseFloat(c) : c;
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export function apiScanToUiScan(row: ApiScanRow): Scan {
  const status = mapApiStatus(row);
  const confidence = numConfidence(row.confidence);
  type ProcessorBlock = { confidence?: number };
  type ResultPayload = {
    version?: number;
    primaryProvider?: string;
    processors?: Record<string, ProcessorBlock | undefined>;
  };

  const payload = row.result_payload as ResultPayload | null;

  function primaryProcessor(): { id: string; block: ProcessorBlock } | null {
    const processors = payload?.processors;
    if (!processors) return null;
    const ids = Object.keys(processors);
    if (ids.length === 0) return null;
    const primary = payload?.primaryProvider;
    const fallbackId = ids.includes("mock") ? "mock" : ids[0];
    const id =
      primary && processors[primary] ? primary : fallbackId != null ? fallbackId : null;
    if (!id) return null;
    const block = processors[id];
    if (!block) return null;
    return { id, block };
  }

  const proc = primaryProcessor();
  const detections =
    proc && typeof proc.block.confidence === "number"
      ? [
          {
            label: `Model confidence (${proc.id})`,
            score: Math.min(1, Math.max(0, proc.block.confidence / 100)),
          },
        ]
      : [];

  const metadata: { key: string; value: string }[] = [
    { key: "MIME type", value: row.mime_type || "—" },
    { key: "Source", value: row.source_type === "url" ? "URL" : "Upload" },
    ...(row.detection_provider
      ? [{ key: "Detection provider", value: row.detection_provider }]
      : []),
    ...(row.source_url ? [{ key: "URL", value: row.source_url }] : []),
    { key: "Status", value: row.status },
    {
      key: "Size",
      value: row.file_size_bytes != null ? `${(row.file_size_bytes / 1024).toFixed(1)} KB` : "—",
    },
  ];
  if (row.error_message) metadata.push({ key: "Error", value: row.error_message });
  if (row.summary) metadata.push({ key: "Summary", value: row.summary });

  const timeline = [
    { time: "—", event: `Scan record · ${row.status}` },
    ...(row.completed_at ? [{ time: "—", event: `Completed ${row.completed_at}` }] : []),
  ];

  return {
    id: row.id,
    title: row.filename || "Untitled",
    source: "upload",
    kind: scanKind(row),
    status,
    confidence,
    createdAt: row.created_at,
    detections,
    metadata,
    timeline,
  };
}
