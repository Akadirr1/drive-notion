# Current state

Phase 2 (Notion pipeline) offline implementation and integration tests are complete on branch `feat/phase-2-notion`. The Notion SDK client, schema validation, status group resolution (with positional schema derivation and config overrides with fallback warnings), pure page mapping and snapshot diffing, semantic event normalizer, transactional event processor, collector, worker integration, health query update, smoke script, and offline test suite are implemented and verified. All quality-gate checks pass.

## Completed

- Pinned `@notionhq/client@5.26.0` in `package.json` with SDK `timeoutMs: 30_000` and automatic retry handling.
- Notion client module in `src/server/integrations/notion/client.ts`: singleton `getNotionClient()`, `queryDataSource()`, `retrieveDataSource()`.
- Pure mapping module in `src/server/integrations/notion/map-page.ts`:
  - `validateSchema()` checks configured properties against data source schema, throwing readable `PropertyConfigError`.
  - `deriveStatusGroups()` derives status groups from schema status options by position (1st → todo, 2nd → active, 3rd → done).
  - `resolveStatusGroup()` (Amendment B) resolves status groups using schema derivation as baseline; config `status_groups` overrides only listed options, and unlisted options fall back to schema group with warning (`notion_status_fallback_to_schema`), never falling silently to "todo".
  - `mapPage()` maps Notion pages into `NotionTaskSnapshot`, joining all text segments, handling missing optional properties, and warning on unknown departments.
- Pure diffing module in `src/server/integrations/notion/diff-task.ts`: `diffTask()` and `buildAfterPayload()` returning raw event descriptors with encoded kinds (`status:active`, `status:done`, `blocked:true`, `blocked:false`).
- Semantic event types in `src/server/events/types.ts` and pure normalizer in `src/server/events/normalize.ts`: maps raw events to `TASK_STARTED`, `TASK_COMPLETED`, `TASK_BLOCKED`, `TASK_UNBLOCKED`.
- Event processor in `src/server/events/process.ts`: `normalizePending()` processes pending raw events into `project_events` transactionally and marks them `processed = 1`.
- Notion collector in `src/server/integrations/notion/collector.ts`: full fetch, seed mode detection, snapshot diff, transactional writes, archival detection on complete fetches, and error recording in `sync_state` without rethrowing.
- Worker loop in `src/worker/index.ts`: wired `syncNotion()` and `normalizePending()`.
- Added `"notion"` to `IMPLEMENTED_SOURCES` in `src/server/queries/health.ts` and updated `tests/health.test.ts`.
- Smoke diagnostic script in `scripts/smoke-notion.ts` for testing real Notion API access.
- Updated `ARCHITECTURE.md` § Notion sync for full-fetch model and no-cursor Notion sync.
- Comprehensive test suites:
  - `tests/map-page.test.ts` (22 tests covering schema validation, status derivation, config overrides with fallback warning, page mapping, diffTask).
  - `tests/normalizer.test.ts` (12 tests covering all normalizer rows, new task creation, blocked changes, unassigned departments, error handling).
  - `tests/collector.test.ts` (Amendment A: 5 offline integration tests with in-memory SQLite and mocked client covering seed, status change + normalize, archival, query error resilience, unchanged no-op).
  - `tests/health.test.ts` (12 tests covering Phase 2 health computation with notion source).
- Full quality gate passes: `pnpm typecheck`, `pnpm lint`, `pnpm test` (54 tests passing), `pnpm build`.

## In progress

Live checks (8.7–8.14) awaiting real `NOTION_TOKEN` in `.env` and `config/project.yaml`:
- 8.7 Smoke script (`pnpm smoke:notion`) verification with live data.
- 8.8 First sync is a seed verification on disk (`notion_tasks > 0`, `seeded = 1`, `raw_events = 0`, `project_events = 0`).
- 8.9 Status change in Notion creates `TASK_STARTED` event.
- 8.10 Check "Tıkalı" on task creates `TASK_BLOCKED` event with blocker note.
- 8.11 `/api/health` returns `sources.notion.implemented = true` and `ok = true`.
- 8.12 Unknown department stores `department_id = NULL` and logs warning.
- 8.13 Missing/wrong property records readable error in `sync_state.last_error`.
- 8.14 Trashed task in Notion marked `archived = 1` with no event emitted.

## Known issues

- None.

## Next recommended step

1. Fill `config/project.yaml` and set `NOTION_TOKEN` in `.env`.
2. Run `pnpm smoke:notion` and complete live checks 8.7–8.14.
3. Proceed to Phase 3: Dashboard UI foundation.

## Important context

- `@notionhq/client` version 5.26.0 has native `client.dataSources.query` and `client.dataSources.retrieve`.
- Notion sync performs a full fetch every cycle to detect trashed/deleted pages that the query endpoint omits. Notion does not use a cursor in `sync_state`.
- Status group resolution derives groups from schema options by position; config overrides apply only to listed options, while unlisted options fall back to schema with a warning.
