import { FileText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { apiBase } from "@/lib/api";
import type { MediaKind } from "@/lib/mock-data";
import type { StrictUploadPreviewKind } from "@/lib/scan-media";
import { getToken } from "@/lib/auth-storage";
import { cn } from "@/lib/utils";

function resolvedMime(mimeType: string | null | undefined, kind: MediaKind): string {
  const t = mimeType?.trim();
  if (t) return t;
  if (kind === "video") return "video/mp4";
  if (kind === "image") return "image/jpeg";
  return "";
}

export type ScanMediaPreviewProps = {
  scanId: string;
  mimeType?: string | null;
  previewUrl?: string | null;
  canFetchMedia?: boolean;
  mediaKind: MediaKind;
  liveDemo: boolean;
  /**
   * For authenticated uploads: strict preview kind, or `null` if bytes exist but in-browser preview is skipped (file card).
   * Omit when `canFetchMedia` is false or `liveDemo` is true.
   */
  uploadPreviewKind?: StrictUploadPreviewKind | null;
};

export function ScanMediaPreview({
  scanId,
  mimeType,
  previewUrl,
  canFetchMedia,
  mediaKind,
  liveDemo,
  uploadPreviewKind,
}: ScanMediaPreviewProps) {
  const mime = resolvedMime(mimeType, mediaKind);
  const legacyIsImage = mime.startsWith("image/");
  const legacyIsVideo = mime.startsWith("video/");
  const legacyDirectPreview = legacyIsImage || legacyIsVideo;

  const directUrl = previewUrl?.trim() || null;
  const useDirectUrl = Boolean(
    legacyDirectPreview && directUrl && (liveDemo || !canFetchMedia),
  );

  const useAuthBlob = Boolean(!liveDemo && canFetchMedia && uploadPreviewKind != null);
  const useUploadFileCard = Boolean(!liveDemo && canFetchMedia && uploadPreviewKind === null);

  const blobRef = useRef<string | null>(null);
  const [blobSrc, setBlobSrc] = useState<string | null>(null);
  const [fetchPhase, setFetchPhase] = useState<"idle" | "loading" | "error" | "done">("idle");

  const [intrinsicReady, setIntrinsicReady] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);

  const renderUrl = useAuthBlob ? blobSrc : directUrl;

  useEffect(() => {
    setIntrinsicReady(false);
    setMediaFailed(false);
  }, [scanId, directUrl, blobSrc, useDirectUrl, useAuthBlob, uploadPreviewKind]);

  useEffect(() => {
    if (!useAuthBlob) {
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
      setBlobSrc(null);
      setFetchPhase("idle");
      return;
    }

    const ac = new AbortController();
    setFetchPhase("loading");
    setBlobSrc(null);

    (async () => {
      try {
        const token = getToken();
        const headers = new Headers();
        if (token) headers.set("Authorization", `Bearer ${token}`);
        const res = await fetch(`${apiBase()}/scan/${encodeURIComponent(scanId)}/media`, {
          headers,
          signal: ac.signal,
        });
        if (!res.ok) throw new Error(`media ${res.status}`);
        const blob = await res.blob();
        if (ac.signal.aborted) return;
        const u = URL.createObjectURL(blob);
        if (blobRef.current) URL.revokeObjectURL(blobRef.current);
        blobRef.current = u;
        setBlobSrc(u);
        setFetchPhase("done");
      } catch {
        if (!ac.signal.aborted) {
          setFetchPhase("error");
          if (blobRef.current) {
            URL.revokeObjectURL(blobRef.current);
            blobRef.current = null;
          }
          setBlobSrc(null);
        }
      }
    })();

    return () => {
      ac.abort();
    };
  }, [useAuthBlob, scanId]);

  useEffect(() => {
    return () => {
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
    };
  }, []);

  const awaitingBlob = useAuthBlob && (fetchPhase === "loading" || (fetchPhase === "done" && !blobSrc));
  const awaitingDecode =
    Boolean(renderUrl) && !mediaFailed && !intrinsicReady && (fetchPhase === "done" || useDirectUrl);
  const showSkeleton = awaitingBlob || awaitingDecode;

  if (useUploadFileCard) {
    return (
      <div className="absolute inset-0 z-0 flex min-w-0 flex-col items-center justify-center gap-2 px-3 text-center">
        <div className="mx-auto grid h-11 w-11 shrink-0 place-items-center rounded-full bg-card/80 ring-1 ring-border backdrop-blur sm:h-14 sm:w-14">
          <FileText className="h-5 w-5 text-muted-foreground sm:h-6 sm:w-6" />
        </div>
        <p className="max-w-full text-xs leading-relaxed text-muted-foreground sm:text-sm">
          Preview isn&apos;t available for this file type. Use{" "}
          <span className="font-medium text-foreground">Download original</span> below.
        </p>
      </div>
    );
  }

  if (!useAuthBlob && !useDirectUrl) {
    return (
      <div className="absolute inset-0 z-0 flex min-w-0 flex-col items-center justify-center gap-2 px-3 text-center">
        <div className="mx-auto grid h-11 w-11 shrink-0 place-items-center rounded-full bg-card/80 ring-1 ring-border backdrop-blur sm:h-14 sm:w-14">
          <FileText className="h-5 w-5 text-muted-foreground sm:h-6 sm:w-6" />
        </div>
        <p className="max-w-full text-xs leading-relaxed text-muted-foreground sm:text-sm">
          No media available for this scan
        </p>
      </div>
    );
  }

  if (useAuthBlob && fetchPhase === "error") {
    return (
      <div className="absolute inset-0 z-0 flex min-w-0 flex-col items-center justify-center gap-2 px-3 text-center">
        <div className="mx-auto grid h-11 w-11 shrink-0 place-items-center rounded-full bg-card/80 ring-1 ring-border backdrop-blur sm:h-14 sm:w-14">
          <FileText className="h-5 w-5 text-muted-foreground sm:h-6 sm:w-6" />
        </div>
        <p className="max-w-full text-xs font-medium text-foreground sm:text-sm">Preview not available</p>
      </div>
    );
  }

  if (awaitingBlob && !blobSrc) {
    return (
      <div className="absolute inset-0 z-0 flex min-w-0 items-center justify-center p-2 sm:p-3">
        <div
          className="h-full w-full max-w-full animate-pulse rounded-md bg-muted/40 ring-1 ring-border/40"
          aria-hidden
        />
      </div>
    );
  }

  if (!renderUrl) {
    return null;
  }

  if (mediaFailed) {
    return (
      <div className="absolute inset-0 z-0 flex min-w-0 flex-col items-center justify-center gap-2 px-3 text-center">
        <div className="mx-auto grid h-11 w-11 shrink-0 place-items-center rounded-full bg-card/80 ring-1 ring-border backdrop-blur sm:h-14 sm:w-14">
          <FileText className="h-5 w-5 text-muted-foreground sm:h-6 sm:w-6" />
        </div>
        <p className="max-w-full text-xs font-medium text-foreground sm:text-sm">Preview not available</p>
      </div>
    );
  }

  const showImage =
    (useDirectUrl && legacyIsImage) || (useAuthBlob && uploadPreviewKind === "image");
  const showVideo =
    (useDirectUrl && legacyIsVideo) || (useAuthBlob && uploadPreviewKind === "video");
  const showAudio = useAuthBlob && uploadPreviewKind === "audio";

  return (
    <div className="absolute inset-0 z-0 flex min-w-0 items-center justify-center overflow-hidden p-2 sm:p-3">
      {showSkeleton && (
        <div
          className="pointer-events-none absolute inset-2 z-10 animate-pulse rounded-md bg-muted/35 sm:inset-3"
          aria-hidden
        />
      )}
      {showImage && (
        <img
          src={renderUrl}
          alt="Scan preview"
          className={cn(
            "relative z-[1] max-h-full w-full object-contain object-center rounded-md transition-opacity duration-200",
            intrinsicReady ? "opacity-100" : "opacity-0",
          )}
          loading="lazy"
          onLoad={() => {
            setIntrinsicReady(true);
            setMediaFailed(false);
          }}
          onError={() => {
            setMediaFailed(true);
            setIntrinsicReady(false);
          }}
        />
      )}
      {showVideo && (
        <video
          key={renderUrl}
          controls
          className={cn(
            "relative z-[1] max-h-full w-full rounded-md transition-opacity duration-200",
            intrinsicReady ? "opacity-100" : "opacity-0",
          )}
          playsInline
          preload="metadata"
          onLoadedData={() => {
            setIntrinsicReady(true);
            setMediaFailed(false);
          }}
          onError={() => {
            setMediaFailed(true);
            setIntrinsicReady(false);
          }}
        >
          <source src={renderUrl} type={mime} />
        </video>
      )}
      {showAudio && (
        <audio
          key={renderUrl}
          controls
          className={cn(
            "relative z-[1] w-full max-w-md transition-opacity duration-200",
            intrinsicReady ? "opacity-100" : "opacity-0",
          )}
          preload="metadata"
          onLoadedData={() => {
            setIntrinsicReady(true);
            setMediaFailed(false);
          }}
          onError={() => {
            setMediaFailed(true);
            setIntrinsicReady(false);
          }}
        >
          <source src={renderUrl} type={mime} />
        </audio>
      )}
    </div>
  );
}
