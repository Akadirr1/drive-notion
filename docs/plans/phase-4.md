# Phase 4 — Drive Pipeline

> **Scope:** Drive client with `@googleapis/drive`, service account auth, full-tree level-by-level crawl, folder mapping and department resolution, `mapFile` / `diffFile` / coalescing pure functions, pure helpers for UI string formatting, and comprehensive offline integration tests.
>
> **Prerequisite:** Phase 3 is complete. The owner has shared the project root folder with the service account and set `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` in `.env`. 

---

## 0. Before Writing Code — Verify the Drive API

ARCHITECTURE.md § Known risks: _"use the Context7 MCP for current docs of Next.js, Tailwind CSS v4, Drizzle, @notionhq/client and googleapis."_

*Context7 is unavailable in this environment, but the facts below were verified explicitly via npm and web research for `@googleapis/drive`.*

### API facts verified (2026-09-28)

| Fact | Detail |
|---|---|
| **Current Package Version** | `@googleapis/drive@26.0.1` |
| **Auth** | Exported `auth.GoogleAuth` can parse credentials directly: `new auth.GoogleAuth({ credentials: JSON.parse(Buffer.from(envVar, 'base64').toString()), scopes: ['https://www.googleapis.com/auth/drive.readonly'] })` |
| **List Query** | `q: "'<id>' in parents and trashed = false"` |
| **List Parameters** | `pageSize: 1000`, `supportsAllDrives: true`, `includeItemsFromAllDrives: true`, `fields: 'nextPageToken, files(id, name, mimeType, parents, createdTime, modifiedTime, webViewLink)'` |
| **Timeout Configuration** | `google.options({ timeout: 30000 })` sets a global 30s timeout, or it can be passed per-request. |
| **Retry Configuration** | Built-in via `googleapis-common`/`gaxios` `retryConfig` for 429 and 5xx errors; active by default in the library's `auth` client. No custom retry loop should be written. |

### Action for implementer

Pin the dependency in `package.json`:
```json
"@googleapis/drive": "26.0.1"
```

---

## 1. Overview

Phase 4 integrates Google Drive. Instead of a `modifiedTime` cursor, the sync performs a **full-tree, level-by-level crawl** starting from `drive.root_folder_id`. This reliably catches files moved between folders and deletions without webhooks. 

- **Seed**: The first run creates snapshots but emits zero events.
- **Incremental Crawl**: Level-by-level BFS. Because it starts from the root, **all parents are known**; there is no need to resolve missing parents.
- **Department Resolution**: The nearest ancestor folder matching `departments[].drive_folder_id` wins. If none match, a regex on the file name (`WP-(\d{2})`) matched to `notion_value` is used. Otherwise `null`. Nested subfolders inherit their ancestor's department.
- **Silent Files**: `drive.silent_mime_prefixes` and `drive.silent_name_patterns` evaluate to a `silent` boolean. Silent files are persisted to `drive_files` but never emit events. `silent` is calculated on the fly, not persisted as a column.
- **Raw Events**: Kinds are `doc:created` and `doc:updated`. External ID is `file_id`. OccurredAt is `createdTime` (created) or `modifiedTime` (updated). 
- **Diff Logic**: Only changes in `modifiedTime` trigger `doc:updated`. Folders **never** emit events. A file restored from the trash (`trashed` 1 → 0) emits **no** event.
- **Trashing**: Files missing from a **complete, successful, non-seed** crawl are marked `trashed = 1`. 
- **Coalescing**: If a `DOC_CREATED` or `DOC_UPDATED` event already exists for the same `file_id` within the last 30 minutes, `process.ts` updates that event's `occurred_at` and `raw_event_id` instead of inserting a new row.
- **Errors & Auth**: Invalid or missing `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` (not set, not base64, not valid JSON) writes to `sync_state.last_error` with a readable message, and the loop continues safely.
- **Thin wrappers**: `client.ts` exposes thin wrappers (like `listChildren(folderId, pageToken)`) with the 30s timeout and library retries. The collector and smoke script only use these. Tests mock `client.ts` directly.

---

## 2. Dependency

### 2.1. Install `@googleapis/drive`

```bash
pnpm add @googleapis/drive@26.0.1
```

---

## 3. ARCHITECTURE.md Update

Replace ARCHITECTURE.md § Drive sync with:

```markdown
## Drive sync

- Auth with a Google service account, scope `drive.readonly`. The owner shares the BUMIN root folder with the service account email as Viewer.
- Sync mechanism: full-tree, level-by-level crawl from `root_folder_id` (`'<id>' in parents and trashed = false`). No `modifiedTime` cursors are used.
- Because the crawl walks top-down, every file's parent path is known immediately. Department is resolved by the nearest ancestor listed in `departments[].drive_folder_id`, falling back to `WP-xx` in the file name, else `null`.
- First full sync is a seed: store files and folders, set `seeded`, emit no semantic events.
- Incremental sync compares `modifiedTime` to emit `doc:updated`. Folders never emit events.
- Trashing: files missing from a complete, successful crawl are marked `trashed = 1` (no event). Restores (1 -> 0) emit no event.
- Coalescing: if the same file has a `DOC_CREATED` or `DOC_UPDATED` within the last 30 minutes, move that event's `occurred_at` forward instead of inserting a new one. Ten saves in a row appear as one line.
- `doc_type`: from `config.doc_types` regex array. First match wins, else `other`.
- Silent files: match `silent_mime_prefixes` or `silent_name_patterns`. They are stored in the DB but emit no raw events.
- All timestamps are ISO 8601 UTC with "Z" (toISOString or the API's RFC 3339 strings). When a test needs an old timestamp, write an ISO string; never SQLite datetime(), which has no "Z" and is read as local time.
- The Drive client uses `@googleapis/drive` with its built-in 429/5xx retries and a 30-second timeout.
```

---

## 4. Files to Create or Modify

### 4.1. `config/project.example.yaml` & `src/server/config.ts` — MODIFY
**Purpose:** Add `silent` patterns. Validate regexes identical to `doc_types`.
**Changes:**
- Example YAML: Add `drive.silent_mime_prefixes: ["image/", "video/"]` and `drive.silent_name_patterns: ['\.ulg$']`.
- Config loader: Add string array schemas for both. Add a `superRefine` loop for `silent_name_patterns` to catch bad regexes.

### 4.2. `src/server/integrations/drive/client.ts` — CREATE
**Purpose:** Lazy singleton `Drive` client instance and thin wrappers.
**Exports:**
- `getDriveClient()`: Reads/decodes `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`. Throws readable error if missing, not base64, or not JSON. Instantiates `google.drive({ version: 'v3', auth })`. Sets `google.options({ timeout: 30000 })`.
- `listChildren(folderId: string, pageToken?: string)`: Calls `files.list` with the exact query and fields. Built-in library retries handle 429s.

### 4.3. `src/server/integrations/drive/map-file.ts` — CREATE
**Purpose:** Pure functions to map a Drive file and diff snapshots.
**Exports:**
- `mapFile(file, parentMap, departmentFolderIds, config)`: Resolves `departmentId` via `parentMap` recursion to `departmentFolderIds`, or name fallback. Computes `silent` status. Returns `DriveFileSnapshot`.
- `buildAfterPayload(snapshot)`: Always includes `name`, `departmentId`, `docType`, `webViewLink`.
- `diffFile(before, after, silent)`: Returns raw events.
  - If `silent` is true or `after.isFolder` is true → returns `[]`.
  - If `before` is null (new file) → emits `doc:created` (occurredAt = `createdTime`).
  - If `before.trashed === 1` and `after.trashed === 0` → returns `[]` (no restore event).
  - If `before.modifiedTime !== after.modifiedTime` → emits `doc:updated` (occurredAt = `modifiedTime`).
  - `externalId` is `after.fileId`.

### 4.4. `src/server/integrations/drive/collector.ts` — CREATE
**Purpose:** The sync orchestrator.
**Exports:** `syncDrive(db: WriterDb, config: ProjectConfig): Promise<void>`
**Algorithm:**
1. Check `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`. If invalid/missing, `last_error = ...`, update `sync_state`, return gracefully.
2. Read `sync_state`. Determine `isSeed`.
3. Initialize queues for BFS level-by-level crawl starting with `[config.drive.root_folder_id]`.
4. While queue has items, fetch `listChildren` for each folder (paginated).
5. Build `parentMap` (`file.id -> folderId`), identifying folders and extracting `departmentFolderIds` from config.
6. Skip Drive shortcuts (`mimeType === 'application/vnd.google-apps.shortcut'`).
7. `mapFile` each item.
8. `diffFile`.
9. Transactionally upsert `drive_files` and insert `raw_events`.
10. If crawl complete & not seed: mark `trashed = 1` for any file in DB not seen in this crawl. (No event).
11. Update `sync_state` with `lastSuccessAt` (and `seeded = 1`).

### 4.5. `src/server/events/normalize.ts` — MODIFY
**Purpose:** Add Drive cases.
**Changes:**
- `doc:created`: Maps to `DOC_CREATED`. `subjectTitle = after.name`. `docType = after.docType`.
- `doc:updated`: Maps to `DOC_UPDATED`. `subjectTitle = after.name`. `docType = after.docType`.

### 4.6. `src/server/events/coalesce.ts` — CREATE
**Purpose:** Pure function logic for coalescing doc events.
**Exports:**
- `shouldCoalesce(existingEvent: Pick<NormalizedEvent, 'occurredAt'>, newRawEvent: RawEventRow): boolean`
  Returns true if `newRawEvent.occurredAt` is within 30 minutes (1800000 ms) of `existingEvent.occurredAt`.

### 4.7. `src/server/events/process.ts` — MODIFY
**Purpose:** Integrate coalescing into the processor.
**Changes:**
Before `tx.insert(projectEvents)`, check if `type` is `DOC_CREATED` or `DOC_UPDATED`. If so, `SELECT * FROM project_events WHERE source_id = ? AND type IN ('DOC_CREATED', 'DOC_UPDATED') ORDER BY occurred_at DESC LIMIT 1`. 
If `shouldCoalesce` returns true, `UPDATE project_events SET occurred_at = ?, raw_event_id = ?` instead of inserting a new row.

### 4.8. `src/worker/index.ts` — MODIFY
**Purpose:** Wire `syncDrive` into the worker loop.
**Changes:** Call `syncDrive` after `syncNotion` and before `normalizePending`. Log `sync_drive_complete`. 

### 4.9. `package.json` scripts — MODIFY
**Changes:** Add `"smoke:drive": "tsx --env-file-if-exists=.env scripts/smoke-drive.ts"`

### 4.10. `scripts/smoke-drive.ts` — CREATE
**Purpose:** Read-only script proving Drive API access and tree visibility. Uses `client.ts` and `mapFile`.

### 4.11. `src/lib/format.ts` — MODIFY
**Purpose:** Pure helper for UI string formatting.
**Exports:** 
- `stripExtension(filename: string): string`: Removes the file extension (e.g., `"WP-01_Report.pdf"` -> `"WP-01_Report"`).
- `formatStaleMessage(sources: HealthPayload['sources'], now: Date): string`:
  - One failing with success: `"{Source} senkronu çalışmıyor. Son başarı: {relativeTimeAgo}"` (e.g. `Notion senkronu...`)
  - One never synced: `"{Source} henüz hiç senkron olmadı."`
  - Both failing with success: `"Notion ve Drive senkronu çalışmıyor. Son başarı: {relativeTimeAgo}"` (using the oldest `lastSuccessAt`).
  - Both never synced: `"Notion ve Drive henüz hiç senkron olmadı."`

### 4.12. `src/components/dashboard/event-feed.tsx` & `stale-banner.tsx` — MODIFY
**Changes:**
- `event-feed.tsx`: Use `stripExtension(event.subjectTitle)` for `DOC_CREATED` and `DOC_UPDATED` display text.
- `stale-banner.tsx`: Use `formatStaleMessage` pure helper instead of putting complex string concatenation in the React component.
- `deadline-strip.tsx`: Sync status uses oldest `lastSuccessAt` across implemented sources.

### 4.13. `src/server/queries/health.ts` — MODIFY
**Changes:** `IMPLEMENTED_SOURCES: ReadonlyArray<"notion" | "drive"> = ["notion", "drive"];`

### 4.14. `tests/` — ADD/MODIFY
- **`tests/fixtures/drive-files.ts`**: Fixtures for Drive APIs.
- **`tests/map-file.test.ts`**: Unit tests for `mapFile` (department fallback, ancestor logic, silent eval) and `diffFile`.
- **`tests/coalesce.test.ts`**: Pure tests for `shouldCoalesce`.
- **`tests/format.test.ts`**: Tests for `stripExtension` and `formatStaleMessage` exact copies.
- **`tests/normalizer.test.ts`**: Add `doc:created` and `doc:updated` fixture cases.
- **`tests/drive-collector.test.ts`**: Offline integration testing covering 9 exact scenarios:
  1. Seed writes no raw events.
  2. New file → DOC_CREATED with right WP.
  3. Modified file → DOC_UPDATED.
  4. Three saves within 30 minutes → one project event whose occurred_at and raw_event_id point to the last save.
  5. File missing from complete crawl → trashed = 1, no event.
  6. File moved between WP folders → department changes, no event.
  7. Crawl fails on a later folder → nothing trashed, last_error recorded, no throw.
  8. Silent file (image) → stored, no event.
  9. Handoff file outside WP folders → department extracted from its WP-xx code.
  10. Invalid credentials → last_error set, loop continues safely.
- **`tests/health.test.ts`**: Update for new `IMPLEMENTED_SOURCES`.

### 4.15. `HANDOFF.md` — MODIFY
Rewrite for Phase 4 completion. Add requirement for owner's service-account setup prior to live checks.

---

## 5. Implementation Order

Execute these steps in sequence. Each step should pass `pnpm typecheck` before moving on.

### Step 1: Install dependency & Config
```bash
pnpm add @googleapis/drive@26.0.1
```
Modify `config/project.example.yaml` and `src/server/config.ts` (§4.1). Run `pnpm typecheck`.

### Step 2: Create Drive client
Create `src/server/integrations/drive/client.ts` (§4.2). Run `pnpm typecheck`.

### Step 3: Pure Functions (Domain & Normalization)
Create `src/server/integrations/drive/map-file.ts` (§4.3).
Create `src/server/events/coalesce.ts` (§4.6).
Modify `src/server/events/normalize.ts` (§4.5).
Run `pnpm typecheck`.

### Step 4: Pure Function Tests
Create `tests/fixtures/drive-files.ts` (§4.14).
Create `tests/map-file.test.ts` and `tests/coalesce.test.ts` (§4.14).
Modify `tests/normalizer.test.ts` (§4.14).
Run `pnpm test`.

### Step 5: Format Helpers & UI Text
Modify `src/lib/format.ts` (§4.11). Add tests to `tests/format.test.ts`.
Modify `src/components/dashboard/stale-banner.tsx`, `event-feed.tsx`, and `deadline-strip.tsx` (§4.12).
Run `pnpm test`.

### Step 6: Process Coalescing
Modify `src/server/events/process.ts` (§4.7).
Run `pnpm typecheck`.

### Step 7: Drive Collector
Create `src/server/integrations/drive/collector.ts` (§4.4).
Run `pnpm typecheck`.

### Step 8: Offline Collector Integration Tests
Create `tests/drive-collector.test.ts` (§4.14).
Run `pnpm test`.

### Step 9: Worker, Health, Smoke Script
Modify `src/worker/index.ts` (§4.8).
Modify `src/server/queries/health.ts` (§4.13) and `tests/health.test.ts`.
Modify `package.json` (§4.9).
Create `scripts/smoke-drive.ts` (§4.10).
Run `pnpm test`.

### Step 10: Update Architecture & Handoff
Modify `ARCHITECTURE.md` (§3).
Modify `HANDOFF.md` (§4.15).

### Step 11: Quality Gate
```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
All four must pass.

---

## 6. Error Handling Summary

| Error | Handled by | Behaviour |
|---|---|---|
| Invalid/missing Base64 Auth | `collector.ts` | Records in `sync_state.last_error`. Loop continues. |
| Drive API timeout (>30s) | `@googleapis/drive` | Throws. Propagates to collector, which catches, records, and continues. |
| Drive 429/5xx | `gaxios` built-in retry | Retries automatically with backoff. Exhaustion propagates to collector. No custom retry code. |
| Partial fetch / Error mid-crawl | `collector.ts` | Stops crawl. Records error. **No files are marked trashed**. Loop continues. |

---

## 7. Payload Shape in `raw_events`

For `doc:created` or `doc:updated`:
```json
{
  "before": null,
  "after": {
    "name": "Hover test raporu v1.pdf",
    "departmentId": "03",
    "docType": "report",
    "webViewLink": "https://drive.google.com/..."
  }
}
```

---

## 8. "Done When" Checklist

### Offline checks (no Google credentials required)

#### 8.1. Quality gate passes
```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```
**Verify:** All four commands exit 0.

#### 8.2. Drive collector integration tests pass
**Verify:** `pnpm test -- tests/drive-collector.test.ts` passes with all 10 scenarios covering exact rows written (Seed, DOC_CREATED, DOC_UPDATED, Coalesced events, Trashed handling, Moved folders, Silent files, API failures mid-crawl, Name fallback, Auth parsing failures).

#### 8.3. Format helpers pure tests pass
**Verify:** `pnpm test -- tests/format.test.ts` passes exact Turkish copy rules for single source, missing source, and dual source failures, plus extension stripping logic.

#### 8.4. Coalesce and MapFile pure tests pass
**Verify:** `pnpm test -- tests/map-file.test.ts tests/coalesce.test.ts` passes all domain logic edge cases.

#### 8.5. `IMPLEMENTED_SOURCES` includes "drive"
**Verify:** `pnpm test -- tests/health.test.ts` passes.

### Live checks (require real Service Account JSON in `.env`)

#### 8.6. Smoke script works
```bash
pnpm smoke:drive
```
**Verify:** Output shows real file names, statuses, department mappings, and proves read capability. Exit code 0.

#### 8.7. First sync is a seed (no events)
```bash
rm -f data/app.db
pnpm worker
# Wait for one iteration, then Ctrl+C
sqlite3 data/app.db "SELECT COUNT(*) FROM drive_files;"           # → > 0
sqlite3 data/app.db "SELECT seeded FROM sync_state WHERE source='drive';"  # → 1
sqlite3 data/app.db "SELECT COUNT(*) FROM raw_events WHERE source='drive';"  # → 0
sqlite3 data/app.db "SELECT COUNT(*) FROM project_events WHERE source='drive';"  # → 0
```

#### 8.8. Trashed file correctly handled
Trash a file in Drive. Wait for one interval.
```bash
sqlite3 data/app.db "SELECT file_id, trashed FROM drive_files WHERE trashed = 1;"
# → the trashed file's file_id appears with trashed = 1. No new project_events.
```

#### 8.9. Moved between WP folders
Move a file between two different WP folders. Wait for one interval.
```bash
# Verify the departmentId updated in drive_files, but no event was emitted.
sqlite3 data/app.db "SELECT department_id FROM drive_files WHERE name='your-test-file';"
```

#### 8.10. /api/health shows drive as implemented
```bash
curl -s http://localhost:3000/api/health | python3 -m json.tool
```
**Verify:** `sources.drive.implemented` = `true`, `lastSuccessAt` recent, `seeded` = `true`.
