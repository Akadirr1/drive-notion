# Current state

The Notion pipeline has been adapted to the real BUMIN Kanban schema on branch `feat/notion-real-schema`. Schema validation supports both `status` and `select` status types with group exhaustiveness validation, `notion.blocked_statuses`, query-level `notion.row_filter`, `priority_rank` and `sort_order` mapping, regex-based `doc_types` validation, and Drizzle migration `0001_bumpy_mentor.sql`. All 74 tests pass and the full quality gate is green.

## Completed

- **Select status property**: `validateSchema()` accepts `"status"` or `"select"` for `notion.properties.status`. For select, `status_groups` is required and every option must appear in exactly one group (fails with readable error naming unlisted/duplicated options). Unrecognized options in config log a warning. `mapPage()` reads `.select.name` or `.status.name`, mapping empty status to "todo" without warning.
- **Blocked statuses**: added `notion.blocked_statuses`. If a task's status is in this list (or configured blocked checkbox is true), `blocked = 1`; otherwise 0. Every configured value must exist in schema options. `blockerNote` is stored only while blocked; otherwise null.
- **Row filter**: added `notion.row_filter` ({ property, equals }). `validateSchema()` verifies the property exists, is a select, and `equals` is an option. `buildRowFilter()` builds the Notion select filter, passed to `queryDataSource()` on every page in `collector.ts` and `smoke-notion.ts`. A row leaving the filter is archived on complete fetch.
- **Priority and sort order**: added optional `notion.properties.priority` (select) and `notion.properties.order` (number). Added `priority_rank` (integer) and `sort_order` (real) to `notion_tasks` table and generated migration `src/server/db/migrations/0001_bumpy_mentor.sql`. `diffTask()` and `hasTaskChanged()` detect changes without emitting semantic events.
- **Doc types regex validation**: `doc_types` values validated as case-insensitive regular expressions at config load time via Zod `superRefine`.
- **Config & example**: updated Zod schemas in `src/server/config.ts` and updated `config/project.example.yaml` to the real BUMIN Kanban structure.
- **Documentation**: updated `ARCHITECTURE.md` configuration example, schema, Notion sync, next action, and doc_types semantics.
- **Test coverage**: 74 tests passing across 5 test suites (`tests/map-page.test.ts`, `tests/collector.test.ts`, `tests/config.test.ts`, `tests/normalizer.test.ts`, `tests/health.test.ts`).

## In progress

Live checks awaiting real `NOTION_TOKEN` in `.env` and IDs in `config/project.yaml`:
- Smoke script (`pnpm smoke:notion`) verification with live BUMIN Kanban data source.
- First sync is a seed verification on disk (`notion_tasks > 0`, `seeded = 1`, `raw_events = 0`, `project_events = 0`).
- Starting a task: set Durum from `BAŞLANMADI` or `HAZIR` to `AKTİF` → emits `status:active` raw event and creates `TASK_STARTED` project event.
- Blocking a task: set Durum to `BLOKE` (no checkbox) → emits `blocked:true` raw event and creates `TASK_BLOCKED` project event with blocker note.
- Row filter verification: rows with `Grup = Görev` are ingested; non-task rows (Work Package, Gate) are filtered out; a task whose `Grup` is changed gets marked `archived = 1`.
- `/api/health` returns `sources.notion.implemented = true` and `ok = true`.
- Unknown department stores `department_id = NULL` and logs warning.
- Missing/wrong property records readable error in `sync_state.last_error`.
- Trashed task in Notion marked `archived = 1` with no event emitted.

## Known issues

- None.

## Next recommended step

1. Fill real IDs in `config/project.yaml` and set `NOTION_TOKEN` in `.env`.
2. Run `pnpm smoke:notion` to verify connection with live Notion Kanban data.
3. Run the worker and complete the live checks.
4. Proceed to Phase 3: Dashboard UI foundation.

## Important context

- "Durum" in the real BUMIN database is a `select` property (BAŞLANMADI, HAZIR, AKTİF, BLOKE, DOĞRULAMAYA HAZIR, DOĞRULANDI, KAPALI).
- Tasks are blocked when `Durum = BLOKE`. Blocker note in "Engel" is ignored unless the task is blocked.
- Only rows with `Grup = Görev` are ingested as tasks via `notion.row_filter`.
- Next action ordering sorts by: `is_next` first, then non-blocked active tasks by `priority_rank`, `sort_order`, `dueDate` (nulls last), then todo tasks with the same ordering.
