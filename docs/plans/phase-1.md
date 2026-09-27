# Phase 1 — Database and Worker Skeleton

> **Scope:** schema, migrations, DB client (read-only for web, read-write for worker), worker sync loop with `sync_state`, `/api/health`, unit tests for health logic, ARCHITECTURE.md updates for the `worker` row and health payload.
>
> **Prerequisite:** Phase 0 is complete. All quality-gate checks pass on the empty app.

---

## 1. Overview

Phase 1 delivers the data layer and the worker process skeleton. After this phase:

- The full SQLite schema exists and is managed by Drizzle migrations.
- The worker process runs, applies migrations on startup, enables WAL + busy timeout, and loops on a configurable interval. There are no collector calls yet — the loop only records the worker heartbeat and logs. Collector calls are added from `src/server/integrations/` in Phases 2 and 4.
- The web process opens the database **read-only** and **lazily** (on first request, not at import time), so `pnpm build` succeeds without a database file on disk. If the DB file doesn't exist, `getReaderDb()` returns `null` (and does **not** cache that `null` — it retries on the next call).
- `/api/health` returns a JSON payload describing the system state honestly: worker loop timing, each source marked as "not yet implemented" (via an explicit code constant, not inferred from data), and an overall `ok` flag.
- Pure logic (the health-status computation) has unit tests.
- ARCHITECTURE.md is updated to document the `worker` row in `sync_state` and the `/api/health` payload shape.

---

## 2. Files to Create or Modify

### 2.1. `src/server/db/schema.ts` — MODIFY (existing, currently empty placeholder)

**Purpose:** Define all five tables from ARCHITECTURE.md → Database schema as Drizzle table declarations.

Tables to define:

```
sync_state
  source        text  PK                       — 'notion' | 'drive' | 'worker'
  cursor        text  nullable                 — ISO timestamp
  seeded        integer  not null  default 0   — boolean (0/1)
  last_success_at  text  nullable              — ISO timestamp
  last_error    text  nullable
  last_error_at text  nullable

notion_tasks
  page_id       text  PK
  title         text  not null
  status        text  not null
  status_group  text  not null                 — 'todo' | 'active' | 'done'
  department_id text  nullable                 — nullable: tasks may lack a department
  milestone_id  text  nullable
  due_date      text  nullable
  blocked       integer  not null  default 0   — boolean
  blocker_note  text  nullable
  is_next       integer  not null  default 0   — boolean
  url           text  not null
  archived      integer  not null  default 0   — boolean
  last_edited_time  text  not null

drive_files
  file_id       text  PK
  name          text  not null
  mime_type     text  not null
  is_folder     integer  not null  default 0
  parent_id     text  nullable
  department_id text  nullable
  doc_type      text  nullable
  created_time  text  not null
  modified_time text  not null
  web_view_link text  not null
  trashed       integer  not null  default 0

raw_events
  id            integer  PK  autoincrement
  source        text  not null
  kind          text  not null
  external_id   text  not null
  payload       text  not null                 — JSON string
  occurred_at   text  not null
  ingested_at   text  not null
  processed     integer  not null  default 0
  UNIQUE(source, external_id, kind, occurred_at)

project_events
  id            integer  PK  autoincrement
  type          text  not null                 — closed list of event types
  department_id text  nullable
  subject_title text  not null
  detail        text  nullable
  doc_type      text  nullable
  source        text  not null
  source_id     text  not null
  url           text  nullable
  occurred_at   text  not null
  raw_event_id  integer  nullable
```

Use Drizzle's `sqliteTable`, `text`, `integer` from `drizzle-orm/sqlite-core`. Export every table as a named constant (e.g., `export const syncState = ...`).

Use snake_case for SQL column names. Use camelCase for the Drizzle JS field names where Drizzle conventions require it, but keep the SQL column name explicit via the column name string as the first argument.

**Change vs ARCHITECTURE.md:** `notion_tasks.department_id` is `nullable` here (tasks may not yet have a department assigned). Update ARCHITECTURE.md's Database schema section to match: change the `department_id` line in `notion_tasks` from implied not-null to nullable.

### 2.2. `src/server/db/client.ts` — CREATE

**Purpose:** Two database accessors — one for the worker (read-write), one for the web process (read-only). Both are lazy.

**Design:**

```typescript
// --- Worker (read-write) ---
// getWriterDb(): returns a drizzle instance backed by a better-sqlite3
// connection opened in read-write mode. Called once by the worker on startup.
// On first call:
//   1. Opens DATABASE_PATH (from process.env, default './data/app.db')
//   2. Runs: PRAGMA journal_mode = WAL
//   3. Runs: PRAGMA busy_timeout = 5000
//   4. Runs Drizzle migrations with an explicit migrationsFolder
//      resolved from path.join(process.cwd(), "src/server/db/migrations") (see §2.3)
//   5. Caches and returns the drizzle instance
// Subsequent calls return the cached instance.

// --- Web (read-only) ---
// getReaderDb(): returns a drizzle instance or null.
// On each call:
//   1. If a cached drizzle instance exists, return it immediately.
//   2. Otherwise, check if DATABASE_PATH file exists (use fs.existsSync).
//   3. If it does not exist, return null — but DO NOT cache null.
//      The next call will check again, so the web process picks up a
//      newly-created DB without restarting.
//   4. If it exists, open better-sqlite3 with { readonly: true }.
//   5. Run: PRAGMA busy_timeout = 5000  (needed even for readers under WAL)
//   6. Wrap with drizzle(), cache, and return.
//
// The web process NEVER calls getWriterDb(). This enforces "only the worker writes".
// Neither function is called at module top level — both are called lazily
// inside request handlers / the worker entry point.
```

Import `Database` from `better-sqlite3`, `drizzle` from `drizzle-orm/better-sqlite3`, and the `migrate` function from `drizzle-orm/better-sqlite3/migrator`.

The `DATABASE_PATH` env var is read inside the function body (not at module scope).

**Migration folder:** Pass `migrationsFolder` explicitly to `migrate()`:

```typescript
import path from "node:path";

// Inside getWriterDb():
migrate(db, {
  migrationsFolder: path.join(process.cwd(), "src/server/db/migrations"),
});
```

This resolves to `src/server/db/migrations/` from the repository root, which works because the worker always runs from the repo root via `pnpm worker`.

### 2.3. Generate Drizzle Migrations

**Purpose:** Create the initial migration SQL from the schema.

**Command (run by implementer):**

```bash
pnpm drizzle-kit generate
```

This reads `drizzle.config.ts` (already exists, points at `./src/server/db/schema.ts` and outputs to `./src/server/db/migrations`). It will produce a timestamped SQL file and a `meta/` directory under `src/server/db/migrations/`.

**Verify:**
1. The generated SQL file contains `CREATE TABLE` statements for all five tables. Inspect it manually.
2. `src/server/db/migrations/meta/_journal.json` exists. This file **must be committed** — Drizzle's migrator reads it at runtime to know which migrations to apply.

**`.gitignore` check:** Make sure `.gitignore` does **not** contain a pattern that would exclude `src/server/db/migrations/meta/`. The existing `.gitignore` should be fine, but verify.

### 2.4. `src/worker/index.ts` — CREATE

**Purpose:** The worker entry point. This is the file run by `pnpm worker`.

**Design:**

```typescript
// 1. Load config (loadConfig() — validates project.yaml)
// 2. Call getWriterDb() — this opens the DB, runs migrations, enables WAL
// 3. Seed sync_state rows if they don't exist:
//      INSERT OR IGNORE into sync_state for 'notion', 'drive', and 'worker'
//      (all fields null/default except source)
// 4. Read SYNC_INTERVAL_SECONDS from env (default 300, parseInt)
// 5. Enter loop:
//      a. Update sync_state SET last_success_at = now WHERE source = 'worker'
//      b. log JSON: { event: "sync_loop_tick", timestamp: new Date().toISOString() }
//      c. sleep SYNC_INTERVAL_SECONDS (use setTimeout wrapped in a promise)
//
// Phase 1 has NO collector calls. The loop only heartbeats and sleeps.
// Phase 2 adds syncNotion() here (from src/server/integrations/notion/collector.ts).
// Phase 4 adds syncDrive() here (from src/server/integrations/drive/collector.ts).

// The worker catches errors at each step and logs them (JSON).
// A step failure must not crash the loop.

// Use a top-level async IIFE or a main() function.
// On SIGINT / SIGTERM, log and exit cleanly.
```

### 2.5. `src/server/queries/health.ts` — CREATE

**Purpose:** Query function that reads `sync_state` and returns a structured health payload. Used by the `/api/health` route.

**Design:**

```typescript
import { syncState } from "@/server/db/schema";

/** Explicit list of implemented sync sources.
 *  Phase 1: empty. Phase 2 adds 'notion'. Phase 4 adds 'drive'.
 *  This is a code constant, not inferred from data. */
export const IMPLEMENTED_SOURCES: ReadonlyArray<"notion" | "drive"> = [];

export interface SourceHealth {
  lastSuccessAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  seeded: boolean;
  implemented: boolean;
}

export interface HealthPayload {
  ok: boolean;
  sources: {
    notion: SourceHealth;
    drive: SourceHealth;
  };
  worker: {
    lastLoopAt: string | null;
  };
  checkedAt: string;
}

/** Row type inferred from the Drizzle schema. */
type SyncStateRow = typeof syncState.$inferSelect;

/**
 * Pure function — no DB access. Unit-testable.
 *
 * @param syncRows - All rows from the sync_state table (may be empty if DB is missing).
 * @param now      - Current time, injected for testability.
 */
export function computeHealth(
  syncRows: SyncStateRow[],
  now: Date,
): HealthPayload
```

**`computeHealth` logic:**

1. Find the `worker` row. Extract `last_success_at` as `workerLastLoopAt`.
2. For each source (`notion`, `drive`):
   - Find its row (may be absent if DB is empty).
   - Set `implemented` to `IMPLEMENTED_SOURCES.includes(source)` — **from the constant, not from data**.
   - Populate `lastSuccessAt`, `lastError`, `lastErrorAt`, `seeded` from the row (or defaults if absent).
3. Compute `ok`:
   - `false` if `syncRows` is empty (no DB).
   - For each source where `implemented` is `true`: `false` if `lastSuccessAt` is `null` or older than 30 minutes from `now`. An implemented source that has **never** succeeded means `ok: false`.
   - If no sources are implemented yet: `ok` is `true` as long as `workerLastLoopAt` is within the last 30 minutes.
   - If `workerLastLoopAt` is `null` or stale (> 30 min): `ok` is `false`.

Then export a `getHealth(db)` function that queries the DB and calls `computeHealth`:

```typescript
export function getHealth(
  db: ReturnType<typeof drizzle> | null,
): HealthPayload {
  if (!db) return computeHealth([], new Date());
  const rows = db.select().from(syncState).all();
  return computeHealth(rows, new Date());
}
```

### 2.6. Worker loop timestamp — Use `sync_state` with `source = 'worker'`

The worker needs to record its last loop time so the health endpoint can report it.

**Approach:** Add a row to `sync_state` with `source = 'worker'` and use `last_success_at` as the last-loop timestamp. This avoids a new table.

In `src/worker/index.ts`, at the start of each loop iteration, update `sync_state` SET `last_success_at = new Date().toISOString()` WHERE `source = 'worker'`. Seed this row alongside `notion` and `drive` at startup (step 3 of §2.4).

In `src/server/queries/health.ts`, read the `worker` row's `last_success_at` as `workerLastLoopAt`.

**This is an architecture change.** Update ARCHITECTURE.md (see §2.10).

### 2.7. `src/app/api/health/route.ts` — CREATE

**Purpose:** Next.js route handler. Returns the health JSON.

```typescript
import { NextResponse } from "next/server";
import { getReaderDb } from "@/server/db/client";
import { getHealth } from "@/server/queries/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getReaderDb();
  const health = getHealth(db);
  return NextResponse.json(health, { status: 200 });
}
```

Key points:
- `getReaderDb()` is called here (lazily, at request time), not at module top level.
- If `getReaderDb()` returns `null` (no DB file), `getHealth(null)` returns a degraded payload with `ok: false`. No crash.
- Because `getReaderDb()` does **not** cache `null`, starting the worker later (which creates the DB) will make the next request succeed — no web restart needed.
- `pnpm build` will succeed because no DB connection is opened during the build.

### 2.8. `package.json` — MODIFY

**Purpose:** Add the `worker` script.

Add to `"scripts"`:

```json
"worker": "tsx src/worker/index.ts"
```

This matches ARCHITECTURE.md (`tsx` to run the worker in production) and the docker-compose convention (`pnpm worker`).

### 2.9. `tests/health.test.ts` — CREATE

**Purpose:** Unit tests for the pure `computeHealth` function.

Import `computeHealth` and `IMPLEMENTED_SOURCES` from `@/server/queries/health`. The tests must work with the Phase 1 value of `IMPLEMENTED_SOURCES` (empty array). Tests 4–8 simulate future phases by temporarily overriding the constant or by passing rows that the function would evaluate against a locally-scoped version — **pick whichever approach keeps tests simple and non-brittle**. The recommended approach: make `computeHealth` accept `implementedSources` as a parameter (with a default of `IMPLEMENTED_SOURCES`), so tests can inject different values without mutation.

**Helper:** Create a factory function for `SyncStateRow` with sensible defaults to reduce boilerplate:

```typescript
function makeRow(overrides: Partial<SyncStateRow> & { source: string }): SyncStateRow {
  return {
    cursor: null,
    seeded: 0,
    lastSuccessAt: null,
    lastError: null,
    lastErrorAt: null,
    ...overrides,
  };
}
```

(Use the actual Drizzle-inferred field names — camelCase — from `syncState.$inferSelect`.)

**Test cases (10 total):**

1. **No DB (empty rows):** `computeHealth([], now)` → `ok: false`, both sources `implemented: false`, `worker.lastLoopAt: null`.

2. **Worker running, no sources implemented:** Rows for `notion`, `drive`, `worker`. `notion` and `drive` have `lastSuccessAt = null`. `worker` has `lastSuccessAt` = 2 minutes ago. `implementedSources = []`. → `ok: true`.

3. **Worker stale (> 30 min):** Same as above but `worker.lastSuccessAt` is 35 minutes ago. → `ok: false`.

4. **One source implemented and fresh:** `implementedSources = ['notion']`. `notion` has `lastSuccessAt` = 5 minutes ago. `drive` has `lastSuccessAt = null`. Worker is fresh. → `ok: true`, `notion.implemented: true`, `drive.implemented: false`.

5. **One source implemented but stale (> 30 min):** `implementedSources = ['notion']`. `notion` has `lastSuccessAt` = 40 minutes ago. → `ok: false`.

6. **Both sources implemented and fresh:** `implementedSources = ['notion', 'drive']`. Both have `lastSuccessAt` within 30 min. → `ok: true`.

7. **Source with error but recent success:** `implementedSources = ['notion']`. `notion` has `lastSuccessAt` = 5 min ago, `lastError` = "timeout", `lastErrorAt` = 3 min ago. → `ok: true`, but `lastError` and `lastErrorAt` are populated.

8. **Source with error and stale success:** `implementedSources = ['notion']`. `notion` has `lastSuccessAt` = 40 min ago and `lastError`. → `ok: false`.

9. **Implemented source with no success ever:** `implementedSources = ['notion']`. `notion` row exists but `lastSuccessAt = null`. Worker is fresh. → `ok: false`. (An implemented source that has never succeeded is a failure.)

10. **Implemented source with only errors, no success:** `implementedSources = ['notion']`. `notion` row has `lastSuccessAt = null`, `lastError = "auth failed"`, `lastErrorAt` = 2 min ago. Worker is fresh. → `ok: false`.

These tests import only `computeHealth` — no database involved. Pure logic, fast.

### 2.10. `ARCHITECTURE.md` — MODIFY

**Purpose:** Document the `worker` row in `sync_state` and the `/api/health` response shape. These are architecture changes introduced in Phase 1.

**Changes:**

1. **Database schema → `sync_state`:** Change the `source` description from `'notion' | 'drive'` to `'notion' | 'drive' | 'worker'`. Add a note: "The `worker` row stores the heartbeat timestamp in `last_success_at`; other fields are unused for it."

2. **Database schema → `notion_tasks`:** Change `department_id` from implied not-null to nullable.

3. **Web → `/api/health`:** Replace the current one-line description with the full payload shape:

```
`/api/health`: sync and worker status. Always returns HTTP 200; the "ok" field carries the status.
  Response: `{ ok, sources: { notion: SourceHealth, drive: SourceHealth }, worker: { lastLoopAt }, checkedAt }`.
  `SourceHealth`: `{ lastSuccessAt, lastError, lastErrorAt, seeded, implemented }`.
  `implemented` is set by a code constant (`IMPLEMENTED_SOURCES` in `src/server/queries/health.ts`), not inferred from data.
  `ok` is `false` if: the DB does not exist, any implemented source has no success within 30 minutes, or the worker heartbeat is stale.
  The container healthcheck only needs HTTP 200 (web process alive); the UI reads "ok".
```

### 2.11. `.gitignore` — VERIFY

Confirm that:
- `data/` is in `.gitignore` so the SQLite file is never committed.
- `src/server/db/migrations/` is **not** gitignored (the migration SQL and `meta/_journal.json` must be committed).

### 2.12. Summary table

| File | Action | Extends |
|------|--------|---------|
| `src/server/db/schema.ts` | Modify | Existing placeholder |
| `src/server/db/client.ts` | Create | New module |
| `src/server/db/migrations/` | Generate | Via `drizzle-kit generate` |
| `src/worker/index.ts` | Create | New module |
| `src/server/queries/health.ts` | Create | New module |
| `src/app/api/health/route.ts` | Create | Next.js App Router |
| `package.json` | Modify | Add `worker` script |
| `tests/health.test.ts` | Create | Vitest test suite |
| `ARCHITECTURE.md` | Modify | `sync_state` worker row, `notion_tasks.department_id` nullable, `/api/health` payload |
| `.gitignore` | Verify | — |
| `HANDOFF.md` | Rewrite | End of phase |

---

## 3. Implementation Order

Execute these steps in order. Each step should compile (`pnpm typecheck`) before moving on.

### Step 1: ARCHITECTURE.md Updates

1. Update ARCHITECTURE.md per §2.10 (worker row, nullable department_id, health payload shape).
2. This is done first so the schema implementation follows the documented architecture.

### Step 2: Schema

1. Open `src/server/db/schema.ts`.
2. Replace the placeholder comment with the full Drizzle table definitions per §2.1.
3. Run `pnpm typecheck` — must pass.

### Step 3: Generate Migrations

1. Run:
   ```bash
   pnpm drizzle-kit generate
   ```
2. Verify a migration file was created under `src/server/db/migrations/`.
3. Inspect the SQL — all five `CREATE TABLE` statements must be present.
4. Verify `src/server/db/migrations/meta/_journal.json` exists.
5. Verify `.gitignore` does not exclude the migrations directory or its `meta/` subfolder.
6. `git add src/server/db/migrations/` — the migration SQL and journal must be tracked.

### Step 4: DB Client

1. Create `src/server/db/client.ts` per §2.2.
2. `migrate()` must use an explicit `migrationsFolder: path.join(process.cwd(), "src/server/db/migrations")`.
3. `getReaderDb()` must **not** cache `null`. Only a successfully opened connection is cached.
4. Run `pnpm typecheck` — must pass.

### Step 5: Health Query

1. Create `src/server/queries/health.ts` per §2.5.
2. Define `IMPLEMENTED_SOURCES` as an empty array for Phase 1.
3. `computeHealth` must accept `syncRows` typed as `SyncStateRow[]` (i.e., `typeof syncState.$inferSelect` array), plus `now: Date`, plus an optional `implementedSources` parameter (defaulting to `IMPLEMENTED_SOURCES`).
4. Export both `computeHealth` (pure) and `getHealth` (DB-backed).
5. Run `pnpm typecheck` — must pass.

### Step 6: Health API Route

1. Create `src/app/api/health/route.ts` per §2.7.
2. Run `pnpm typecheck` — must pass.
3. Run `pnpm build` — **must pass without a database file on disk**. This is a critical check. If it fails, the DB access is not lazy enough; fix `client.ts`.

### Step 7: Worker Entry Point

1. Create `src/worker/index.ts` per §2.4 and §2.6 (worker row seeding + loop timestamp).
2. No collector calls — the loop only heartbeats and logs.
3. Run `pnpm typecheck` — must pass.

### Step 8: Package.json Worker Script

1. Add `"worker": "tsx src/worker/index.ts"` to `package.json` → `scripts`.
2. Run `pnpm typecheck` — must pass.

### Step 9: Unit Tests

1. Create `tests/health.test.ts` per §2.9.
2. Run `pnpm test` — all tests must pass (existing config tests + new 10 health tests).

### Step 10: Verify `.gitignore`

1. Confirm `data/` is in `.gitignore`. If not, add it.
2. Confirm `src/server/db/migrations/` is **not** gitignored. If it is, fix.

### Step 11: Full Quality Gate

Run all four checks:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

All must pass. Fix any issues before proceeding.

### Step 12: Integration Smoke Test

1. Delete `data/app.db` if it exists.
2. Start the dev server **without** a worker running:
   ```bash
   DATABASE_PATH=./data/app.db pnpm dev
   ```
3. Curl the health endpoint:
   ```bash
   curl -s http://localhost:3000/api/health | jq .
   ```
4. Verify: `ok: false`, `worker.lastLoopAt: null`, both sources `implemented: false`, no crash.
5. **Without restarting the dev server**, start the worker in another terminal:
   ```bash
   DATABASE_PATH=./data/app.db CONFIG_PATH=config/project.example.yaml pnpm worker
   ```
6. Wait for at least one loop iteration (watch for `sync_loop_tick` in stdout).
7. Curl the health endpoint again:
   ```bash
   curl -s http://localhost:3000/api/health | jq .
   ```
8. Verify the response matches:
   ```json
   {
     "ok": true,
     "sources": {
       "notion": {
         "lastSuccessAt": null,
         "lastError": null,
         "lastErrorAt": null,
         "seeded": false,
         "implemented": false
       },
       "drive": {
         "lastSuccessAt": null,
         "lastError": null,
         "lastErrorAt": null,
         "seeded": false,
         "implemented": false
       }
     },
     "worker": {
       "lastLoopAt": "<recent ISO timestamp>"
     },
     "checkedAt": "<current ISO timestamp>"
   }
   ```
   This proves `getReaderDb()` did not cache `null` — it picked up the newly-created DB without a web restart.

### Step 13: Build Without DB

1. Delete `data/app.db` if it exists.
2. Unset `DATABASE_PATH` (or just don't have a `.env` file).
3. Run:
   ```bash
   pnpm build
   ```
4. Must succeed. This confirms the web process never opens the DB at import/build time.

### Step 14: Update HANDOFF.md

Rewrite `HANDOFF.md` to reflect the new state per AGENTS.md documentation rules.

---

## 4. Key Design Decisions (for the implementer)

### 4.1. Lazy DB access, null not cached

The `getReaderDb()` and `getWriterDb()` functions must **not** be called at module top level. They are called:
- `getWriterDb()` — once, inside `main()` in `src/worker/index.ts`.
- `getReaderDb()` — inside the `GET` handler of `src/app/api/health/route.ts` (and future query endpoints).

`getReaderDb()` caches a successfully opened connection but **never caches `null`**. This means the web process can start before the worker creates the DB, and once the worker has created it, the very next request picks it up without a restart.

This ensures `pnpm build` (which statically analyzes and tree-shakes Next.js routes) never triggers a DB connection.

### 4.2. Read-only enforcement

`getReaderDb()` opens `better-sqlite3` with `{ readonly: true }`. Any accidental write attempt from the web process will throw a SQLite error. This is the code-level enforcement of AGENTS.md's "only the worker writes" rule.

### 4.3. Explicit `IMPLEMENTED_SOURCES` constant

Whether a source is "implemented" is determined by a code constant `IMPLEMENTED_SOURCES` in `src/server/queries/health.ts`, **not** inferred from data (like `last_success_at` being non-null or `seeded` being true). This is clearer and prevents edge cases where a source that errored on its first run would incorrectly appear as "not implemented".

- Phase 1: `IMPLEMENTED_SOURCES = []`
- Phase 2: add `'notion'`
- Phase 4: add `'drive'`

An implemented source that has **never** succeeded (i.e., `lastSuccessAt` is null) makes `ok: false`. This prevents false confidence when a collector is deployed but broken.

### 4.4. No collectors in Phase 1

There is no `src/worker/collectors.ts` file. The worker loop in Phase 1 only records its heartbeat and sleeps. Collector calls are added directly in `src/worker/index.ts` when the collector modules are built:
- Phase 2: import and call `syncNotion()` from `src/server/integrations/notion/collector.ts`.
- Phase 4: import and call `syncDrive()` from `src/server/integrations/drive/collector.ts`.

### 4.5. Worker loop timestamp

The worker updates `sync_state` WHERE `source = 'worker'` at each loop iteration. This gives the health endpoint a "last heartbeat" signal without adding a new table.

### 4.6. WAL mode and busy timeout

Both are set via PRAGMA statements immediately after opening the connection:
- **WAL mode** allows the web process to read while the worker writes. Essential for concurrent access.
- **Busy timeout (5000ms)** prevents "database is locked" errors during brief write contention. Set on both the writer and reader connections.

### 4.7. Migrations run on worker start only

Only `getWriterDb()` runs `migrate()`. The reader never runs migrations (it can't — it's read-only). This means the worker must start before the web process can serve meaningful data. This is acceptable: the web's health endpoint gracefully handles "no DB yet" by returning `ok: false`.

The `migrationsFolder` is passed explicitly to `migrate()`, resolved via `path.join(process.cwd(), "src/server/db/migrations")`. The `migrations/meta/_journal.json` file is committed to git — Drizzle needs it at runtime.

### 4.8. `computeHealth` uses Drizzle-inferred types

The `syncRows` parameter of `computeHealth` is typed as `(typeof syncState.$inferSelect)[]`, not a hand-written interface. This keeps the function in sync with schema changes automatically.

---

## 5. "Done When" Checklist

Each item must be independently verified. The implementer must confirm every line.

| # | Criterion | How to verify |
|---|-----------|---------------|
| 1 | `pnpm typecheck` passes | Run `pnpm typecheck`. Exit code 0. |
| 2 | `pnpm lint` passes | Run `pnpm lint`. Exit code 0. |
| 3 | `pnpm test` passes (including 10 new health tests) | Run `pnpm test`. All tests green. |
| 4 | `pnpm build` passes **without a database file on disk** | Delete `data/app.db`, unset `DATABASE_PATH`, run `pnpm build`. Exit code 0. |
| 5 | Schema has all 5 tables from ARCHITECTURE.md | Inspect `src/server/db/schema.ts`. All tables present with correct columns. `notion_tasks.department_id` is nullable. |
| 6 | Drizzle migration exists and is valid SQL | Inspect `src/server/db/migrations/`. SQL file contains 5 `CREATE TABLE` statements. `meta/_journal.json` exists and is committed. |
| 7 | Worker starts, applies migrations, enables WAL | Run `pnpm worker` with env vars. Check `data/app.db` exists. Run `sqlite3 data/app.db "PRAGMA journal_mode"` → outputs `wal`. |
| 8 | Worker loops and logs JSON | Run `pnpm worker`. Stdout shows `sync_loop_tick` JSON lines. |
| 9 | `/api/health` returns timestamps when worker is running | Start worker + dev server. `curl localhost:3000/api/health`. Response has `worker.lastLoopAt` set and `ok: true`. |
| 10 | `/api/health` returns `ok: false` when DB doesn't exist | Start dev server without worker or DB file. Curl → `ok: false`, no crash. |
| 11 | Web picks up new DB without restart | Start dev server (no DB → `ok: false`). Then start worker (creates DB). Curl again → `ok: true`. No web restart. |
| 12 | `/api/health` shows sources as `implemented: false` | Curl while worker runs. Both `notion` and `drive` have `"implemented": false` and `"lastSuccessAt": null`. |
| 13 | `package.json` has `"worker"` script | Inspect `package.json`. `"worker": "tsx src/worker/index.ts"` exists. |
| 14 | Web DB client is read-only | Inspect `src/server/db/client.ts`. `getReaderDb()` opens with `{ readonly: true }`. |
| 15 | No DB access at module import time | Inspect all source files. No top-level calls to `getReaderDb()`, `getWriterDb()`, or `new Database()`. |
| 16 | `IMPLEMENTED_SOURCES` is an explicit constant, empty in Phase 1 | Inspect `src/server/queries/health.ts`. Constant exists, is `[]`. `implemented` is set from this constant, not from data. |
| 17 | Health tests cover all 10 scenarios from §2.9 | Inspect `tests/health.test.ts`. All 10 test cases present and passing. |
| 18 | `data/` is in `.gitignore` | Run `grep "data/" .gitignore`. Match found. |
| 19 | `migrations/meta/_journal.json` is tracked | Run `git ls-files src/server/db/migrations/meta/_journal.json`. Output is non-empty. |
| 20 | ARCHITECTURE.md updated | Inspect ARCHITECTURE.md. `sync_state` shows `worker` row, `notion_tasks.department_id` is nullable, `/api/health` payload is documented. |
| 21 | `HANDOFF.md` updated | Inspect `HANDOFF.md`. Current state reflects Phase 1 completion. |
| 22 | No `src/worker/collectors.ts` exists | `ls src/worker/collectors.ts` → file not found. |

---

## 6. Files NOT Created in This Phase

These are listed to prevent scope creep:

- `src/worker/collectors.ts` — not needed; collectors live in `src/server/integrations/`
- `src/server/integrations/notion/client.ts` — Phase 2
- `src/server/integrations/notion/collector.ts` — Phase 2
- `src/server/integrations/drive/client.ts` — Phase 4
- `src/server/integrations/drive/collector.ts` — Phase 4
- `src/server/integrations/drive/folders.ts` — Phase 4
- `src/server/events/normalize.ts` — Phase 2
- `src/server/events/types.ts` — Phase 2
- `src/server/domain/` — Phase 3
- `src/server/queries/dashboard.ts` — Phase 3
- `src/server/queries/activity.ts` — Phase 6
- `src/server/queries/department.ts` — Phase 6
- `scripts/smoke-notion.ts` — Phase 2
- `scripts/smoke-drive.ts` — Phase 4
- `Dockerfile` — Phase 5
- `docker-compose.yml` — Phase 5
- Any UI components — Phase 3
