# Current state

Phase 4 (Google Drive Pipeline Integration) offline implementation is complete on branch `feat/phase-4-drive`. All core logic, Drive client, service account authentication parsing, level-by-level BFS crawl with crawl-first write-after semantics, pure mapping and diff functions, event coalescing with attribute updates, normalizer Drive cases, formatting helpers, stale banner sentence generation, worker loop integration, and offline integration test suites are implemented and verified. All 179 unit and integration tests pass across 14 test suites.

## Completed

- **Dependency**:
  - `@googleapis/drive@26.0.1` installed and verified against API exports (`drive`, `auth`).
- **Configuration (`config/project.example.yaml`, `config/project.yaml`, `src/server/config.ts`)**:
  - Added `silent_mime_prefixes` and `silent_name_patterns` to `driveSchema` with regex validation.
- **Drive client (`src/server/integrations/drive/client.ts`)**:
  - `parseServiceAccount(base64)`: Pure function validating credentials, throwing readable errors naming `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` for missing, non-base64, non-JSON, and missing `client_email` or `private_key`.
  - `getDriveClient()`: Lazy singleton using `drive({ version: 'v3', auth, timeout: 30_000 })` with `@googleapis/drive` default 429/5xx retry handling.
  - `listChildren(folderId, pageToken)`: Thin wrapper querying non-trashed children with page size 1000.
- **Pure functions (`src/server/integrations/drive/map-file.ts`)**:
  - `resolveDepartmentId`: Resolves from nearest ancestor folder matching `departments[].drive_folder_id`, with fallback to `WP-(\d{2})` regex on file name, else null.
  - `resolveDocType`: Matches first matching pattern from `config.doc_types`, else "other" (folders return null).
  - `isSilentFile`: Evaluates silent mime prefixes and filename regexes.
  - `diffFile`: Emits `doc:created` on new file, `doc:updated` on modifiedTime or name change; returns empty array for silent files, folders, unchanged files, and trash restores.
- **Coalescing & Event Processing (`src/server/events/coalesce.ts`, `src/server/events/process.ts`)**:
  - `shouldCoalesce`: Pure helper checking 30-minute window (1,800,000 ms).
  - `normalizePending`: In-place update of `DOC_CREATED` / `DOC_UPDATED` events updating `occurred_at`, `raw_event_id`, `subject_title`, `department_id`, `doc_type`, and `url` from newest raw event.
- **Normalizer (`src/server/events/normalize.ts`)**:
  - Added Drive branches for `doc:created` → `DOC_CREATED` and `doc:updated` → `DOC_UPDATED`.
- **Collector orchestrator (`src/server/integrations/drive/collector.ts`)**:
  - BFS crawl starting from `config.drive.root_folder_id`, skipping shortcuts.
  - Crawl-first, write-after semantics: collects the whole tree in memory; on any error, writes nothing to database except `sync_state.last_error`.
  - Transactional write of snapshots, raw events, trashing missing files (if not seed), and updating `sync_state`.
- **Worker loop (`src/worker/index.ts`)**:
  - Wired `syncDrive` after `syncNotion`, logged as `loop_step { step: "sync_drive", durationMs }`.
- **Formatting & UI (`src/lib/format.ts`, `src/components/dashboard/`)**:
  - `stripExtension`: Strips file extension for feed sentences.
  - `getOldestLastSuccessAt`: Computes oldest non-null success timestamp across implemented sources for `SyncStatus` (never-synced source reported only by banner).
  - `formatStaleMessage`: Generates one sentence per failing implemented source joined by space (no combined "Notion ve Drive" forms).
- **Health query (`src/server/queries/health.ts`)**:
  - Updated `IMPLEMENTED_SOURCES: ["notion", "drive"]`.
- **Scripts**:
  - Added `scripts/smoke-drive.ts` and `"smoke:drive"` npm script.
- **Documentation**:
  - Updated `ARCHITECTURE.md` § Drive sync with crawl-first, level-by-level BFS crawl architecture.
  - Updated `DESIGN.md` § Copy with stale banner and sync status rules.
- **Test coverage**:
  - 179 tests passing across 14 test suites, including 11 offline integration tests in `tests/drive-collector.test.ts`.

## In progress

- Live checks (pending owner's Google Service Account JSON configuration in `.env`):
  - 8.6 Smoke script verification (`pnpm smoke:drive`).
  - 8.7 First live sync seed test (`SELECT COUNT(*) FROM drive_files > 0`, `raw_events = 0`, `project_events = 0`).
  - 8.8 Live trashed file verification (`trashed = 1`, no event).
  - 8.9 Live moved file between WP folders verification (departmentId updated, no event).
  - 8.10 Live `/api/health` verification (`sources.drive.implemented = true`, `lastSuccessAt` recent).

## Known issues

- Next.js Turbopack build logs 3 font fallback override warnings for `Atkinson Hyperlegible Next` (non-blocking).

## Next recommended step

1. Owner shares Google Drive project root folder with service account email and adds `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` to `.env`.
2. Run live verification steps 8.6 to 8.10.
3. Merge `feat/phase-4-drive` into `main`.

## Important context

- The Drive pipeline implements crawl-first write-after: mid-crawl errors write nothing to `drive_files` or `raw_events`.
- File renames within 30 minutes update `subject_title` in-place on the existing `DOC_CREATED` project event.
- Stale banner outputs independent sentences for failing sources, e.g. `"Drive henüz hiç senkron olmadı."` or `"Notion senkronu çalışmıyor. Son başarı: 2 sa önce."`.
