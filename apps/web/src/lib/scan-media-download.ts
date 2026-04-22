import { apiFetch } from "@/lib/api";

/**
 * Download the original uploaded bytes for a scan (owner-only; authenticated cookie session).
 * Uses GET /scan/:id/media?download=1 → Content-Disposition: attachment.
 */
export async function downloadScanOriginal(scanId: string, filename: string): Promise<void> {
  const res = await apiFetch(`/scan/${encodeURIComponent(scanId)}/media?download=1`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = `Download failed (${res.status})`;
    try {
      const j = JSON.parse(text) as { error?: string };
      if (j && typeof j.error === "string" && j.error) msg = j.error;
    } catch {
      if (text) msg = text.slice(0, 200);
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.trim() || "download";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
