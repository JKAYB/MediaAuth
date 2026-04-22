// import type { MediaKind, Scan, ScanStatus } from "@/lib/mock-data";
// import type { ApiScanRow } from "@/lib/api";

// function mapApiStatus(row: ApiScanRow): ScanStatus {
//   const s = row.status?.toLowerCase() || "";
//   if (s === "failed") return "suspicious";
//   if (s === "pending" || s === "processing") return "pending";
//   if (s === "completed") {
//     if (row.is_ai_generated === true) return "flagged";
//     if (row.is_ai_generated === false) return "safe";
//     return "suspicious";
//   }
//   return "pending";
// }

// function kindFromMime(mime: string): MediaKind {
//   if (mime.startsWith("video/")) return "video";
//   if (mime.startsWith("audio/")) return "audio";
//   if (mime.startsWith("image/")) return "image";
//   return "image";
// }

// function scanKind(row: ApiScanRow): MediaKind {
//   if (row.source_type === "url") return "url";
//   return kindFromMime(row.mime_type || "");
// }

// function numConfidence(c: ApiScanRow["confidence"]): number {
//   if (c == null) return 0;
//   const n = typeof c === "string" ? Number.parseFloat(c) : c;
//   return Number.isFinite(n) ? Math.round(n) : 0;
// }

// export function apiScanToUiScan(row: ApiScanRow): Scan {
//   const status = mapApiStatus(row);
//   const confidence = numConfidence(row.confidence);
//   type ProcessorBlock = { confidence?: number };
//   type ResultPayload = {
//     version?: number;
//     primaryProvider?: string;
//     processors?: Record<string, ProcessorBlock | undefined>;
//   };

//   const payload = row.result_payload as ResultPayload | null;

//   function primaryProcessor(): { id: string; block: ProcessorBlock } | null {
//     const processors = payload?.processors;
//     if (!processors) return null;
//     const ids = Object.keys(processors);
//     if (ids.length === 0) return null;
//     const primary = payload?.primaryProvider;
//     const fallbackId = ids.includes("mock") ? "mock" : ids[0];
//     const id =
//       primary && processors[primary] ? primary : fallbackId != null ? fallbackId : null;
//     if (!id) return null;
//     const block = processors[id];
//     if (!block) return null;
//     return { id, block };
//   }

//   const proc = primaryProcessor();
//   const detections =
//     proc && typeof proc.block.confidence === "number"
//       ? [
//           {
//             label: `Model confidence (${proc.id})`,
//             score: Math.min(1, Math.max(0, proc.block.confidence / 100)),
//           },
//         ]
//       : [];

//   const metadata: { key: string; value: string }[] = [
//     { key: "MIME type", value: row.mime_type || "—" },
//     { key: "Source", value: row.source_type === "url" ? "URL" : "Upload" },
//     ...(row.detection_provider
//       ? [{ key: "Detection provider", value: row.detection_provider }]
//       : []),
//     ...(row.source_url ? [{ key: "URL", value: row.source_url }] : []),
//     { key: "Status", value: row.status },
//     {
//       key: "Size",
//       value: row.file_size_bytes != null ? `${(row.file_size_bytes / 1024).toFixed(1)} KB` : "—",
//     },
//   ];
//   if (row.error_message) metadata.push({ key: "Error", value: row.error_message });
//   if (row.summary) metadata.push({ key: "Summary", value: row.summary });

//   const timeline = [
//     { time: "—", event: `Scan record · ${row.status}` },
//     ...(row.completed_at ? [{ time: "—", event: `Completed ${row.completed_at}` }] : []),
//   ];

//   const previewUrl =
//     String(row.source_type || "").toLowerCase() === "url" &&
//     row.source_url &&
//     /^https?:\/\//i.test(String(row.source_url).trim())
//       ? String(row.source_url).trim()
//       : null;

//   const canFetchMedia =
//     String(row.source_type || "upload").toLowerCase() === "upload" &&
//     Boolean(row.storage_key && String(row.storage_key).trim());

//   return {
//     id: row.id,
//     title: row.filename || "Untitled",
//     source: "upload",
//     kind: scanKind(row),
//     status,
//     confidence,
//     createdAt: row.created_at,
//     mimeType: row.mime_type || undefined,
//     previewUrl,
//     canFetchMedia,
//     fileSizeBytes:
//       row.file_size_bytes != null && Number.isFinite(Number(row.file_size_bytes))
//         ? Math.trunc(Number(row.file_size_bytes))
//         : undefined,
//     detections,
//     metadata,
//     timeline,
//   };
// }


// import type { MediaKind, Scan, ScanStatus } from "@/lib/mock-data";
// import type { ApiScanRow } from "@/lib/api";

// function mapApiStatus(row: ApiScanRow): ScanStatus {
//   const s = row.status?.toLowerCase() || "";
//   if (s === "failed") return "suspicious";
//   if (s === "pending" || s === "processing") return "pending";
//   if (s === "completed") {
//     if (row.is_ai_generated === true) return "flagged";
//     if (row.is_ai_generated === false) return "safe";
//     return "suspicious";
//   }
//   return "pending";
// }

// function kindFromMime(mime: string): MediaKind {
//   if (mime.startsWith("video/")) return "video";
//   if (mime.startsWith("audio/")) return "audio";
//   if (mime.startsWith("image/")) return "image";
//   return "image";
// }

// function scanKind(row: ApiScanRow): MediaKind {
//   if (row.source_type === "url") return "url";
//   return kindFromMime(row.mime_type || "");
// }

// function numConfidence(c: ApiScanRow["confidence"]): number {
//   if (c == null) return 0;
//   const n = typeof c === "string" ? Number.parseFloat(c) : c;
//   return Number.isFinite(n) ? Math.round(n) : 0;
// }

// function formatBytesToKb(bytes: number | null | undefined): string {
//   if (bytes == null || !Number.isFinite(Number(bytes))) return "—";
//   return `${(Number(bytes) / 1024).toFixed(1)} KB`;
// }

// function formatDuration(seconds: number | null | undefined): string {
//   if (seconds == null || !Number.isFinite(Number(seconds))) return "—";
//   const total = Math.max(0, Math.round(Number(seconds)));
//   const mins = Math.floor(total / 60);
//   const secs = total % 60;
//   if (mins === 0) return `${secs}s`;
//   return `${mins}m ${secs}s`;
// }

// type ProcessorBlock = { confidence?: number };

// type ResultPayload = {
//   version?: number;
//   primaryProvider?: string;
//   processors?: Record<string, ProcessorBlock | undefined>;
//   details?: DetectionDetails;
// };

// type DetectionModelInsight = {
//   name?: string | null;
//   status?: string | null;
//   decision?: string | null;
//   score?: number | null;
//   rawScore?: number | null;
//   normalizedScore?: number | null;
//   finalScore?: number | null;
// };

// type DetectionDetails = {
//   detectionVendor?: string;
//   requestId?: string;
//   mediaType?: string;
//   overallStatus?: string;
//   resultsSummaryStatus?: string | null;
//   finalScore?: number | null;
//   durationSec?: number | null;
//   fileSize?: number | null;
//   modelCount?: number;
//   modelInsights?: DetectionModelInsight[];
//   ensemble?: DetectionModelInsight | null;
//   heatmaps?: Record<string, string>;
//   aggregationResultUrl?: string | null;
//   modelMetadataUrl?: string | null;
// };

// function clamp01(n: number): number {
//   return Math.min(1, Math.max(0, n));
// }

// function pickModelPercent(model: DetectionModelInsight): number | null {
//   if (typeof model.normalizedScore === "number" && Number.isFinite(model.normalizedScore)) {
//     return Math.round(model.normalizedScore);
//   }
//   if (typeof model.finalScore === "number" && Number.isFinite(model.finalScore)) {
//     return Math.round(model.finalScore);
//   }
//   if (typeof model.score === "number" && Number.isFinite(model.score)) {
//     return Math.round(model.score <= 1 ? model.score * 100 : model.score);
//   }
//   return null;
// }
// type RealProcessorPayload = {
//   mediaId?: string;
//   ensemble?: {
//     name?: string;
//     score?: number;
//     status?: string;
//     decision?: string;
//     rawScore?: number;
//     finalScore?: number;
//     normalizedScore?: number;
//   };
//   fileSize?: number;
//   heatmaps?: Record<string, string>;
//   modelInsights?: Array<{
//     name?: string | null;
//     status?: string | null;
//     decision?: string | null;
//     score?: number | null;
//     rawScore?: number | null;
//     normalizedScore?: number | null;
//     finalScore?: number | null;
//   }>;
//   aggregationResultUrl?: string;
//   modelMetadataUrl?: string;
//   durationSec?: number;
//   requestId?: string;
// };
// function normalizeDetailsFromPayload(payload: ResultPayload | null) {
//   const details = payload?.details;
//   if (details) return details;

//   const real = payload?.processors?.real as RealProcessorPayload | undefined;
//   if (!real) return null;

//   const modelInsights = Array.isArray(real.modelInsights)
//     ? real.modelInsights
//     : real.ensemble
//       ? [real.ensemble]
//       : [];

//   return {
//     requestId: real.requestId ?? real.mediaId,
//     fileSize: real.fileSize,
//     modelInsights,
//     modelCount: modelInsights.length,
//     ensemble: real.ensemble,
//     heatmaps: real.heatmaps,
//     aggregationResultUrl: real.aggregationResultUrl,
//     modelMetadataUrl: real.modelMetadataUrl,
//     durationSec: real.durationSec,
//   };
// }
// export function apiScanToUiScan(row: ApiScanRow): Scan {
//   const status = mapApiStatus(row);
//   const confidence = numConfidence(row.confidence);
//   const payload = row.result_payload as ResultPayload | null;
//   const details = normalizeDetailsFromPayload(payload);
  
//   function primaryProcessor(): { id: string; block: ProcessorBlock } | null {
//     const processors = payload?.processors;
//     if (!processors) return null;
//     const ids = Object.keys(processors);
//     if (ids.length === 0) return null;
//     const primary = payload?.primaryProvider;
//     const fallbackId = ids.includes("mock") ? "mock" : ids[0];
//     const id =
//       primary && processors[primary] ? primary : fallbackId != null ? fallbackId : null;
//     if (!id) return null;
//     const block = processors[id];
//     if (!block) return null;
//     return { id, block };
//   }

//   const applicableModels = Array.isArray(details?.modelInsights)
//     ? details.modelInsights.filter(
//         (m) => m && typeof m.name === "string" && (m.status || "").toUpperCase() !== "NOT_APPLICABLE",
//       )
//     : [];

//   const detections =
//     applicableModels.length > 0
//       ? applicableModels.map((model) => {
//           const pct = pickModelPercent(model);
//           return {
//             label: model.name || "Model",
//             score: clamp01(((pct ?? 0) / 100)),
//           };
//         })
//       : (() => {
//           const proc = primaryProcessor();
//           return proc && typeof proc.block.confidence === "number"
//             ? [
//                 {
//                   label: `Model confidence (${proc.id})`,
//                   score: clamp01(proc.block.confidence / 100),
//                 },
//               ]
//             : [];
//         })();

//   const heatmaps = details?.heatmaps && typeof details.heatmaps === "object"
//     ? Object.entries(details.heatmaps)
//         .filter(([_, url]) => typeof url === "string" && url.trim().length > 0)
//         .map(([modelName, url]) => ({ modelName, url }))
//     : [];

//   const metadata: { key: string; value: string }[] = [
//     { key: "MIME type", value: row.mime_type || "—" },
//     { key: "Source", value: row.source_type === "url" ? "URL" : "Upload" },
//     ...(row.detection_provider
//       ? [{ key: "Detection provider", value: row.detection_provider }]
//       : []),
//     ...(details?.detectionVendor
//       ? [{ key: "Detection vendor", value: details.detectionVendor }]
//       : []),
//     ...(details?.requestId
//       ? [{ key: "Provider request ID", value: details.requestId }]
//       : []),
//     ...(row.source_url ? [{ key: "URL", value: row.source_url }] : []),
//     { key: "Status", value: row.status },
//     {
//       key: "Size",
//       value: formatBytesToKb(
//         row.file_size_bytes != null ? Number(row.file_size_bytes) : details?.fileSize,
//       ),
//     },
//     ...(details?.durationSec != null
//       ? [{ key: "Duration", value: formatDuration(details.durationSec) }]
//       : []),
//     ...(details?.resultsSummaryStatus
//       ? [{ key: "Result", value: details.resultsSummaryStatus }]
//       : []),
//     ...(typeof details?.modelCount === "number"
//       ? [{ key: "Signals", value: String(details.modelCount) }]
//       : []),
//     ...(details?.aggregationResultUrl
//       ? [{ key: "Aggregation JSON", value: "Available" }]
//       : []),
//     ...(details?.modelMetadataUrl
//       ? [{ key: "Model metadata", value: "Available" }]
//       : []),
//     ...(heatmaps.length > 0
//       ? [{ key: "Heatmaps", value: String(heatmaps.length) }]
//       : []),
//   ];

//   if (row.error_message) metadata.push({ key: "Error", value: row.error_message });
//   if (row.summary) metadata.push({ key: "Summary", value: row.summary });

//   const timeline = [
//     { time: "—", event: `Scan record · ${row.status}` },
//     ...(details?.requestId ? [{ time: "—", event: `Reality Defender request · ${details.requestId}` }] : []),
//     ...(row.completed_at ? [{ time: "—", event: `Completed ${row.completed_at}` }] : []),
//   ];

//   const previewUrl =
//     String(row.source_type || "").toLowerCase() === "url" &&
//     row.source_url &&
//     /^https?:\/\//i.test(String(row.source_url).trim())
//       ? String(row.source_url).trim()
//       : null;

//   const canFetchMedia =
//     String(row.source_type || "upload").toLowerCase() === "upload" &&
//     Boolean(row.storage_key && String(row.storage_key).trim());

//   return {
//     id: row.id,
//     title: row.filename || "Untitled",
//     source: row.source_type === "url" ? "url" : "upload",
//     kind: scanKind(row),
//     status,
//     confidence,
//     createdAt: row.created_at,
//     mimeType: row.mime_type || undefined,
//     previewUrl,
//     canFetchMedia,
//     fileSizeBytes:
//       row.file_size_bytes != null && Number.isFinite(Number(row.file_size_bytes))
//         ? Math.trunc(Number(row.file_size_bytes))
//         : details?.fileSize != null && Number.isFinite(Number(details.fileSize))
//           ? Math.trunc(Number(details.fileSize))
//           : undefined,
//     detections,
//     metadata,
//     timeline,

//     // extra fields for richer UI if your Scan type supports them
//     modelInsights: applicableModels,
//     modelCount:
//       typeof details?.modelCount === "number" ? details.modelCount : applicableModels.length,
//     heatmaps,
//     aggregationResultUrl: details?.aggregationResultUrl || undefined,
//     modelMetadataUrl: details?.modelMetadataUrl || undefined,
//     durationSec:
//       details?.durationSec != null && Number.isFinite(Number(details.durationSec))
//         ? Number(details.durationSec)
//         : undefined,
//     providerRequestId: details?.requestId || undefined,
//   };
// }


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

function formatBytesToKb(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(Number(bytes))) return "—";
  return `${(Number(bytes) / 1024).toFixed(1)} KB`;
}

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(Number(seconds))) return "—";
  const total = Math.max(0, Math.round(Number(seconds)));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

type ProcessorBlock = {
  confidence?: number;
};

type DetectionModelInsight = {
  name?: string | null;
  status?: string | null;
  decision?: string | null;
  score?: number | null;
  rawScore?: number | null;
  normalizedScore?: number | null;
  finalScore?: number | null;
};

type DetectionDetails = {
  detectionVendor?: string;
  requestId?: string;
  mediaType?: string;
  overallStatus?: string;
  resultsSummaryStatus?: string | null;
  finalScore?: number | null;
  durationSec?: number | null;
  fileSize?: number | null;
  modelCount?: number;
  modelInsights?: DetectionModelInsight[];
  ensemble?: DetectionModelInsight | null;
  heatmaps?: Record<string, string>;
  aggregationResultUrl?: string | null;
  modelMetadataUrl?: string | null;
};

type RealProcessorPayload = {
  mediaId?: string;
  requestId?: string;
  mediaType?: string;
  overallStatus?: string;
  resultsSummaryStatus?: string | null;
  finalScore?: number | null;
  durationSec?: number;
  fileSize?: number;
  ensemble?: DetectionModelInsight;
  modelInsights?: DetectionModelInsight[];
  heatmaps?: Record<string, string>;
  aggregationResultUrl?: string;
  modelMetadataUrl?: string;
};

type ResultPayload = {
  version?: number;
  primaryProvider?: string;
  processors?: Record<string, ProcessorBlock | RealProcessorPayload | undefined>;
  details?: DetectionDetails;
};

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function pickModelPercent(model: DetectionModelInsight): number | null {
  if (typeof model.normalizedScore === "number" && Number.isFinite(model.normalizedScore)) {
    return Math.round(model.normalizedScore);
  }
  if (typeof model.finalScore === "number" && Number.isFinite(model.finalScore)) {
    return Math.round(model.finalScore);
  }
  if (typeof model.score === "number" && Number.isFinite(model.score)) {
    return Math.round(model.score <= 1 ? model.score * 100 : model.score);
  }
  return null;
}

function isRealProcessorPayload(value: unknown): value is RealProcessorPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return (
    "mediaId" in obj ||
    "requestId" in obj ||
    "ensemble" in obj ||
    "modelInsights" in obj ||
    "heatmaps" in obj ||
    "aggregationResultUrl" in obj ||
    "modelMetadataUrl" in obj
  );
}

function normalizeDetailsFromPayload(payload: ResultPayload | null): DetectionDetails | null {
  const details = payload?.details;
  if (details) return details;

  const realCandidate = payload?.processors?.real;
  if (!isRealProcessorPayload(realCandidate)) return null;

  const real = realCandidate;

  const modelInsights = Array.isArray(real.modelInsights)
    ? real.modelInsights.filter((m) => m && typeof m === "object")
    : real.ensemble
      ? [real.ensemble]
      : [];

  const inferredFinalScore =
    typeof real.finalScore === "number"
      ? real.finalScore
      : real.ensemble && typeof real.ensemble.finalScore === "number"
        ? real.ensemble.finalScore
        : real.ensemble
          ? pickModelPercent(real.ensemble)
          : null;

  const inferredStatus =
    typeof real.resultsSummaryStatus === "string" && real.resultsSummaryStatus.trim()
      ? real.resultsSummaryStatus
      : typeof real.overallStatus === "string" && real.overallStatus.trim()
        ? real.overallStatus
        : real.ensemble && typeof real.ensemble.status === "string"
          ? real.ensemble.status
          : null;

  return {
    detectionVendor: "reality_defender",
    requestId: real.requestId ?? real.mediaId,
    mediaType: real.mediaType,
    overallStatus: real.overallStatus,
    resultsSummaryStatus: inferredStatus,
    finalScore: inferredFinalScore,
    durationSec: real.durationSec,
    fileSize: real.fileSize,
    modelInsights,
    modelCount: modelInsights.length,
    ensemble: real.ensemble ?? null,
    heatmaps: real.heatmaps,
    aggregationResultUrl: real.aggregationResultUrl ?? null,
    modelMetadataUrl: real.modelMetadataUrl ?? null,
  };
}

function getPrimaryProcessor(
  payload: ResultPayload | null
): { id: string; block: ProcessorBlock | RealProcessorPayload } | null {
  const processors = payload?.processors;
  if (!processors) return null;

  const ids = Object.keys(processors);
  if (ids.length === 0) return null;

  const primary = payload?.primaryProvider;
  const fallbackId = ids.includes("mock") ? "mock" : ids[0];
  const id = primary && processors[primary] ? primary : fallbackId != null ? fallbackId : null;
  if (!id) return null;

  const block = processors[id];
  if (!block) return null;

  return { id, block };
}

export function apiScanToUiScan(row: ApiScanRow): Scan {
  const status = mapApiStatus(row);
  const confidence = numConfidence(row.confidence);
  const payload = row.result_payload as ResultPayload | null;
  const details = normalizeDetailsFromPayload(payload);

  const applicableModels = Array.isArray(details?.modelInsights)
    ? details.modelInsights.filter(
        (m) => m && typeof m.name === "string" && (m.status || "").toUpperCase() !== "NOT_APPLICABLE"
      )
    : [];

  const detections =
    applicableModels.length > 0
      ? applicableModels.map((model) => {
          const pct = pickModelPercent(model);
          return {
            label: model.name || "Model",
            score: clamp01((pct ?? 0) / 100),
          };
        })
      : (() => {
          const proc = getPrimaryProcessor(payload);
          if (!proc) return [];

          if ("confidence" in proc.block && typeof proc.block.confidence === "number") {
            return [
              {
                label: `Model confidence (${proc.id})`,
                score: clamp01(proc.block.confidence / 100),
              },
            ];
          }

          if (isRealProcessorPayload(proc.block) && proc.block.ensemble) {
            const pct = pickModelPercent(proc.block.ensemble);
            return [
              {
                label: proc.block.ensemble.name || `Model confidence (${proc.id})`,
                score: clamp01((pct ?? 0) / 100),
              },
            ];
          }

          return [];
        })();

  const heatmaps =
    details?.heatmaps && typeof details.heatmaps === "object"
      ? Object.entries(details.heatmaps)
          .filter(([_, url]) => typeof url === "string" && url.trim().length > 0)
          .map(([modelName, url]) => ({ modelName, url }))
      : [];

  const metadata: { key: string; value: string }[] = [
    { key: "MIME type", value: row.mime_type || "—" },
    { key: "Source", value: row.source_type === "url" ? "URL" : "Upload" },
    ...(row.detection_provider ? [{ key: "Detection provider", value: row.detection_provider }] : []),
    ...(details?.detectionVendor ? [{ key: "Detection vendor", value: details.detectionVendor }] : []),
    ...(details?.requestId ? [{ key: "Provider request ID", value: details.requestId }] : []),
    ...(row.source_url ? [{ key: "URL", value: row.source_url }] : []),
    { key: "Status", value: row.status },
    {
      key: "Size",
      value: formatBytesToKb(
        row.file_size_bytes != null ? Number(row.file_size_bytes) : details?.fileSize
      ),
    },
    ...(details?.durationSec != null ? [{ key: "Duration", value: formatDuration(details.durationSec) }] : []),
    ...(details?.resultsSummaryStatus ? [{ key: "Result", value: details.resultsSummaryStatus }] : []),
    ...(typeof details?.finalScore === "number" ? [{ key: "Final score", value: `${details.finalScore}%` }] : []),
    ...(typeof details?.modelCount === "number" ? [{ key: "Signals", value: String(details.modelCount) }] : []),
    ...(details?.aggregationResultUrl ? [{ key: "Aggregation JSON", value: "Available" }] : []),
    ...(details?.modelMetadataUrl ? [{ key: "Model metadata", value: "Available" }] : []),
    ...(heatmaps.length > 0 ? [{ key: "Heatmaps", value: String(heatmaps.length) }] : []),
  ];

  if (row.error_message) metadata.push({ key: "Error", value: row.error_message });
  if (row.summary) metadata.push({ key: "Summary", value: row.summary });

  const timeline = [
    { time: "—", event: `Scan record · ${row.status}` },
    ...(details?.requestId ? [{ time: "—", event: `Reality Defender request · ${details.requestId}` }] : []),
    ...(row.completed_at ? [{ time: "—", event: `Completed ${row.completed_at}` }] : []),
  ];

  const previewUrl =
    String(row.source_type || "").toLowerCase() === "url" &&
    row.source_url &&
    /^https?:\/\//i.test(String(row.source_url).trim())
      ? String(row.source_url).trim()
      : null;

  const canFetchMedia =
    String(row.source_type || "upload").toLowerCase() === "upload" &&
    Boolean(row.storage_key && String(row.storage_key).trim());

  return {
    id: row.id,
    title: row.filename || "Untitled",
    source: row.source_type === "url" ? "url" : "upload",
    kind: scanKind(row),
    status,
    confidence,
    createdAt: row.created_at,
    mimeType: row.mime_type || undefined,
    previewUrl,
    canFetchMedia,
    fileSizeBytes:
      row.file_size_bytes != null && Number.isFinite(Number(row.file_size_bytes))
        ? Math.trunc(Number(row.file_size_bytes))
        : details?.fileSize != null && Number.isFinite(Number(details.fileSize))
          ? Math.trunc(Number(details.fileSize))
          : undefined,
    detections,
    metadata,
    timeline,
    modelInsights: applicableModels,
    modelCount: typeof details?.modelCount === "number" ? details.modelCount : applicableModels.length,
    heatmaps,
    aggregationResultUrl: details?.aggregationResultUrl || undefined,
    modelMetadataUrl: details?.modelMetadataUrl || undefined,
    durationSec:
      details?.durationSec != null && Number.isFinite(Number(details.durationSec))
        ? Number(details.durationSec)
        : undefined,
    providerRequestId: details?.requestId || undefined,
  };
}