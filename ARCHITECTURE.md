# ARCHITECTURE.md

How the BUMIN-2 tracking dashboard works. Update this file when architecture, schema or event types change.

## Overview

```
Notion (tasks) ────┐                                   ┌── web: Next.js (read-only)
                   │   worker (every 5 min)            │     src/server/queries → pages
                   ├─> collectors → snapshots ─────────┤
Google Drive ──────┘            → raw_events           │
 (docs, read-only)              → normalizer ──> SQLite (WAL, /data/app.db)
                                → project_events
```

Two processes, one codebase, one Docker image:

- `worker` is the only writer. It pulls from Notion and Drive, stores snapshots, and turns raw changes into semantic project events.
- `web` renders the dashboard by reading SQLite through the query layer. It never calls Notion or Drive.

Polling every few minutes is deliberate. No webhooks, no queues: one user, low change volume.

## Stack

- Node.js 24 LTS, pnpm
- Next.js (current stable), App Router, React Server Components
- TypeScript, `strict: true`
- Tailwind CSS v4 + shadcn/ui (lucide icons)
- Drizzle ORM + `better-sqlite3`, WAL mode
- `zod` for config and env validation, `yaml` for parsing config
- `googleapis` (Drive v3), `@notionhq/client`
- `tsx` to run the worker in production
- Vitest, ESLint

## Directory layout

```
config/
  project.yaml              # project-specific values, no secrets
  project.example.yaml
src/
  app/                      # Next.js routes, read-only UI
    page.tsx                # dashboard
    aktivite/page.tsx       # full activity feed
    departman/[id]/page.tsx # one department
    api/health/route.ts     # sync status JSON
  components/
    ui/                     # shadcn primitives (generated)
    dashboard/              # deadline-strip, next-action, counts, annunciator, event-feed, sync-status
  server/
    config.ts               # loads and validates config/project.yaml and env
    db/
      schema.ts
      client.ts
      migrations/
    integrations/
      notion/client.ts, collector.ts
      drive/client.ts, collector.ts, folders.ts
    events/
      types.ts
      normalize.ts
    domain/                 # pure functions, fully unit tested
      department-status.ts
      next-action.ts
      progress.ts
    queries/                # the only DB access used by the web app
      dashboard.ts
      activity.ts
      department.ts
  worker/
    index.ts                # sync loop
scripts/
  smoke-notion.ts           # prints a few real tasks, proves access
  smoke-drive.ts            # prints a few real files, proves access
tests/
  fixtures/
```

## Configuration

`config/project.yaml`, validated with zod at startup of both processes. Invalid config fails fast with a readable error.

```yaml
project:
  name: BUMIN-2
  deadline: 2026-12-31
  deliverable: "2 uçan prototip"
  timezone: Europe/Istanbul
  stale_days: 3

notion:
  tasks_data_source_id: "..."
  row_filter:                  # optional query filter passed on every page
    property: "Grup"
    equals: "Görev"
  properties:
    title: "Name"
    status: "Durum"            # Notion status or select property
    department: "Departman"    # select, values match departments[].notion_value
    due: "Tarih"               # optional, date
    blocked: "Tıkalı"          # optional, checkbox
    blocker_note: "Engel"      # optional, text; stored only while blocked
    milestone: "Milestone"     # optional, select
    next: "Sıradaki"           # optional, checkbox that pins the next action
    priority: "Öncelik"        # optional, select (P0-Kritik … P3-Sonra)
    order: "Sıra"              # optional, number
  blocked_statuses:            # optional; status values that mark a task as blocked
    - "BLOKE"
  status_groups:               # required if status is select; optional override if status is status
    todo: ["BAŞLANMADI", "HAZIR"]
    active: ["AKTİF", "BLOKE", "DOĞRULAMAYA HAZIR"]
    done: ["DOĞRULANDI", "KAPALI"]

drive:
  root_folder_id: "..."

departments:
  - id: "00"
    name: "Koordinasyon"
    notion_value: "00 Koordinasyon"
    drive_folder_id: "..."

doc_types:                     # case-insensitive regular expressions tested against file name; first match wins in config order; otherwise "other"
  test: ["^NCR-", "^OI-"]
  report: ["^HO-", "^CHG-", "^RB-", "^REQUIREMENTS_"]
  decision: ["^WP-.*_DECISION"]

milestones:                    # ordered
  - id: m1
    name: "..."
    due: 2026-10-31
    notion_value: "M1"         # optional, matches notion.properties.milestone
```

Environment:

```
DATABASE_PATH=/data/app.db
CONFIG_PATH=/app/config/project.yaml
SYNC_INTERVAL_SECONDS=300
NOTION_TOKEN=
GOOGLE_SERVICE_ACCOUNT_JSON_BASE64=
TZ=Europe/Istanbul
```

## Database schema

`sync_state`
- `source` PK (`notion` | `drive` | `worker`), `cursor` (ISO time, used by Drive; Notion does not use a cursor), `seeded` (bool), `last_success_at`, `last_error`, `last_error_at`
  The `worker` row stores the heartbeat timestamp in `last_success_at`; other fields are unused for it.

`notion_tasks` (snapshot)
- `page_id` PK, `title`, `status`, `status_group` (`todo` | `active` | `done`), `department_id` (nullable), `milestone_id`, `due_date`, `blocked` (bool), `blocker_note`, `is_next` (bool), `priority_rank` (integer, nullable), `sort_order` (real, nullable), `url`, `archived` (bool), `last_edited_time`

`drive_files` (snapshot, folders included)
- `file_id` PK, `name`, `mime_type`, `is_folder`, `parent_id`, `department_id`, `doc_type`, `created_time`, `modified_time`, `web_view_link`, `trashed` (bool)

`raw_events`
- `id` PK, `source`, `kind`, `external_id`, `payload` (JSON: before/after), `occurred_at`, `ingested_at`, `processed` (bool)
- unique (`source`, `external_id`, `kind`, `occurred_at`) for idempotency

`project_events`
- `id` PK, `type` (closed list below), `department_id`, `subject_title`, `detail` (nullable), `doc_type` (nullable), `source`, `source_id`, `url`, `occurred_at`, `raw_event_id`

Department status, next action and progress are computed at query time, never stored.

## Worker loop

```
on start: run migrations, then loop:
  syncNotion()        # each step catches its own errors and records them in sync_state
  syncDrive()
  normalizePending()
  sleep SYNC_INTERVAL_SECONDS
```

Log one JSON line per step with duration, counts and errors.

## Notion sync

- Every sync does a full fetch (no cursor filter). The database is small (a few hundred pages); the query endpoint does not return trashed pages, so full fetch is needed to detect deletions.
- If `config.notion.row_filter` is configured, `{ property, select: { equals } }` is passed as query filter on every page of the fetch. A row that leaves the filter is no longer returned and gets archived (`archived = 1`, no event) by the complete-fetch archival rule.
- At the start of each sync, retrieve the data source schema with `dataSources.retrieve()`. Validate that every property named in `config.notion.properties` exists in the schema with the expected type. Fail with a readable error if not.
- Status property accepts type `"status"` or `"select"`.
  - For `"select"`: `config.notion.status_groups` is required, and every option of the select must appear in exactly one group. An unlisted or duplicated option fails with a readable error naming the option(s) and `config/project.yaml`. A listed value that is not an option only logs a warning.
  - For `"status"`: groups are derived from the status property schema by position: first group → `todo`, second → `active`, third → `done`. If `config.notion.status_groups` is defined, it overrides only the options it lists; an unlisted option falls back to schema group with a warning.
- `mapPage` reads `.select.name` or `.status.name` depending on type. An empty status maps to `"todo"` without a warning.
- `blocked = 1` when the status is in `config.notion.blocked_statuses` or when a configured blocked checkbox is true. Every listed value in `blocked_statuses` must be a valid status option, else a readable error. `blockerNote` is stored only while blocked; otherwise null.
- `priority_rank` stores the 0-based index of the option in schema select options. `sort_order` stores the numeric order. `diffTask` treats priority/order updates as changes (snapshot update, no event).
- Map properties through `config.notion.properties`. Compare each page with its snapshot. Only an actual field change produces a raw event.
- Raw event kinds encode the new value (e.g. `status:active`, `blocked:true`) so the unique constraint cannot swallow a second change within the same minute.
- First full sync is a seed: fill snapshots, set `seeded`, emit no semantic events.
- After a complete, successful fetch, mark snapshots whose `page_id` was not returned as `archived = 1` (no event). Never mark anything archived after a partial or failed fetch.

## Drive sync

- Auth with a Google service account, scope `drive.readonly`. The owner shares the BUMIN root folder with the service account email as Viewer, so the account sees only project files.
- Seed: crawl from `root_folder_id` recursively (`'<id>' in parents and trashed = false`), store files and folders, resolve each file's department by its nearest ancestor listed in `departments[].drive_folder_id`. No semantic events during seed.
- Incremental: `files.list` with `modifiedTime > cursor minus 2 minutes`, `supportsAllDrives` and `includeItemsFromAllDrives` on. Resolve unknown parents with `files.get` and cache them. Ignore anything whose ancestor chain does not reach `root_folder_id`.
- New file → `DOC_CREATED`. Known file with a newer `modifiedTime` → `DOC_UPDATED`.
- Coalescing: if the same file already has a `DOC_CREATED` or `DOC_UPDATED` within the last 30 minutes, move that event's `occurred_at` forward instead of inserting a new one. Ten saves in a row must show up as one line.
- Folders never produce events. Trashed files: set `trashed`, no event.
- `doc_type` from `config.doc_types`: case-insensitive regular expressions tested against the file name; first match wins in config order, else `other`.
- Phase 4 must start by running `scripts/smoke-drive.ts` to prove that files inside the shared folder are listed for the service account. Fallback if not: an OAuth refresh token for the owner's account with the same read-only scope.

## Normalizer

Pure function from raw events (plus snapshot context) to project events. Stores structured fields only; the UI composes Turkish sentences (see `DESIGN.md` → Copy).

| Raw change | Semantic event |
|---|---|
| task status group `todo` → `active`, or `done` → `active` | `TASK_STARTED` |
| task status group any → `done` | `TASK_COMPLETED` |
| task `blocked` false → true | `TASK_BLOCKED` (detail = blocker note) |
| task `blocked` true → false | `TASK_UNBLOCKED` |
| new task created directly in `active` / `done` | `TASK_STARTED` / `TASK_COMPLETED` |
| new Drive file under root | `DOC_CREATED` |
| Drive file modified | `DOC_UPDATED` (coalesced) |

## Derived logic (`src/server/domain`)

Pure functions, fully unit-tested with fixture data. Never imported by UI code directly; pages read through `src/server/queries/`.

### Department status

Departments are the 17 work packages (WP-00 … WP-16). Status is computed per-department from `notion_tasks` where `archived = 0`, in priority order:

1. `blocked`: at least one non-done task with `blocked = true`
2. `stale`: has `active` tasks and no activity in `stale_days`. Latest activity is `max(latest_event_at, max_last_edited_time)` among the department's non-archived tasks.
3. `active`: has at least one `active` (non-blocked) task
4. `waiting`: some tasks are `done`, the rest are `todo` (none `active`)
5. `not_started`: all tasks are `todo` (none `done`, none `active`)
6. `done`: all tasks are `done`
7. `idle`: no tasks at all for this department

The type is: `'blocked' | 'stale' | 'active' | 'waiting' | 'not_started' | 'done' | 'idle'`

Annunciator visibility:
- **Loud tiles** (shown individually): `blocked` (warning), `stale` (caution), `active` (neutral with go dot)
- **Quiet summary** (collapsed into one muted line): `waiting`, `not_started`, `done`, `idle`
  Format: `"{n} WP başlamadı · {k} WP beklemede · {m} tamamlandı"` (omit a segment if its count is zero; omit the entire line if all WPs are loud)

### Next action

1. The non-archived, non-done task with `is_next = 1` (first found)
2. Else the non-blocked `active` task ordered by: `priority_rank` ASC (nulls last), `sort_order` ASC (nulls last), `due_date` ASC (nulls last)
3. Else the `todo` task with the same ordering
4. Else none → empty state

### Progress

- Days left = `project.deadline` minus today in `project.timezone`.
- No milestones: progress = done / total non-archived tasks.
- Format: `"{done} / {total} görev tamamlandı · %{percent}"`

### Counts

- **Tıkalı**: count of non-archived, non-done tasks with `blocked = 1`
- **Devam**: count of non-archived tasks with `status_group = 'active'` and `blocked = 0`
- **Bu hafta biten**: count of `TASK_COMPLETED` events since Monday 00:00 `Europe/Istanbul`

## Web

- All pages `dynamic = "force-dynamic"`. SQLite reads are cheap; no caching layer.
- `/` dashboard: deadline strip, next action with counts, annunciator panel, last 48 hours (max 5 rows), sync status.
- `/aktivite`: all events grouped by day, `?departman=` filter.
- `/departman/[id]`: blocked tasks, active tasks, recent documents, events. Rows link out to Notion or Drive.
- `/api/health`: sync and worker status. Always returns HTTP 200; the `ok` field carries the status.
  Response: `{ ok, sources: { notion: SourceHealth, drive: SourceHealth }, worker: { lastLoopAt }, checkedAt }`.
  `SourceHealth`: `{ lastSuccessAt, lastError, lastErrorAt, seeded, implemented }`.
  `implemented` is set by a code constant (`IMPLEMENTED_SOURCES` in `src/server/queries/health.ts`), not inferred from data.
  `ok` is `false` if: the DB does not exist, any implemented source has no success within 30 minutes, or the worker heartbeat is stale.
  The container healthcheck only needs HTTP 200 (web process alive); the UI reads "ok".

## Deployment

- `Dockerfile` on `node:24-bookworm-slim` (glibc, multi-arch; runs on the Raspberry Pi 5). Do not use Alpine: `better-sqlite3` is native.
- `docker-compose.yml`: `web` (`pnpm start`, port 3000, healthcheck on `/api/health`), `worker` (`pnpm worker`), shared volume `data:/data`.
- Coolify: Docker Compose resource, domain `bumin.akadir.tech` on `web` only.
- Cloudflare Access application on that hostname, allow only the owner's email.
- If building on the Pi runs out of memory, build an arm64 image in GitHub Actions and pull it from GHCR. Do not set this up preemptively.
- The database needs no backup: deleting it and letting the worker reseed restores everything except past event history.

## Build phases

Each phase ends with the quality gate from `AGENTS.md` and an updated `HANDOFF.md`.

0. Scaffold: Next.js, TypeScript strict, Tailwind, shadcn, Drizzle, Vitest, ESLint, config loader with tests against `project.example.yaml`.
   Done when: all checks pass on the empty app and an invalid config produces a readable error.
1. Database and worker skeleton: schema, migrations, sync loop with `sync_state`, `/api/health`.
   Done when: the worker runs locally and `/api/health` shows timestamps.
2. Notion pipeline: client, collector, seed, snapshot diff, normalizer for task events, fixture tests, `smoke-notion.ts`.
   Done when: changing a real task's status in Notion creates the right project event within one interval.
3. Dashboard v1 on Notion data: all four panels and sync status, per `DESIGN.md`.
   Done when: the review checklist passes on screenshots with real data.
4. Drive pipeline: smoke test, seed, incremental sync, department resolution, coalescing, `doc_type`.
   Done when: a file added to a department folder shows up in the feed within one interval, and repeated saves stay one line.
5. Deploy: Dockerfile, compose, Coolify, Cloudflare Access.
   Done when: `bumin.akadir.tech` works from a phone behind Access.
6. Detail pages: `/aktivite` and `/departman/[id]`.

## Known risks

- Notion API versioning (databases vs data sources): verify endpoints via Context7 before Phase 2.
- Service account visibility of files inside a shared folder: verified by the Phase 4 smoke test, OAuth fallback documented above.
- Notion edit times are minute-precision: handled by the overlap window plus snapshot comparison.
