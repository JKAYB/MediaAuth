/** Internal ops are intentionally not callable from browser clients. */
export function isInternalOpsConfigured(): boolean {
  return false;
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

export class InternalOpsHttpError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "InternalOpsHttpError";
    this.status = status;
    this.body = body;
  }
}

async function internalFetch(path: string, init: RequestInit = {}): Promise<Response> {
  void path;
  void init;
  throw new Error(
    "Internal ops endpoints are backend-only and are not available from browser clients."
  );
}

async function internalJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await internalFetch(path, init);
  const data = (await parseJson(res)) as T & { error?: string };
  if (!res.ok) {
    const msg =
      typeof data === "object" && data && "error" in data && data.error
        ? String(data.error)
        : res.statusText;
    throw new InternalOpsHttpError(res.status, msg || `Request failed (${res.status})`, data);
  }
  return data as T;
}

export type InternalScanRow = {
  id: string;
  user_id: string | null;
  user_email: string | null;
  filename: string;
  mime_type: string;
  file_size_bytes: number;
  status: string;
  confidence: number | string | null;
  is_ai_generated: boolean | null;
  result_payload: unknown;
  error_message: string | null;
  summary: string | null;
  source_type: string | null;
  source_url: string | null;
  storage_key: string | null;
  storage_provider?: string | null;
  detection_provider: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  /** Present after API migration; treat missing as 0 in UI. */
  retry_count?: number;
};

export type InternalScanListResponse = {
  data: InternalScanRow[];
  limit: number;
  offset: number;
  total: number;
};

export type InternalStuckResponse = {
  data: InternalScanRow[];
  staleMinutes: number;
  limit: number;
};

export type InternalCountsResponse = {
  byStatus: Record<string, number>;
  rows: { status: string; count: number }[];
};

export type InternalRetryResponse = {
  ok: boolean;
  scan: InternalScanRow;
};

export function buildInternalScanListQuery(params: {
  status?: string;
  detection_provider?: string;
  created_after?: string;
  created_before?: string;
  limit?: number;
  offset?: number;
}): string {
  const q = new URLSearchParams();
  if (params.status) q.set("status", params.status);
  if (params.detection_provider) q.set("detection_provider", params.detection_provider);
  if (params.created_after) q.set("created_after", params.created_after);
  if (params.created_before) q.set("created_before", params.created_before);
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.offset != null) q.set("offset", String(params.offset));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function getInternalScanCounts(): Promise<InternalCountsResponse> {
  return internalJson<InternalCountsResponse>("/internal/scans/counts-by-status");
}

export function getInternalScanList(
  params: Parameters<typeof buildInternalScanListQuery>[0],
): Promise<InternalScanListResponse> {
  return internalJson<InternalScanListResponse>(
    `/internal/scans${buildInternalScanListQuery(params)}`,
  );
}

export function getInternalStuckScans(params: {
  minutes?: number;
  limit?: number;
}): Promise<InternalStuckResponse> {
  const q = new URLSearchParams();
  if (params.minutes != null) q.set("minutes", String(params.minutes));
  if (params.limit != null) q.set("limit", String(params.limit));
  const qs = q.toString();
  return internalJson<InternalStuckResponse>(`/internal/scans/stuck${qs ? `?${qs}` : ""}`);
}

export function getInternalScanDetail(id: string): Promise<InternalScanRow> {
  return internalJson<InternalScanRow>(`/internal/scans/${encodeURIComponent(id)}`);
}

export function postInternalScanRetry(
  id: string,
  opts?: { allowCompleted?: boolean },
): Promise<InternalRetryResponse> {
  const q = new URLSearchParams();
  if (opts?.allowCompleted) q.set("allow_completed", "1");
  const qs = q.toString();
  return internalJson<InternalRetryResponse>(
    `/internal/scans/${encodeURIComponent(id)}/retry${qs ? `?${qs}` : ""}`,
    {
      method: "POST",
    },
  );
}

export function postInternalScanResetStuck(
  id: string,
  opts?: { minutes?: number },
): Promise<InternalRetryResponse> {
  const q = new URLSearchParams();
  if (opts?.minutes != null) q.set("minutes", String(opts.minutes));
  const qs = q.toString();
  return internalJson<InternalRetryResponse>(
    `/internal/scans/${encodeURIComponent(id)}/reset-stuck${qs ? `?${qs}` : ""}`,
    { method: "POST" },
  );
}
