# Operations, environment, and runbooks

Concise reference for **local / dev / staging-style** operation of `media-auth-saas`. Aligns with the current codebase (API, worker, web).

---

## 1. Monorepo layout

| Path | Role |
|------|------|
| `apps/api` | HTTP API: auth, user scans (`/scan/*`), enqueue BullMQ jobs (`scan-jobs`), upload persistence via **`@media-auth/scan-storage`**, internal ops (`/internal/scans`). |
| `apps/worker` | BullMQ consumer: loads scan row + media, runs detection provider, updates Postgres. |
| `apps/web` | SPA: user workspace + optional internal ops UI at `/internal/scans`. |

Root `package.json` delegates common scripts to workspaces (see README).

---

## 2. Scan lifecycle and queue

1. **Create** — Client `POST /scan` (JWT). API inserts `scans` (`status=pending`), persists upload if needed, adds BullMQ job **`scan-media`** with **`jobId = scan.id`** and payload `{ scanId, userId }`.
2. **Process** — Worker picks job, sets `processing`, runs provider, then `completed` or `failed` (and sets `completed_at` where applicable).
3. **Queue** — Redis + BullMQ queue name **`scan-jobs`**. API and worker must share the same **`REDIS_URL`**.

Statuses: **`pending` → `processing` → `completed` | `failed`**. Rows can be forced back to `pending` via internal ops (retry / reset-stuck) when rules allow.

### 2.1 Dashboard analytics (authenticated user)

| Method | Path | Notes |
|--------|------|--------|
| **GET** | **`/scan/analytics/activity`** | Query: **`range`** = `7d` \| `14d` \| `30d` (default **`14d`**), **`groupBy`** = `day` (default). Buckets by **`created_at`** (UTC calendar day). Returns **`points`** (every day in range, zeros if empty) plus **`summary`** rollups. |
| **GET** | **`/scan/analytics/detection-mix`** | Same **`range`**. Counts **completed** + **failed** scans only; categories **`authentic`** / **`suspicious`** / **`manipulated`** from **`is_ai_generated`** (see `apps/api/src/utils/detectionCategory.util.js`). |

Implementation: **`apps/api/src/services/scanAnalytics.service.js`** (queries), **`apps/api/src/utils/scanAnalyticsRange.util.js`**, **`apps/api/src/utils/scanAnalyticsActivity.util.js`**, **`apps/api/src/utils/detectionCategory.util.js`** (parsing + mix mapping).

---

## 3. Provider modes

| `DETECTION_PROVIDER` | Behavior |
|--------------------|----------|
| `mock` (default) | No external HTTP. Deterministic-style result for dev/tests. |
| `real` | **Generic:** POST to **`DETECTION_REAL_URL`** with optional **`DETECTION_REAL_API_KEY`** (`Authorization: Bearer …`). **Reality Defender:** set **`DETECTION_REAL_VENDOR=reality_defender`** and **`REALITY_DEFENDER_API_KEY`** — see §7. |

Unknown values fall back to **mock** (worker logs a warning).

**Readiness (worker):** from repo root:

```bash
npm run real-provider:check
```

Exits **0** when not using `real`, or when `real` is correctly configured (**`DETECTION_REAL_URL`** for generic mode, or **`REALITY_DEFENDER_API_KEY`** when **`DETECTION_REAL_VENDOR=reality_defender`**). **1** when `real` is active but misconfigured. Prints JSON (capabilities, issues).

---

## 4. Environment variables

### 4.1 Shared / infrastructure

| Variable | Used by | Default | Required |
|----------|---------|---------|----------|
| `DATABASE_URL` | API, worker | — | **Yes** (worker exits without it; API needs DB for real use) |
| `REDIS_URL` | API, worker | `redis://127.0.0.1:6379` | No (default ok for local) |

### 4.2 API (`apps/api`)

| Variable | Purpose | Default / notes |
|----------|---------|-----------------|
| `PORT` | Listen port | `4000` |
| `JWT_SECRET` | JWT sign/verify | `change-me` (set in any shared environment) |
| `CORS_ORIGIN` | Comma-separated allowed origins | Local + Netlify defaults in code |
| `INTERNAL_OPS_TOKEN` | Enables `/internal/scans`; `X-Internal-Token` must match | Unset → routes return **404** |
| `SCAN_STORAGE_LOCAL_DIR` | Local-disk upload root (when `OBJECT_STORAGE_PROVIDER=local`) | Repo `data/scan-uploads` (see §4.6) |

API loads **repo root** `.env` via `apps/api/src/index.js` (path `../../../.env` from `src`). On startup the API validates **`OBJECT_STORAGE_PROVIDER`** (same rules as the worker package).

### 4.3 Worker (`apps/worker`)

| Variable | Purpose | Default / notes |
|----------|---------|-----------------|
| `DETECTION_PROVIDER` | `mock` or `real` | `mock` |
| `DETECTION_REAL_VENDOR` | When `real`: leave unset for generic HTTP, or **`reality_defender`** for [Reality Defender RealAPI](https://realitydefender.com/api) | Unset → generic |
| `DETECTION_REAL_URL` | Upstream HTTP endpoint for generic `real` | Required when `real` and vendor **not** `reality_defender` |
| `DETECTION_REAL_API_KEY` | Optional Bearer for generic upstream | Optional |
| `REALITY_DEFENDER_API_KEY` | `X-API-KEY` for Reality Defender API | Required when `DETECTION_REAL_VENDOR=reality_defender` |
| `REALITY_DEFENDER_BASE_URL` | API origin | Default **`https://api.prd.realitydefender.xyz`** (matches [official TS SDK](https://github.com/Reality-Defender/realitydefender-sdk-typescript)) |
| `REALITY_DEFENDER_POLL_INTERVAL_MS` | Delay between media-detail polls | Default `5000` |
| `REALITY_DEFENDER_POLL_TIMEOUT_MS` | Max wait for a final status after upload | Default `300000` (5 min) |
| `DETECTION_REAL_TIMEOUT_MS` | Per HTTP request timeout (generic `real` **and** each RD presign/PUT/poll) | `120000` (clamped in code) |
| `DETECTION_REAL_MAX_FILE_BYTES` | Max bytes for multipart file | `20971520` (20 MiB), capped |
| `DETECTION_REAL_SEND_FILE` | Multipart upload mode when truthy | Off by default |
| `DETECTION_REAL_DISALLOW_URL` | Block URL-sourced scans for `real` | Optional |
| `DETECTION_REAL_EXPOSE_LOCAL_PATH` | Include basename (or path) of local file in JSON metadata | Optional |
| `DETECTION_REAL_EXPOSE_FULL_LOCAL_PATH` | Full path in metadata (requires expose flag) | Optional |
| `SCAN_STORAGE_LOCAL_DIR` | Local-disk upload root (when using `local` backend for a row) | Same default as API |
| `SCAN_WORKER_CONCURRENCY` | BullMQ worker concurrency | Parsed in `scanWorker.js` |
| `SCAN_WORKER_RATE_MAX` / `SCAN_WORKER_RATE_DURATION_MS` | Optional rate limit | See `scanWorker.js` |

Worker loads **repo root** `.env` the same way as API.

### 4.4 Web (`apps/web`)

| Variable | Purpose | Notes |
|----------|---------|--------|
| `VITE_API_BASE_URL` | API origin | Default `http://localhost:4000` in code |
| `VITE_INTERNAL_OPS_TOKEN` | Enables internal ops UI + sends `X-Internal-Token` | **Build-time**; must match API `INTERNAL_OPS_TOKEN` |

### 4.5 Internal ops tokens

- **API:** `INTERNAL_OPS_TOKEN` — server-side secret.
- **Web:** `VITE_INTERNAL_OPS_TOKEN` — **baked into the client bundle**. Only for **private / internal** builds, never a public multi-tenant admin story.

### 4.6 Scan upload storage (`@media-auth/scan-storage`)

- **`OBJECT_STORAGE_PROVIDER`:** `local` (default) or `s3` (GCS is not implemented — fails fast).
- **Local default directory:** `<repo>/data/scan-uploads` unless **`SCAN_STORAGE_LOCAL_DIR`** is set (same value on API and worker).
- **Legacy local rows:** `source_type = upload` with **`storage_key`** relative to the local root (`{scanId}/{safe-filename}`) and **`storage_provider`** null or `local`.
- **S3 rows:** **`storage_key`** is the full S3 object key, including **`OBJECT_STORAGE_PREFIX`** when set (must match between API, migration tool, and worker).

| Variable | When | Notes |
|----------|------|--------|
| `OBJECT_STORAGE_BUCKET` | `s3` | Required |
| `OBJECT_STORAGE_REGION` | `s3` | Required |
| `OBJECT_STORAGE_ACCESS_KEY_ID` / `OBJECT_STORAGE_SECRET_ACCESS_KEY` | `s3` | Required |
| `OBJECT_STORAGE_ENDPOINT` | `s3` | Optional (MinIO / S3-compatible) |
| `OBJECT_STORAGE_FORCE_PATH_STYLE` | `s3` | Optional (`1` / `true` for many MinIO setups) |
| `OBJECT_STORAGE_PREFIX` | `s3` | Optional prefix (e.g. `scans` → keys like `scans/{scanId}/file.png`) |
| `OBJECT_STORAGE_PUBLIC_BASE_URL` | `s3` | Optional (not used by worker fetch path) |

### 4.7 Migrating legacy local uploads to S3 (ops script)

Use when Postgres rows still reference **`local`** (or null provider) but you want objects in S3 and **`storage_provider = s3`** so workers read from the bucket.

**Script:** `apps/api/src/scripts/migrate-local-uploads-to-s3.js`  
**Commands (repo root, `.env` with `DATABASE_URL` + S3 vars):**

```bash
npm run migrate:local-uploads-to-s3:dry-run
npm run migrate:local-uploads-to-s3
# or with filters:
dotenv -e .env -- node apps/api/src/scripts/migrate-local-uploads-to-s3.js --dry-run --limit 20
dotenv -e .env -- node apps/api/src/scripts/migrate-local-uploads-to-s3.js --verify-only --check-s3 --scan-id <uuid>
```

**Behavior:**

- Selects **`source_type = upload`**, non-empty **`storage_key`**, **`storage_provider` IS NULL OR `local`** — never URL scans or existing S3 rows.
- For each row: resolves local path with **`absolutePathForStorageKey`**, reads the file, **`PutObject`** at the **target S3 key** (legacy key + current **`OBJECT_STORAGE_PREFIX`**), **`HeadObject`** to verify size, then **`UPDATE`** `storage_provider = 's3'`, **`storage_key` = target key** (conditional update so reruns are safe).
- **Does not delete** local files (phase-1); plan a separate cleanup after backups and verification.
- **Idempotent:** if the object already exists in S3 with the same size as the local file, **PutObject** is skipped; DB is still updated if the row is still local-backed. If **S3 succeeded** but **`UPDATE` returned 0 rows**, the log marks **`failedDbUpdate`** — the object may exist under **`targetS3Key`** while the row was changed elsewhere; reconcile manually (inspect row, delete stray object only if sure).

**Dry-run:** no S3 calls, no DB writes; lists candidates and whether the local file exists.  
**Verify-only:** local **`stat`** (and optional **`--check-s3`** Head); no DB writes.

**Rollback:** restore **`storage_provider`** / **`storage_key`** from a DB backup or manual SQL if needed; copied S3 objects can remain until you lifecycle-delete them.

### 4.8 Post-migration audit and optional local-file cleanup (ops)

**Recommended order:** migrate (§4.7) → **audit** with **`--check-s3`** and **`--check-local`** → spot-check a few rows in S3 and on disk → only then consider **cleanup** (still does not touch S3 or Postgres).

**Audit script:** `apps/api/src/scripts/audit-scan-upload-storage.js`

```bash
npm run audit:scan-upload-storage
npm run audit:scan-upload-storage:with-s3
npm run audit:scan-upload-storage:json
# Example: JSON + S3 heads (needs DATABASE_URL + S3 env):
dotenv -e .env -- node apps/api/src/scripts/audit-scan-upload-storage.js --check-s3 --check-local --json
```

**Row buckets (summary counts):**

| Bucket | Meaning |
|--------|---------|
| `local_only` | Row still local-backed; local file present; with `--check-s3`, no object at migration target key. |
| `s3_only` | Row S3-backed; S3 head OK when checked; legacy local copy absent (or local check skipped). |
| `local_and_s3` | Redundant: S3 object OK **and** legacy local file still on disk — typical after migration before cleanup. |
| `missing_local_but_db_local` | **Critical:** DB says local but file missing under `SCAN_STORAGE_LOCAL_DIR`. |
| `db_s3_but_missing_in_s3` | **Critical:** DB says S3 but `HeadObject` on `storage_key` missing (requires `--check-s3`). |
| `invalid_storage_metadata` | **Critical:** empty/bad key, unknown provider, or key shape not parseable to legacy `uuid/file`. |
| `s3_probe_error` | **Critical:** S3 API error during head. |
| `s3_unverified` | S3 row but `--check-s3` not used (or inconclusive). |
| `local_file_unverified` | Local row but `--no-check-local`. |
| `s3_db_local_file_present_unverified` | Legacy file on disk but S3 not verified — run with `--check-s3`. |
| `orphan_local_file` | Files under the upload root not referenced by any scan’s derived legacy path (full-table reference set). |

**Exit codes:** exit **1** if any of `invalid_storage_metadata`, `missing_local_but_db_local`, `db_s3_but_missing_in_s3`, or `s3_probe_error` is non-zero. With **`--strict`**, exit **1** also when orphans or unverified bucket counts are non-zero.

**Cleanup scaffold:** `apps/api/src/scripts/cleanup-local-upload-files.js` — **dry-run by default**; removes **only** the legacy on-disk file for rows already **`storage_provider = s3`**, after **successful S3 Head** on the row’s `storage_key`. Pass **`--execute`** to perform **`unlink`**. Never deletes S3 objects or DB rows. Use **`--older-than`** / **`--limit`** / **`--scan-id`** to narrow scope.

```bash
npm run cleanup:local-upload-files:dry-run
# Danger: only after audit + backups
npm run cleanup:local-upload-files
```

---

## 5. Startup order and commands

### 5.1 Docker Compose (local infrastructure — optional)

Root **`docker-compose.yml`** runs **Postgres 16**, **Redis 7**, and **MinIO** only. **API, worker, and web stay on the host** (**`npm run dev`** or individual **`npm run dev:*`**) with **`.env`** pointing at **`127.0.0.1`** — copy from **`.env.docker.example`** and adjust.

| npm script | Effect |
|------------|--------|
| `npm run docker:up` | `docker compose up -d` |
| `npm run docker:infra:up` | Same services explicitly: postgres, redis, minio, minio-create-bucket |
| `npm run docker:down` | Stop containers (volumes persist) |
| `npm run docker:logs` | `docker compose logs -f` |
| `npm run docker:reset` | `docker compose down -v` then `up -d` — **wipes** Postgres/Redis/MinIO data for this stack |

**Host ports**

| Service | Port | Defaults / URL |
|---------|------|------------------|
| Postgres | **5432** | `mediaauth` / `mediaauth` / DB `mediaauth` → `DATABASE_URL=postgresql://mediaauth:mediaauth@127.0.0.1:5432/mediaauth` |
| Redis | **6379** | `REDIS_URL=redis://127.0.0.1:6379` |
| MinIO S3 | **9000** | Root `minio` / `minio12345` → `OBJECT_STORAGE_ENDPOINT=http://127.0.0.1:9000` (from the host, not `http://minio:9000`) |
| MinIO console | **9001** | `http://127.0.0.1:9001` |

**Bucket init:** **`minio-create-bucket`** waits for MinIO (retry loop), then **`mc mb local/media-auth-dev --ignore-existing`**. Idempotent. If you ever need to recreate the bucket without a full `up`, run: **`docker compose run --rm minio-create-bucket`**.

**Health checks (host apps):** `GET /health`, `GET /ready` (Postgres + Redis). MinIO: open console; S3 API: `npm run object-storage:check` with `OBJECT_STORAGE_PROVIDER=s3` in `.env`.

**Pitfalls:** host port clashes (change mapping + `DATABASE_URL`); **`OBJECT_STORAGE_FORCE_PATH_STYLE=1`** for MinIO; **`docker:reset`** removes volumes; **`VITE_*`** require restarting **`npm run dev`** (or **`npm run dev:web`** if only the SPA changed).

**`docker-compose.override.yml`** is gitignored — use for local port overrides.

---

**Order:** Postgres → Redis → migrate (once / on schema change) → **`npm run dev`** (API + worker + web together) **or** API → Worker → Web in separate terminals. (Postgres/Redis/MinIO can come from Compose per §5.1.)

**First-time sanity check:** `npm run dev:check` — read-only: Node/Docker, `.env` presence, `DATABASE_URL` / `JWT_SECRET`, S3 vars when `OBJECT_STORAGE_PROVIDER=s3`, common mistakes (e.g. `minio:9000` endpoint on host). Does not start services or install packages.

**Host apps (recommended):** `npm run dev` — starts **API, worker, and web** in one terminal with **prefixed, colorized** output ([`concurrently`](https://www.npmjs.com/package/concurrently)); **Ctrl+C** stops all children. Does **not** start Docker Compose (bring infra up with `npm run docker:up` first). Alias: `npm run dev:all`. Individual **`npm run dev:api`**, **`dev:worker`**, **`dev:web`** remain available.

| Step | Command (from repo root unless noted) |
|------|----------------------------------------|
| Postgres | Your Postgres, **or** `npm run docker:up` + `.env` from `.env.docker.example`. |
| Redis | Your Redis, **or** Compose as above. |
| Migrations | `npm run db:migrate` |
| API + worker + web | **`npm run dev`** (or three separate `dev:*` commands / `npm run worker` for production-style worker) |

**Health:**

| Endpoint / command | Meaning |
|--------------------|---------|
| `GET http://localhost:4000/health` | Process up (no dependency checks). |
| `GET http://localhost:4000/ready` | **200** if Postgres `SELECT 1` and Redis `PING` succeed; **503** with `{ ok, database, redis }` otherwise. DB check fails if `DATABASE_URL` is unset or DB is down (pool module may throw on require when misconfigured). |
| `npm run real-provider:check` | Worker-side env validation when using `DETECTION_PROVIDER=real`. |
| `npm run object-storage:check` | Validates `OBJECT_STORAGE_PROVIDER` + S3 env; instantiates storage when possible. |
| `npm run migrate:local-uploads-to-s3:dry-run` | Lists local-backed upload scans and planned S3 keys (no writes). |
| `npm run migrate:local-uploads-to-s3` | Copies local files to S3 and updates rows (see §4.7). |
| `npm run audit:scan-upload-storage` | Classifies upload rows + optional orphan files (see §4.8). |
| `npm run audit:scan-upload-storage:with-s3` | Same with `--check-s3 --check-local` (requires S3 env). |
| `npm run audit:scan-upload-storage:json` | Same with `--json` (add `--check-s3` in the command for full verification). |
| `npm run cleanup:local-upload-files:dry-run` | Proposes legacy local `unlink` for S3-backed rows only (§4.8). |
| `npm run cleanup:local-upload-files` | **`--execute`** — actually unlinks those local files. |

---

## 6. Runbooks

### 6.1 Scan stays `pending`

| Check | Action |
|-------|--------|
| Worker running? | Start worker; confirm logs show `scan-jobs` consumer. |
| Redis reachable? | `GET /ready`, fix `REDIS_URL`. |
| Job in queue? | Redis / BullMQ board, or internal ops after job exists. |
| Wrong Redis? | API and worker must use same `REDIS_URL`. |

### 6.2 Scan stuck in `processing`

| Check | Action |
|-------|--------|
| Worker logs | Crashed mid-job, provider hang, or unhandled error path. |
| BullMQ job `active`? | Internal **retry/reset-stuck** refuses while job is **active**; wait or stop worker carefully in dev only. |
| Stale row? | `GET /internal/scans/stuck?minutes=…` then **`POST /internal/scans/:id/reset-stuck?minutes=…`** (or use web `/internal/scans`). |

### 6.3 Retry a failed scan

Use **`POST /internal/scans/:id/retry`** or the internal web UI. Clears error/result fields, increments **`retry_count`**, removes prior job id if present, re-enqueues with same **`jobId = scan.id`**. Not allowed for **`processing`** or **`pending`**. Optional **`?allow_completed=1`** for completed rows (destructive).

### 6.4 Real provider misconfiguration

1. **Generic HTTP:** `DETECTION_PROVIDER=real` and **`DETECTION_REAL_URL`** set (leave **`DETECTION_REAL_VENDOR`** unset).
2. **Reality Defender:** `DETECTION_PROVIDER=real`, **`DETECTION_REAL_VENDOR=reality_defender`**, **`REALITY_DEFENDER_API_KEY`** set.
3. `npm run real-provider:check`.
4. Align **multipart vs JSON** with `DETECTION_REAL_SEND_FILE` and URL vs upload scans for **generic** mode (see §7). Reality Defender MVP is **upload + image MIME types only**.

### 6.5 Redis / Postgres errors

- **`/ready`** — see which flag is false.
- Worker/API logs — connection string, TLS, firewall.
- Migrations — `npm run db:migrate` after pulling schema changes.

### 6.6 Upload / `storage_key` / object storage

| Symptom | Likely cause |
|---------|----------------|
| Worker “file missing” (**`local`**) | File never written under `SCAN_STORAGE_LOCAL_DIR` / default `data/scan-uploads`, or API and worker use **different** dirs. |
| Worker “S3 object missing” | Wrong bucket/region/credentials; key deleted; **`OBJECT_STORAGE_PREFIX`** mismatch between writer and reader. |
| **`storage_provider=s3`** job fails on worker with config error | Worker host missing S3 env even if API wrote the row with S3; **every consumer** that processes S3 rows needs credentials + bucket access. |
| Invalid `storage_key` | DB corruption or manual edit; local keys must match `uuid/filename` pattern. |

### 6.7 `retry_count` vs BullMQ attempts

- **`retry_count`** (Postgres): incremented on **internal** retry / reset-stuck re-queue operations.
- **BullMQ `attempts` / backoff** (job options): worker job-level retries on transient failures **before** terminal `failed`. These are separate mechanisms; both can affect how many times work runs.

### 6.8 Migrating old local files to S3, auditing, and cleaning local copies

1. **Migrate** — §4.7: `migrate:local-uploads-to-s3:dry-run` then live migration; local files remain on disk.
2. **Audit** — §4.8: `audit:scan-upload-storage` with **`--check-s3 --check-local`**; fix any **critical** buckets before cleanup.
3. **Spot-check** — open a few objects in the S3 console and confirm workers complete new upload scans.
4. **Cleanup (optional)** — §4.8: `cleanup:local-upload-files:dry-run`, then **`cleanup:local-upload-files`** with **`--execute`** only in a controlled window after backups. Cleanup is intentionally separate from migration so operators never conflate “copy to S3” with “delete local bytes.”

---

## 7. Real provider integration (summary)

### 7.1 Generic HTTP (`DETECTION_REAL_URL`)

- **JSON mode (default):** POST JSON to `DETECTION_REAL_URL` with metadata (`scanId`, `sourceType`, `storageKey`, etc.). File path may be exposed per capability flags.
- **Multipart (`DETECTION_REAL_SEND_FILE`):** sends file stream; **not** compatible with URL-only scans or legacy rows without a file (worker throws typed errors).
- **Response:** Worker expects a normalizable object (confidence 0–100, boolean `isAiGenerated`, summary, optional details) — see `apps/worker/test/realProviderResponse*.js` and `realProviderRequest*.js`.
- **Limits:** Multer on API allows specific MIME types and **20MB** upload cap; real provider has `DETECTION_REAL_MAX_FILE_BYTES` (default 20MB, capped higher in code).
- **URL scans:** Can be disabled for real via `DETECTION_REAL_DISALLOW_URL`.

### 7.2 Reality Defender (`DETECTION_REAL_VENDOR=reality_defender`)

Uses the same presign → PUT → poll flow as the [Reality Defender TypeScript SDK](https://github.com/Reality-Defender/realitydefender-sdk-typescript) (`POST /api/files/aws-presigned`, PUT to returned `signedUrl`, `GET /api/media/users/{requestId}` with **`X-API-KEY`**).

| Topic | Notes |
|--------|--------|
| **Scope (MVP)** | **`source_type = upload`** scans with a **local temp file** on the worker, **image** MIME types only (`image/jpeg`, `image/png`, `image/gif`, `image/webp`, etc.). **URL scans**, legacy metadata-only rows, and non-image MIME types → **`UnsupportedInputError`** (terminal). |
| **Confidence** | Taken from **`resultsSummary.metadata.finalScore`** when present (**0–100**, same scale as the upstream API). If missing, a conservative numeric fallback is used so the row always stores a finite confidence; **`is_ai_generated`** may be **`NULL`** for inconclusive statuses (`SUSPICIOUS`, `NOT_APPLICABLE`, `UNABLE_TO_EVALUATE`, …). |
| **Polling** | Stops when `resultsSummary.status` is no longer **`ANALYZING`**, or throws **`ProviderTimeoutError`** (retryable) after **`REALITY_DEFENDER_POLL_TIMEOUT_MS`**. |
| **Troubleshooting** | **`401`/`403`** on presign or poll → check **`REALITY_DEFENDER_API_KEY`**. Stuck **`ANALYZING` until timeout** → increase **`REALITY_DEFENDER_POLL_TIMEOUT_MS`** or check Reality Defender dashboard/queue. **`REALITY_DEFENDER_BASE_URL`** must be a valid URL if set. |
| **Unsupported `DETECTION_REAL_VENDOR`** | Worker fails fast with **`ConfigurationError`**; `npm run real-provider:check` surfaces the same. |

---

## 8. Internal ops (API + web)

When **`INTERNAL_OPS_TOKEN`** is set on the API:

- HTTP routes under **`/internal/scans`** (list, stuck, counts, detail, retry, reset-stuck). Wrong/missing token → **403** / **404** (see API middleware).

When **`VITE_INTERNAL_OPS_TOKEN`** is set at **web build** time:

- SPA route **`/internal/scans`** — operator dashboard (not linked from the main app chrome).

Full route list: see root **README** or API `scanAdmin.routes.js`.

---

## 9. Troubleshooting matrix

| Symptom | Likely causes |
|---------|----------------|
| Scan stays **pending** | Worker down; Redis mismatch; job not enqueued; check API logs and `/ready`. |
| Stuck **processing** | Worker crash/hang; active BullMQ job; use stuck listing + reset when eligible. |
| **failed** + auth/config | `real` provider 401/403; missing **`DETECTION_REAL_URL`** (generic) or **`REALITY_DEFENDER_API_KEY`** (RD); unknown **`DETECTION_REAL_VENDOR`**; `ConfigurationError`-style messages in logs/DB `error_message`. |
| Real provider “bad response” | Generic: upstream JSON shape; non-200. Reality Defender: malformed presign/media JSON; `ProviderBadResponseError` paths. |
| Reality Defender **timeout** | **`ProviderTimeoutError`** (retryable): analysis stayed **`ANALYZING`** past **`REALITY_DEFENDER_POLL_TIMEOUT_MS`**, or single HTTP call exceeded **`DETECTION_REAL_TIMEOUT_MS`**. |
| Reality Defender **unsupported** | URL scan, non-image MIME, or no local file → **`UnsupportedInputError`** (terminal). |
| Upload scan unreadable | **`local`:** dir mismatch or missing file. **`s3`:** credentials, bucket, or key wrong; see §6.6. |
| Internal ops **UI disabled** | `VITE_INTERNAL_OPS_TOKEN` not set at build; page shows notice only. |
| Internal ops **403** | `X-Internal-Token` wrong or `INTERNAL_OPS_TOKEN` unset on API (404) vs mismatch (403). |
| **`/ready` 503** | Postgres down or Redis down from API host. |

---

## 10. Deployment caveats

- **`VITE_INTERNAL_OPS_TOKEN`** is **client-visible** after build — internal/private deploys only.
- Internal ops is a **small operator surface**, not a full RBAC admin product.
- **`OBJECT_STORAGE_PROVIDER=local`** is convenient for dev; production should use **`s3`** (or future GCS) with proper IAM, encryption, and lifecycle policies.
- **Real provider** path has tests and timeouts but no circuit breaker or advanced bulkheading — treat upstream as a integration you own and monitor.

---

## 11. Tests (optional)

- Shared storage package: `npm --workspace @media-auth/scan-storage run test`
- API unit (includes migration lib): `npm --workspace apps/api run test`
- Worker unit: `npm run test:worker`
- Worker integration: `npm run test:integration:worker` (needs `RUN_SCAN_INTEGRATION`, DB, Redis)
- API integration: `npm run test:integration:api` (needs `RUN_API_INTEGRATION`, DB, Redis; internal ops tests need `INTERNAL_OPS_TOKEN`)

### 11.1 MinIO / S3-backed optional integration tests

These **do not** run in normal CI unless you set the flags and provide a real S3-compatible endpoint (MinIO locally is typical).

**`@media-auth/scan-storage` — direct S3 client tests**

- Gate: **`RUN_S3_INTEGRATION=1`** plus **`OBJECT_STORAGE_BUCKET`**, **`OBJECT_STORAGE_REGION`**, **`OBJECT_STORAGE_ACCESS_KEY_ID`**, **`OBJECT_STORAGE_SECRET_ACCESS_KEY`**.
- Command: **`npm run test:scan-storage:s3`** (from repo root; loads `.env` and sets the flag).
- Covers: `saveUpload`, `putBufferAtStorageKey`, `getObjectInfo` (including missing key), `getDownloadStream` (happy path + missing object throws), optional **`OBJECT_STORAGE_PREFIX`** behavior.

**API + worker — upload with `OBJECT_STORAGE_PROVIDER=s3`**

- Gate: **`RUN_API_INTEGRATION`**, **`RUN_API_S3_STORAGE_INTEGRATION`**, **`RUN_API_INTEGRATION_WORKER`**, plus **`DATABASE_URL`**, **`REDIS_URL`**, **`JWT_SECRET`**, and the same S3 env vars as above.
- Command: **`npm run test:integration:api:s3`** (not part of the default `*.integration.test.js` glob; file `scanApiS3Storage.minio-integration.test.js`).
- The suite forces **`OBJECT_STORAGE_PROVIDER=s3`** for the process, resets the storage singleton, starts the API + in-process worker, uploads a PNG, asserts **`storage_provider = s3`**, waits for **`completed`** with mock detection, then deletes the test object from S3 where possible.

**Example MinIO (Docker) and `.env`**

1. Run MinIO (example): `docker run -d --name minio-dev -p 9000:9000 -e MINIO_ROOT_USER=minio -e MINIO_ROOT_PASSWORD=minio12345 quay.io/minio/minio server /data`
2. Create a bucket (e.g. **`media-auth-test`**) via the MinIO console (`http://127.0.0.1:9000`) or `mc`.
3. In repo **`.env`** (same values for API/worker when you run the app):

| Variable | Example (MinIO) |
|----------|------------------|
| `OBJECT_STORAGE_PROVIDER` | `s3` |
| `OBJECT_STORAGE_BUCKET` | `media-auth-test` |
| `OBJECT_STORAGE_REGION` | `us-east-1` (many MinIO setups accept any non-empty string) |
| `OBJECT_STORAGE_ENDPOINT` | `http://127.0.0.1:9000` |
| `OBJECT_STORAGE_ACCESS_KEY_ID` | `minio` |
| `OBJECT_STORAGE_SECRET_ACCESS_KEY` | `minio12345` |
| `OBJECT_STORAGE_FORCE_PATH_STYLE` | `1` |

**Caveats**

- **Bucket must exist** before tests; the suite does not create it.
- **`OBJECT_STORAGE_PREFIX`:** tests honor your prefix; cleanup deletes keys the tests created under that prefix.
- **Path-style** is required for most MinIO + AWS SDK v3 combinations when using a custom endpoint.
- **Default `npm run test` in `scan-storage`** still loads `s3Minio.integration.test.js` but the suite is **`describe.skip`** when `RUN_S3_INTEGRATION` is unset (one skipped suite in the TAP output).
- **Not covered** even with MinIO: real AWS IAM roles, SSE-KMS, versioning/lifecycle policies, very large multipart uploads, cross-region replication, or migration/audit CLI scripts (run those manually against MinIO if needed).

---

## 12. Intentional gaps / future work

- No Docker Compose in-repo (operators bring their own Postgres/Redis).
- No hosted BullMQ dashboard wired in.
- **GCS** backend not implemented (`OBJECT_STORAGE_PROVIDER=gcs` fails at startup).
- No presigned URL delivery to browsers for direct-to-S3 uploads (API receives multipart and writes server-side).
- Production hardening (rate limits, audit logs for internal routes, etc.) left to downstream ops choices.
