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
  properties:
    title: "Name"
    status: "Durum"            # Notion status property
    department: "Departman"    # select, values match departments[].notion_value
    due: "Tarih"               # optional, date
    blocked: "Tıkalı"          # optional, checkbox
    blocker_note: "Neden"      # optional, text
    milestone: "Milestone"     # optional, select
    next: "Sıradaki"           # optional, checkbox that pins the next action
  status_groups:               # optional; if omitted, use the status property's built-in Notion groups
    todo: ["Yapılacak"]
    active: ["Devam ediyor"]
    done: ["Tamamlandı"]

drive:
  root_folder_id: "..."

departments:
  - id: "00"
    name: "Koordinasyon"
    notion_value: "00 Koordinasyon"
    drive_folder_id: "..."

doc_types:                     # first match on lowercased file name wins; otherwise "other"
  test: ["test"]
  report: ["rapor", "report"]
  decision: ["karar"]

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
- `source` PK (`notion` | `drive`), `cursor` (ISO time), `seeded` (bool), `last_success_at`, `last_error`, `last_error_at`

`notion_tasks` (snapshot)
- `page_id` PK, `title`, `status`, `status_group` (`todo` | `active` | `done`), `department_id`, `milestone_id`, `due_date`, `blocked` (bool), `blocker_note`, `is_next` (bool), `url`, `archived` (bool), `last_edited_time`

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

- Query the tasks data source with a `last_edited_time` filter from `cursor` minus 2 minutes (Notion rounds edit times to the minute). Paginate. Check Context7 for the current Notion API version and data source endpoints.
- Map properties through `config.notion.properties`. Resolve `status_group` from config or the status property's built-in groups.
- Compare each page with its snapshot. Only an actual field change produces a raw event, so the overlap window cannot duplicate events.
- First full sync is a seed: fill snapshots, set `seeded`, emit no semantic events. Otherwise the first run would flood the feed.
- Archived pages: set `archived`, no event.
- Advance `cursor` to the max `last_edited_time` seen.

## Drive sync

- Auth with a Google service account, scope `drive.readonly`. The owner shares the BUMIN root folder with the service account email as Viewer, so the account sees only project files.
- Seed: crawl from `root_folder_id` recursively (`'<id>' in parents and trashed = false`), store files and folders, resolve each file's department by its nearest ancestor listed in `departments[].drive_folder_id`. No semantic events during seed.
- Incremental: `files.list` with `modifiedTime > cursor minus 2 minutes`, `supportsAllDrives` and `includeItemsFromAllDrives` on. Resolve unknown parents with `files.get` and cache them. Ignore anything whose ancestor chain does not reach `root_folder_id`.
- New file → `DOC_CREATED`. Known file with a newer `modifiedTime` → `DOC_UPDATED`.
- Coalescing: if the same file already has a `DOC_CREATED` or `DOC_UPDATED` within the last 30 minutes, move that event's `occurred_at` forward instead of inserting a new one. Ten saves in a row must show up as one line.
- Folders never produce events. Trashed files: set `trashed`, no event.
- `doc_type` from `config.doc_types`, first match wins, else `other`.
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

Department status, in priority order:
1. `blocked`: at least one non-done task with `blocked = true`
2. `idle`: no `todo` or `active` tasks
3. `stale`: has active tasks and no project event for the department in `stale_days`
4. `ok`: otherwise

Next action:
1. A non-done task with `is_next = true` (earliest due first)
2. Else the earliest-due `active` task that is not blocked
3. Else the earliest-due `todo` task
4. Else none (empty state)

Progress:
- Days left = `project.deadline` minus today in `project.timezone`.
- Current milestone = first milestone in order that still has non-done tasks. Percent = done / total tasks tagged with it. Without a milestone property: overall done / total.

## Web

- All pages `dynamic = "force-dynamic"`. SQLite reads are cheap; no caching layer.
- `/` dashboard: deadline strip, next action with counts, annunciator panel, last 48 hours (max 5 rows), sync status.
- `/aktivite`: all events grouped by day, `?departman=` filter.
- `/departman/[id]`: blocked tasks, active tasks, recent documents, events. Rows link out to Notion or Drive.
- `/api/health`: `{ notion: { lastSuccessAt, lastError }, drive: {...}, ok }`. Used by the Coolify healthcheck and the UI sync indicator. `ok` is false if any source has no success in 30 minutes.

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
