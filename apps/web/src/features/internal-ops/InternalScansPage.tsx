import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { AlertTriangle, RefreshCw, ShieldAlert } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getInternalScanCounts,
  getInternalScanDetail,
  getInternalScanList,
  getInternalStuckScans,
  InternalOpsHttpError,
  isInternalOpsConfigured,
  postInternalScanResetStuck,
  postInternalScanRetry,
  type InternalScanRow,
} from "@/lib/internal-ops-api";
import { cn } from "@/lib/utils";

function excerpt(s: string | null | undefined, max = 72): string {
  if (!s) return "—";
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function fmtTs(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "yyyy-MM-dd HH:mm:ss");
  } catch {
    return String(iso);
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "completed":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "failed":
      return "border-destructive/40 bg-destructive/10 text-destructive";
    case "processing":
      return "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200";
    case "pending":
      return "border-muted-foreground/30 bg-muted text-muted-foreground";
    default:
      return "border-border bg-muted/50";
  }
}

function errorMessage(e: unknown): string {
  if (e instanceof InternalOpsHttpError) {
    return e.status ? `${e.status} — ${e.message}` : e.message;
  }
  if (e instanceof Error) return e.message;
  return "Request failed";
}

export function InternalScansPage() {
  const queryClient = useQueryClient();
  const configured = isInternalOpsConfigured();

  const [tab, setTab] = useState<"browse" | "stuck">("browse");
  const [status, setStatus] = useState("");
  const [detectionProvider, setDetectionProvider] = useState("");
  const [createdAfter, setCreatedAfter] = useState("");
  const [createdBefore, setCreatedBefore] = useState("");
  const [limit] = useState(25);
  const [offset, setOffset] = useState(0);
  const [stuckMinutes, setStuckMinutes] = useState(30);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [confirmFailed, setConfirmFailed] = useState<string | null>(null);
  const [confirmCompleted, setConfirmCompleted] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState<{ id: string; minutes: number } | null>(null);

  const listParams = useMemo(
    () => ({
      status: status || undefined,
      detection_provider: detectionProvider || undefined,
      created_after: createdAfter ? `${createdAfter}T00:00:00.000Z` : undefined,
      created_before: createdBefore ? `${createdBefore}T23:59:59.999Z` : undefined,
      limit,
      offset,
    }),
    [status, detectionProvider, createdAfter, createdBefore, limit, offset],
  );

  const countsQuery = useQuery({
    queryKey: ["internal-scans", "counts"],
    queryFn: getInternalScanCounts,
    enabled: configured,
  });

  const listQuery = useQuery({
    queryKey: ["internal-scans", "list", listParams],
    queryFn: () => getInternalScanList(listParams),
    enabled: configured && tab === "browse",
  });

  const stuckQuery = useQuery({
    queryKey: ["internal-scans", "stuck", stuckMinutes],
    queryFn: () => getInternalStuckScans({ minutes: stuckMinutes, limit: 50 }),
    enabled: configured && tab === "stuck",
  });

  const detailQuery = useQuery({
    queryKey: ["internal-scans", "detail", selectedId],
    queryFn: () => getInternalScanDetail(selectedId!),
    enabled: configured && Boolean(selectedId),
  });

  const invalidateAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["internal-scans"] });
  }, [queryClient]);

  const retryMutation = useMutation({
    mutationFn: async ({ id, allowCompleted }: { id: string; allowCompleted?: boolean }) =>
      postInternalScanRetry(id, { allowCompleted }),
    onSuccess: () => {
      toast.success("Scan re-queued");
      invalidateAll();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const resetStuckMutation = useMutation({
    mutationFn: async ({ id, minutes }: { id: string; minutes: number }) =>
      postInternalScanResetStuck(id, { minutes }),
    onSuccess: () => {
      toast.success("Stuck scan reset and re-queued");
      invalidateAll();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!configured) {
    return (
      <div className="min-h-screen bg-background px-4 py-12 text-foreground">
        <div className="mx-auto max-w-lg space-y-4 rounded-xl border border-border bg-card/60 p-8 shadow-sm">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <ShieldAlert className="h-5 w-5 shrink-0" />
            <span className="text-sm font-semibold uppercase tracking-wide">Internal tooling</span>
          </div>
          <h1 className="text-2xl font-bold">Scan operations unavailable</h1>
          <p className="text-sm text-muted-foreground">
            This page is disabled until the web build includes an internal operations token.
            Configure it only for trusted local or private deployments. It is not shown in normal
            product navigation.
          </p>
          <Separator />
          <p className="text-xs text-muted-foreground">
            Operators: set the env variable at build time (see project docs), rebuild the web app,
            then open this URL again.
          </p>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link to="/">Back to home</Link>
          </Button>
        </div>
      </div>
    );
  }

  const counts = countsQuery.data?.byStatus ?? {};
  const rows = listQuery.data?.data ?? [];
  const total = listQuery.data?.total ?? 0;
  const stuckRows = stuckQuery.data?.data ?? [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/40 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight">Internal scan operations</h1>
              <Badge
                variant="outline"
                className="border-amber-500/50 text-amber-800 dark:text-amber-200"
              >
                Ops / debug
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Not part of the customer workspace. Uses internal API routes only.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void invalidateAll()}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/">Home</Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-4 py-6">
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {countsQuery.isPending ? (
            <Card className="border-dashed">
              <CardHeader className="py-3">
                <CardDescription>Loading counts…</CardDescription>
              </CardHeader>
            </Card>
          ) : countsQuery.isError ? (
            <Card className="border-destructive/40 sm:col-span-2 lg:col-span-5">
              <CardHeader className="py-3">
                <CardTitle className="text-sm text-destructive">Counts failed</CardTitle>
                <CardDescription>{errorMessage(countsQuery.error)}</CardDescription>
              </CardHeader>
            </Card>
          ) : Object.keys(counts).length === 0 ? (
            <Card className="sm:col-span-2 lg:col-span-5">
              <CardHeader className="py-3">
                <CardDescription>No scan rows in database yet.</CardDescription>
              </CardHeader>
            </Card>
          ) : (
            Object.entries(counts).map(([k, v]) => (
              <Card key={k}>
                <CardHeader className="py-3">
                  <CardDescription className="text-xs uppercase tracking-wide">{k}</CardDescription>
                  <CardTitle className="text-2xl tabular-nums">{v}</CardTitle>
                </CardHeader>
              </Card>
            ))
          )}
        </div>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "browse" | "stuck")}
          className="space-y-4"
        >
          <TabsList>
            <TabsTrigger value="browse">Browse scans</TabsTrigger>
            <TabsTrigger value="stuck">Stuck processing</TabsTrigger>
          </TabsList>

          <TabsContent value="browse" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Filters</CardTitle>
                <CardDescription>Query parameters map to GET /internal/scans</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="f-status">Status</Label>
                  <Input
                    id="f-status"
                    placeholder="e.g. failed"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="f-provider">Detection provider</Label>
                  <Input
                    id="f-provider"
                    placeholder="e.g. mock"
                    value={detectionProvider}
                    onChange={(e) => setDetectionProvider(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="f-after">Created after</Label>
                  <Input
                    id="f-after"
                    type="date"
                    value={createdAfter}
                    onChange={(e) => setCreatedAfter(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="f-before">Created before</Label>
                  <Input
                    id="f-before"
                    type="date"
                    value={createdBefore}
                    onChange={(e) => setCreatedBefore(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-4">
                  <Button
                    type="button"
                    onClick={() => {
                      setOffset(0);
                      void listQuery.refetch();
                    }}
                  >
                    Apply
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setStatus("");
                      setDetectionProvider("");
                      setCreatedAfter("");
                      setCreatedBefore("");
                      setOffset(0);
                    }}
                  >
                    Clear
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-[1fr_minmax(280px,380px)]">
              <Card>
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
                  <div>
                    <CardTitle className="text-base">Scans</CardTitle>
                    <CardDescription>
                      {listQuery.isPending ? "Loading…" : `${total} total · showing ${rows.length}`}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="p-0 sm:p-2">
                  {listQuery.isError ? (
                    <p className="px-4 py-6 text-sm text-destructive">
                      {errorMessage(listQuery.error)}
                    </p>
                  ) : listQuery.isPending ? (
                    <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
                  ) : rows.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-muted-foreground">
                      No scans match these filters.
                    </p>
                  ) : (
                    <ScrollArea className="h-[min(520px,55vh)] sm:h-[min(560px,60vh)]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[120px]">Status</TableHead>
                            <TableHead>Scan</TableHead>
                            <TableHead>User</TableHead>
                            <TableHead>Provider</TableHead>
                            <TableHead className="max-w-[160px]">Summary / error</TableHead>
                            <TableHead className="text-right">Retries</TableHead>
                            <TableHead className="w-[120px]">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows.map((r) => (
                            <ScanTableRow
                              key={r.id}
                              row={r}
                              selected={selectedId === r.id}
                              onSelect={() => setSelectedId(r.id)}
                              onRetryFailed={() => setConfirmFailed(r.id)}
                              onRetryCompleted={() => setConfirmCompleted(r.id)}
                            />
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={offset <= 0}
                      onClick={() => setOffset((o) => Math.max(0, o - limit))}
                    >
                      Previous
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Offset {offset} · limit {limit}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={offset + limit >= total}
                      onClick={() => setOffset((o) => o + limit)}
                    >
                      Next
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <ScanDetailPanel
                row={detailQuery.data}
                loading={detailQuery.isPending}
                error={detailQuery.isError ? errorMessage(detailQuery.error) : null}
                onRetryFailed={() => selectedId && setConfirmFailed(selectedId)}
                onRetryCompleted={() => selectedId && setConfirmCompleted(selectedId)}
              />
            </div>
          </TabsContent>

          <TabsContent value="stuck" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Stuck threshold</CardTitle>
                <CardDescription>
                  Lists <code className="rounded bg-muted px-1">processing</code> scans with{" "}
                  <code className="rounded bg-muted px-1">updated_at</code> older than N minutes
                  (GET /internal/scans/stuck).
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-end gap-3">
                <div className="space-y-2">
                  <Label htmlFor="stuck-min">Minutes</Label>
                  <Input
                    id="stuck-min"
                    type="number"
                    min={1}
                    max={1440}
                    className="w-32"
                    value={stuckMinutes}
                    onChange={(e) => setStuckMinutes(Number(e.target.value) || 15)}
                  />
                </div>
                <Button type="button" variant="secondary" onClick={() => void stuckQuery.refetch()}>
                  Reload stuck
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Stuck scans</CardTitle>
                <CardDescription>
                  {stuckQuery.isPending ? "Loading…" : `${stuckRows.length} row(s)`}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0 sm:p-2">
                {stuckQuery.isError ? (
                  <p className="px-4 py-6 text-sm text-destructive">
                    {errorMessage(stuckQuery.error)}
                  </p>
                ) : stuckRows.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-muted-foreground">
                    No stuck scans for this threshold.
                  </p>
                ) : (
                  <ScrollArea className="h-[min(480px,50vh)]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Scan</TableHead>
                          <TableHead>User</TableHead>
                          <TableHead>Updated</TableHead>
                          <TableHead className="w-[140px]">Reset</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stuckRows.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-mono text-xs">{r.id}</TableCell>
                            <TableCell className="max-w-[200px] truncate text-sm">
                              {r.user_email || r.user_id || "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {fmtTs(r.updated_at)}
                            </TableCell>
                            <TableCell>
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                onClick={() => setConfirmReset({ id: r.id, minutes: stuckMinutes })}
                              >
                                Reset stuck
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog open={Boolean(confirmFailed)} onOpenChange={(o) => !o && setConfirmFailed(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retry failed scan?</AlertDialogTitle>
            <AlertDialogDescription>
              Clears error state, resets result fields, increments retry count, and enqueues a new
              job. Refused if a worker still has the job active.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmFailed) {
                  retryMutation.mutate({ id: confirmFailed });
                }
                setConfirmFailed(null);
              }}
            >
              Retry
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(confirmCompleted)}
        onOpenChange={(o) => !o && setConfirmCompleted(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Re-queue completed scan?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This is destructive to the stored result: the scan row is reset to pending and
              re-enqueued. Only use when you intentionally need to re-run detection.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmCompleted) {
                  retryMutation.mutate({ id: confirmCompleted, allowCompleted: true });
                }
                setConfirmCompleted(null);
              }}
            >
              Re-run anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(confirmReset)} onOpenChange={(o) => !o && setConfirmReset(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset stuck processing scan?</AlertDialogTitle>
            <AlertDialogDescription>
              Requires the row to match stale processing rules and no active BullMQ job. Uses
              threshold {confirmReset?.minutes ?? stuckMinutes} minutes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmReset) {
                  resetStuckMutation.mutate({ id: confirmReset.id, minutes: confirmReset.minutes });
                }
                setConfirmReset(null);
              }}
            >
              Reset & re-enqueue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ScanTableRow({
  row,
  selected,
  onSelect,
  onRetryFailed,
  onRetryCompleted,
}: {
  row: InternalScanRow;
  selected: boolean;
  onSelect: () => void;
  onRetryFailed: () => void;
  onRetryCompleted: () => void;
}) {
  return (
    <TableRow
      data-state={selected ? "selected" : undefined}
      className={cn("cursor-pointer", selected && "bg-muted/60")}
      onClick={onSelect}
    >
      <TableCell>
        <Badge variant="outline" className={cn("text-xs capitalize", statusBadgeClass(row.status))}>
          {row.status}
        </Badge>
      </TableCell>
      <TableCell className="max-w-[220px]">
        <div className="font-mono text-xs">{row.id}</div>
        <div className="truncate text-xs text-muted-foreground">{row.filename}</div>
        <div className="text-[11px] text-muted-foreground">{row.source_type || "—"}</div>
      </TableCell>
      <TableCell className="max-w-[180px] truncate text-sm">
        {row.user_email || row.user_id || "—"}
      </TableCell>
      <TableCell className="text-xs">{row.detection_provider || "—"}</TableCell>
      <TableCell className="max-w-[160px] text-[11px] text-muted-foreground">
        {row.error_message ? (
          <span className="text-destructive">{excerpt(row.error_message, 64)}</span>
        ) : (
          excerpt(row.summary, 64)
        )}
      </TableCell>
      <TableCell className="text-right text-xs tabular-nums">{row.retry_count ?? 0}</TableCell>
      <TableCell className="space-y-1">
        {row.status === "failed" ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              onRetryFailed();
            }}
          >
            Retry
          </Button>
        ) : null}
        {row.status === "completed" ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onRetryCompleted();
            }}
          >
            Re-run…
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

function ScanDetailPanel({
  row,
  loading,
  error,
  onRetryFailed,
  onRetryCompleted,
}: {
  row: InternalScanRow | undefined;
  loading: boolean;
  error: string | null;
  onRetryFailed: () => void;
  onRetryCompleted: () => void;
}) {
  const [jsonOpen, setJsonOpen] = useState(false);

  return (
    <Card className="lg:sticky lg:top-6 lg:self-start">
      <CardHeader>
        <CardTitle className="text-base">Detail</CardTitle>
        <CardDescription>Select a row to load operational metadata.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {loading ? <p className="text-muted-foreground">Loading…</p> : null}
        {error ? <p className="text-destructive">{error}</p> : null}
        {!loading && !error && !row ? (
          <p className="text-muted-foreground">No scan selected.</p>
        ) : null}
        {row ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={cn("capitalize", statusBadgeClass(row.status))}>
                {row.status}
              </Badge>
              <span className="font-mono text-xs text-muted-foreground">{row.id}</span>
            </div>
            <Separator />
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted-foreground">User</dt>
              <dd className="break-all">{row.user_email || row.user_id || "—"}</dd>
              <dt className="text-muted-foreground">Retries</dt>
              <dd>{row.retry_count ?? 0}</dd>
              <dt className="text-muted-foreground">Provider</dt>
              <dd>{row.detection_provider || "—"}</dd>
              <dt className="text-muted-foreground">Source</dt>
              <dd className="break-all">{row.source_type || "—"}</dd>
              <dt className="text-muted-foreground">URL / storage</dt>
              <dd className="break-all text-[11px]">{row.source_url || row.storage_key || "—"}</dd>
              <dt className="text-muted-foreground">Created</dt>
              <dd>{fmtTs(row.created_at)}</dd>
              <dt className="text-muted-foreground">Updated</dt>
              <dd>{fmtTs(row.updated_at)}</dd>
              <dt className="text-muted-foreground">Completed</dt>
              <dd>{fmtTs(row.completed_at)}</dd>
              <dt className="text-muted-foreground">Confidence</dt>
              <dd>{row.confidence != null ? String(row.confidence) : "—"}</dd>
              <dt className="text-muted-foreground">AI flag</dt>
              <dd>{row.is_ai_generated == null ? "—" : row.is_ai_generated ? "true" : "false"}</dd>
            </dl>
            <div>
              <div className="text-xs font-medium text-muted-foreground">Summary</div>
              <p className="mt-1 whitespace-pre-wrap break-words text-xs">{row.summary || "—"}</p>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground">Error</div>
              <p className="mt-1 whitespace-pre-wrap break-words text-xs text-destructive">
                {row.error_message || "—"}
              </p>
            </div>
            <Collapsible open={jsonOpen} onOpenChange={setJsonOpen}>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="w-full">
                  {jsonOpen ? "Hide" : "Show"} raw result_payload
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <pre className="max-h-48 overflow-auto rounded-md border border-border bg-muted/40 p-2 text-[11px] leading-snug">
                  {row.result_payload == null
                    ? "null"
                    : JSON.stringify(row.result_payload, null, 2)}
                </pre>
              </CollapsibleContent>
            </Collapsible>
            <div className="flex flex-col gap-2 pt-2">
              {row.status === "failed" ? (
                <Button type="button" size="sm" variant="secondary" onClick={onRetryFailed}>
                  Retry failed scan
                </Button>
              ) : null}
              {row.status === "completed" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={onRetryCompleted}
                >
                  Re-run completed scan…
                </Button>
              ) : null}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
