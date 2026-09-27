# Current state

Phase 1 (Database and worker skeleton) is complete. The SQLite schema, Drizzle migrations, lazy DB clients (read-only for web, read-write for worker), worker sync loop with heartbeat, `/api/health` endpoint, and health unit tests are implemented and verified. All quality-gate checks pass.

## Completed

- Full SQLite schema defined in `src/server/db/schema.ts` for all five tables (`sync_state`, `notion_tasks`, `drive_files`, `raw_events`, `project_events`) with nullable `notion_tasks.department_id` and composite unique constraint on `raw_events`.
- Drizzle migration generated and tracked in git under `src/server/db/migrations/` along with `meta/_journal.json`.
- Database clients in `src/server/db/client.ts`: `getWriterDb()` (read-write, WAL, busy timeout, runs migrations from repo root) and `getReaderDb()` (read-only, busy timeout, returns null if DB file does not exist without caching null). No DB opened at module top level.
- Worker entry point in `src/worker/index.ts`: validates config on start, seeds initial `sync_state` rows (`notion`, `drive`, `worker`), heartbeats via `worker` row in `sync_state`, and loops with JSON logging.
- Added `"worker": "tsx src/worker/index.ts"` to `package.json` scripts.
- Health query module in `src/server/queries/health.ts` with pure `computeHealth` and DB-backed `getHealth`, using explicit `IMPLEMENTED_SOURCES` code constant (empty in Phase 1).
- Route handler in `src/app/api/health/route.ts`: always responds with HTTP 200, carrying status in `ok` field so container healthchecks stay healthy while allowing UI to detect stale data.
- Unit test suite in `tests/health.test.ts` covering all 10 health computation scenarios and verifying empty `IMPLEMENTED_SOURCES`. Total 14 unit tests pass.
- Integration smoke tests verified: dev server returns `ok: false` with HTTP 200 when DB is missing; worker creates DB and enables WAL; dev server picks up DB without restart and returns `ok: true`.
- Verified `pnpm build` succeeds without a DB file on disk.
- Updated `ARCHITECTURE.md` documentation for `sync_state` worker row, nullable `notion_tasks.department_id`, and `/api/health` payload behavior.

## In progress

- Nothing.

## Known issues

- None.

## Next recommended step

Phase 2: Notion pipeline — client, collector, seed, snapshot diff, normalizer for task events, fixture tests, `smoke-notion.ts`.

## Important context

- The owner fills `config/project.yaml` before Phase 2: Notion tasks data source ID and property names, Drive root folder ID, department folder IDs, milestones.
- Before Phase 2: connect the Notion integration to the tasks database with read-content capability only.
- Before Phase 4: share the BUMIN Drive root folder with the Google service account email as Viewer.
- Phase 5: better-sqlite3 may compile from source; the Dockerfile builder stage needs python3, make and g++.
