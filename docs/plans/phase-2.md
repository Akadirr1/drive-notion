# Phase 2 — Notion Pipeline

> **Scope:** Notion client (SDK-managed timeout + retry), collector (full-fetch + snapshot diff), schema validation, pure `mapPage` / `diffTask` / normalizer with fixture tests, `IMPLEMENTED_SOURCES` update, `scripts/smoke-notion.ts`.
>
> **Prerequisite:** Phase 1 is complete. Worker runs, `/api/health` returns timestamps, all quality-gate checks pass. The owner has filled `config/project.yaml` with a real `notion.tasks_data_source_id` and property names, and connected the Notion integration to the tasks database with read-content capability only. `NOTION_TOKEN` is set in `.env`.

---

## 0. Before Writing Code — Verify the Notion API

ARCHITECTURE.md § Known risks says: _"Notion API versioning (databases vs data sources): verify endpoints via Context7 before Phase 2."_

The Notion API introduced the Data Source model in API version `2025-09-03`. As of September 2026 the current stable `@notionhq/client` version is **v5.26.0**, which exposes `client.dataSources.query()` and `client.dataSources.retrieve()`.

### API facts verified via web research (2026-09-27)

| Fact | Detail |
|---|---|
| **Current API version** | `2025-09-03` (or later; the SDK handles this by default) |
| **Data source query endpoint** | `POST /v1/data_sources/{data_source_id}/query` |
| **Data source retrieve endpoint** | `GET /v1/data_sources/{data_source_id}` — returns schema with property names, types, and status groups |
| **SDK query method** | `notion.dataSources.query({ data_source_id, filter?, sorts?, start_cursor?, page_size? })` |
| **SDK retrieve method** | `notion.dataSources.retrieve({ data_source_id })` |
| **SDK built-in timeout** | `timeoutMs` constructor option → `RequestTimeoutError` on expiry |
| **SDK built-in retry** | Automatic retry on 429/529 with exponential backoff + jitter, respects `Retry-After` header. Default: **2 retries**. Configurable via `retry` option. |
| **Rate limit** | ~3 req/s per integration; 429 includes `Retry-After` header |
| **Status property groups** | Always 3 groups in fixed order: To-do (1st), In progress (2nd), Complete (3rd). Each group has `option_ids[]`. |
| **`last_edited_time` precision** | Rounded to the nearest minute |
| **Query does not return trashed pages** | Deleted / trashed pages are simply absent from query results |

### Action for implementer

Before writing `src/server/integrations/notion/client.ts`, run this in the repo root:

```bash
pnpm add @notionhq/client@5.26.0
```

Then verify the SDK types:

```bash
grep -E "dataSources|timeoutMs|retry" node_modules/@notionhq/client/build/src/Client.d.ts
```

Confirm:
1. `dataSources.query()` and `dataSources.retrieve()` exist.
2. The `Client` constructor accepts `timeoutMs` and a `retry` option.

If `dataSources` methods do not exist, fall back to `databases.query({ database_id })` and `databases.retrieve({ database_id })`. Document the deviation in HANDOFF.md.

Pin the version in `package.json`:

```json
"@notionhq/client": "5.26.0"
```

---

## 1. Overview

Phase 2 wires the Notion data source into the worker loop. After this phase:

- **Full fetch every sync.** The task database is small (a few hundred pages = 1–3 API requests). Every sync fetches all non-trashed pages with no filter. This is simpler and solves the problem that the query endpoint does not return trashed pages, so incremental sync could never detect deletions.
- **First full sync is a seed.** It fills snapshots, sets `seeded = 1`, and emits **no** semantic events (the feed is not flooded on first run).
- **Subsequent syncs** compare each fetched page against its snapshot. Only actual field changes produce `raw_events`. Pages whose `page_id` was in the snapshot but was not returned by a **complete, successful** fetch are marked `archived = 1` (no event). If the fetch failed or was partial (any error before all pages were consumed), no pages are marked archived.
- **Schema validation at the start of every sync.** `dataSources.retrieve()` fetches the data source schema, then every configured property is checked for existence and expected type. A mismatch fails with a readable error naming the property, expected type, and `config/project.yaml` — even when the query returns zero pages. If `config.notion.status_groups` is omitted, groups are derived from the status property schema **by position** (1st → `todo`, 2nd → `active`, 3rd → `done`), not by English group names.
- **The normalizer** converts unprocessed `raw_events` into `project_events` according to ARCHITECTURE.md.
- **SDK-managed timeout and retry.** The `Client` is constructed with `timeoutMs: 30_000`. The SDK's built-in retry (2 retries, exponential backoff + jitter, `Retry-After` header) handles 429/529 errors. No custom retry code is written.
- **Property mapping** is a pure function `mapPage(page, config, statusGroupMap)` with unit tests.
- **Snapshot diff** is a pure function `diffTask(before, after)` that returns an array of raw event descriptors. Unit-tested with fixtures.
- **Raw event kinds encode the new value**: `status:todo`, `status:active`, `status:done`, `blocked:true`, `blocked:false`. This prevents the unique constraint `(source, externalId, kind, occurredAt)` from swallowing a second real change within the same minute.
- **Transactional writes.** Each page's snapshot upsert + raw event inserts are wrapped in one SQLite transaction. Each raw event's project_events insert + `processed = 1` update are wrapped in one transaction.
- A department value matching no configured department stores `department_id = null` and logs a warning; it does not fail the sync.
- If a property named in config does not exist (or has the wrong type) in the data source schema, the sync **fails with a readable error** naming the property and `config/project.yaml`, records it in `sync_state.last_error`, and does **not** crash the loop.
- `"notion"` is added to `IMPLEMENTED_SOURCES`.
- `scripts/smoke-notion.ts` proves API access using `client.ts` and `mapPage`. No second Client, no duplicated mapping.
- The normalizer is a **pure function** with fixture-based unit tests.

---

## 2. Dependency

### 2.1. Install `@notionhq/client`

```bash
pnpm add @notionhq/client@5.26.0
```

This is the only new dependency. The SDK handles timeout and 429/529 retry internally — no additional libraries are needed.

---

## 3. ARCHITECTURE.md Update

Replace ARCHITECTURE.md § Notion sync with:

```markdown
## Notion sync

- Every sync does a full fetch (no cursor filter). The database is small (a few hundred pages); the query endpoint does not return trashed pages, so full fetch is needed to detect deletions.
- At the start of each sync, retrieve the data source schema with `dataSources.retrieve()`. Validate that every property named in `config.notion.properties` exists in the schema with the expected type. Fail with a readable error if not.
- If `config.notion.status_groups` is defined, use it. Otherwise derive groups from the status property schema by position: first group → `todo`, second → `active`, third → `done`.
- Map properties through `config.notion.properties`. Compare each page with its snapshot. Only an actual field change produces a raw event.
- Raw event kinds encode the new value (e.g. `status:active`, `blocked:true`) so the unique constraint cannot swallow a second change within the same minute.
- First full sync is a seed: fill snapshots, set `seeded`, emit no semantic events.
- After a complete, successful fetch, mark snapshots whose `page_id` was not returned as `archived = 1` (no event). Never mark anything archived after a partial or failed fetch.
```

Also remove the `cursor` reference for Notion in the `sync_state` table description (Notion no longer uses a cursor). Keep `cursor` in the schema (Drive still needs it); just note that Notion does not use it.

---

## 4. Files to Create or Modify

### 4.1. `src/server/integrations/notion/client.ts` — CREATE

**Purpose:** Single Notion client instance. AGENTS.md: _"One client per integration."_

**Extends:** Nothing (new module).

**Behaviour:**

- Exports `getNotionClient(): Client` — lazy singleton. Reads `NOTION_TOKEN` from `process.env`. Throws a readable error if missing.
  ```typescript
  const client = new Client({
    auth: process.env.NOTION_TOKEN,
    timeoutMs: 30_000,
    // The SDK retries 429/529 up to 2 times by default with exponential backoff + jitter.
    // Do NOT add custom retry logic on top of this.
  });
  ```
- Exports thin wrappers (for testability / mocking), each doing **no** custom timeout or retry logic:
  - `queryDataSource(dataSourceId, opts?)` → calls `client.dataSources.query({ data_source_id, ...opts })`
  - `retrieveDataSource(dataSourceId)` → calls `client.dataSources.retrieve({ data_source_id })`

**Important:** If at implementation time the SDK does not have `dataSources.query` / `dataSources.retrieve`, fall back to `databases.query({ database_id })` / `databases.retrieve({ database_id })`. Document in HANDOFF.md.

### 4.2. `src/server/integrations/notion/map-page.ts` — CREATE

**Purpose:** Pure function that maps a Notion page object + config + status-group map → a `NotionTaskSnapshot`. Also exports the schema validation function and status-group derivation.

**Exports:**

```typescript
/** Validates the data source schema against config.notion.properties.
 *  Throws PropertyConfigError naming the property, expected type, and config/project.yaml. */
export function validateSchema(
  schema: DataSourceSchema,
  config: ProjectConfig,
): void;

/** Derives status_group mapping from the data source schema's status property groups.
 *  Uses position: 1st group → todo, 2nd → active, 3rd → done.
 *  Returns a Map<statusOptionName, 'todo' | 'active' | 'done'>. */
export function deriveStatusGroups(
  schema: DataSourceSchema,
  statusPropertyName: string,
): Map<string, 'todo' | 'active' | 'done'>;

/** Builds status-group map from config.notion.status_groups (explicit mapping). */
export function buildConfigStatusGroups(
  statusGroups: { todo: string[]; active: string[]; done: string[] },
): Map<string, 'todo' | 'active' | 'done'>;

/** The snapshot shape that maps to notion_tasks columns. */
export interface NotionTaskSnapshot {
  pageId: string;
  title: string;
  status: string;
  statusGroup: 'todo' | 'active' | 'done';
  departmentId: string | null;
  milestoneId: string | null;
  dueDate: string | null;
  blocked: number;       // 0 or 1
  blockerNote: string | null;
  isNext: number;        // 0 or 1
  url: string;
  archived: number;      // 0 or 1
  lastEditedTime: string;
}

/** Maps a Notion page to a snapshot.
 *  - Joins ALL plain_text segments for title and rich_text (not just [0]).
 *  - Unknown department → null + logs via the provided warn callback.
 *  - Unknown status → defaults to 'todo' + warns.
 *  - Missing optional properties → default values (null/false). */
export function mapPage(
  page: PageObjectResponse,
  config: ProjectConfig,
  statusGroupMap: Map<string, 'todo' | 'active' | 'done'>,
  warn: (msg: object) => void,
): NotionTaskSnapshot;
```

**Property extraction rules:**

```
title:        Join ALL .title[].plain_text segments, not just [0]
status:       .status.name
department:   .select.name (nullable)
due:          .date.start (nullable)
blocked:      .checkbox (default false)
blocker_note: Join ALL .rich_text[].plain_text segments, not just [0]
milestone:    .select.name (nullable)
next:         .checkbox (default false)
```

**Property validation** happens in `validateSchema`, NOT in `mapPage`. By the time `mapPage` runs, the schema has already been validated. `mapPage` still handles missing optional properties gracefully (uses defaults).

**Schema validation checks** (in `validateSchema`):

| Config key | Expected Notion type |
|---|---|
| `title` | `title` |
| `status` | `status` |
| `department` | `select` |
| `due` (if configured) | `date` |
| `blocked` (if configured) | `checkbox` |
| `blocker_note` (if configured) | `rich_text` |
| `milestone` (if configured) | `select` |
| `next` (if configured) | `checkbox` |

Error format: `Notion property "${name}" (configured as notion.properties.${key} in config/project.yaml) expected type "${expectedType}" but found "${actualType}" (or not found). Available properties: ${list}`

### 4.3. `src/server/integrations/notion/diff-task.ts` — CREATE

**Purpose:** Pure function that compares a previous snapshot with a new one and returns raw event descriptors.

**Exports:**

```typescript
export interface RawEventDescriptor {
  kind: string;       // e.g. 'status:active', 'blocked:true'
  externalId: string; // page_id
  payload: string;    // JSON string
  occurredAt: string; // last_edited_time
}

/** Builds a raw-event payload's "after" object. Always includes title, departmentId, url.
 *  This is the ONLY function that builds "after" payloads. */
export function buildAfterPayload(snapshot: NotionTaskSnapshot): {
  statusGroup: string;
  blocked: number;
  blockerNote: string | null;
  title: string;
  departmentId: string | null;
  url: string;
};

/** Returns raw events for all changes between before and after.
 *  before = null means a new task. Returns [] for no-op (no changes). */
export function diffTask(
  before: NotionTaskSnapshot | null,
  after: NotionTaskSnapshot,
): RawEventDescriptor[];
```

**Diff logic:**

```
If before is null (new task):
  If statusGroup is 'active' → emit { kind: 'status:active', payload: { before: null, after: buildAfterPayload(after) } }
  If statusGroup is 'done'   → emit { kind: 'status:done',   payload: { before: null, after: buildAfterPayload(after) } }
  If statusGroup is 'todo'   → no event (new todo is not interesting)
  No blocked event for new tasks.

If before exists:
  Compare all columns. If nothing changed → return [] (skip)

  If statusGroup changed:
    Emit { kind: `status:${after.statusGroup}`, payload: {
      before: { statusGroup: before.statusGroup },
      after: buildAfterPayload(after)
    }}

  If blocked changed:
    Emit { kind: `blocked:${after.blocked === 1 ? 'true' : 'false'}`, payload: {
      before: { blocked: before.blocked },
      after: buildAfterPayload(after)
    }}

  Both status and blocked can change simultaneously → emit both events.

All descriptors use externalId = after.pageId, occurredAt = after.lastEditedTime.
```

**Key:** `buildAfterPayload` always includes `title`, `departmentId`, `url` so that `project_events.subject_title` (NOT NULL) is never violated.

### 4.4. `src/server/integrations/notion/collector.ts` — CREATE

**Purpose:** Orchestrates the sync: schema validation, full fetch, page mapping, snapshot diff, raw event + snapshot writes, archival detection, `sync_state` update.

**Extends:** Nothing (new module). Only module that calls `client.ts`.

**Exports:** `syncNotion(db: WriterDb, config: ProjectConfig): Promise<void>`

**Algorithm:**

```
1. Read sync_state for source = 'notion'
2. Determine mode: isSeed = !seeded

3. Retrieve schema:
   const schema = await retrieveDataSource(config.notion.tasks_data_source_id)

4. Validate schema:
   validateSchema(schema, config)
   // throws PropertyConfigError on mismatch → caught in step 11

5. Build status group map:
   If config.notion.status_groups exists:
     statusGroupMap = buildConfigStatusGroups(config.notion.status_groups)
   Else:
     statusGroupMap = deriveStatusGroups(schema, config.notion.properties.status)

6. Full fetch (paginate, no filter):
   const allPages: PageObjectResponse[] = []
   let startCursor: string | undefined
   let fetchComplete = false
   do {
     const response = await queryDataSource(config.notion.tasks_data_source_id, { start_cursor: startCursor })
     allPages.push(...response.results)
     startCursor = response.has_more ? response.next_cursor : undefined
   } while (startCursor)
   fetchComplete = true

7. Process pages:
   const seenPageIds = new Set<string>()
   for (const page of allPages) {
     const snapshot = mapPage(page, config, statusGroupMap, warn)
     seenPageIds.add(snapshot.pageId)

     // Read existing snapshot
     const existing = db.select ... WHERE page_id = snapshot.pageId

     // Diff
     const events = isSeed ? [] : diffTask(existing ?? null, snapshot)

     // TRANSACTION: upsert snapshot + insert all raw events
     db.transaction((tx) => {
       if (existing) {
         tx.update(notionTasks).set(snapshot).where(eq(notionTasks.pageId, snapshot.pageId)).run()
       } else {
         tx.insert(notionTasks).values(snapshot).run()
       }
       for (const evt of events) {
         tx.insert(rawEvents).values({
           source: 'notion',
           kind: evt.kind,
           externalId: evt.externalId,
           payload: evt.payload,
           occurredAt: evt.occurredAt,
           ingestedAt: new Date().toISOString(),
           processed: 0,
         }).onConflictDoNothing().run()
       }
     })
   }

8. Archive detection (ONLY if fetchComplete and not seed):
   If fetchComplete && !isSeed:
     SELECT page_id FROM notion_tasks WHERE archived = 0
     For each existing page_id NOT in seenPageIds:
       UPDATE notion_tasks SET archived = 1 WHERE page_id = ...
       // No event emitted

9. Update sync_state:
   If isSeed:
     UPDATE sync_state SET seeded = 1, last_success_at = now WHERE source = 'notion'
   Else:
     UPDATE sync_state SET last_success_at = now WHERE source = 'notion'

10. Log:
    { event: "sync_notion_complete", mode: isSeed ? "seed" : "incremental", pages: allPages.length, timestamp }

11. On error at any point:
    - UPDATE sync_state SET last_error = error.message, last_error_at = now WHERE source = 'notion'
    - Log error as JSON
    - Do NOT re-throw (worker loop must continue)
    - If fetchComplete is false, do NOT mark any pages as archived
```

### 4.5. `src/server/events/types.ts` — CREATE

**Purpose:** Type definitions for the closed list of semantic event types and related types.

**Contents:**

```typescript
/** Closed list from ARCHITECTURE.md → Events */
export type ProjectEventType =
  | 'TASK_STARTED'
  | 'TASK_COMPLETED'
  | 'TASK_BLOCKED'
  | 'TASK_UNBLOCKED'
  | 'DOC_CREATED'
  | 'DOC_UPDATED';

export interface NormalizedEvent {
  type: ProjectEventType;
  departmentId: string | null;
  subjectTitle: string;
  detail: string | null;
  docType: string | null;
  source: 'notion' | 'drive';
  sourceId: string;
  url: string | null;
  occurredAt: string;
  rawEventId: number;
}
```

### 4.6. `src/server/events/normalize.ts` — CREATE

**Purpose:** Pure function from raw events to project events. AGENTS.md: _"One normalizer."_

**Exports:** `normalizeRawEvent(raw: RawEventRow): NormalizedEvent | null`

Pure function — no DB access, no side effects. The `kind` field encodes the new value.

**Mapping:**

| Raw kind | Semantic event |
|---|---|
| `status:active` | `TASK_STARTED` |
| `status:done` | `TASK_COMPLETED` |
| `status:todo` | `null` (not a semantic event) |
| `blocked:true` | `TASK_BLOCKED` (detail = `after.blockerNote`) |
| `blocked:false` | `TASK_UNBLOCKED` |
| Drive kinds (Phase 4) | `DOC_CREATED` / `DOC_UPDATED` |

**Implementation:**

```typescript
export function normalizeRawEvent(raw: RawEventRow): NormalizedEvent | null {
  if (raw.source !== 'notion') return null; // Drive events handled in Phase 4

  const payload = JSON.parse(raw.payload);
  const after = payload.after;

  switch (raw.kind) {
    case 'status:active':
      return {
        type: 'TASK_STARTED',
        departmentId: after.departmentId ?? null,
        subjectTitle: after.title,
        detail: null, docType: null,
        source: 'notion', sourceId: raw.externalId,
        url: after.url ?? null,
        occurredAt: raw.occurredAt, rawEventId: raw.id,
      };

    case 'status:done':
      return {
        type: 'TASK_COMPLETED',
        departmentId: after.departmentId ?? null,
        subjectTitle: after.title,
        detail: null, docType: null,
        source: 'notion', sourceId: raw.externalId,
        url: after.url ?? null,
        occurredAt: raw.occurredAt, rawEventId: raw.id,
      };

    case 'status:todo':
      return null; // Not a semantic event

    case 'blocked:true':
      return {
        type: 'TASK_BLOCKED',
        departmentId: after.departmentId ?? null,
        subjectTitle: after.title,
        detail: after.blockerNote ?? null,
        docType: null,
        source: 'notion', sourceId: raw.externalId,
        url: after.url ?? null,
        occurredAt: raw.occurredAt, rawEventId: raw.id,
      };

    case 'blocked:false':
      return {
        type: 'TASK_UNBLOCKED',
        departmentId: after.departmentId ?? null,
        subjectTitle: after.title,
        detail: null, docType: null,
        source: 'notion', sourceId: raw.externalId,
        url: after.url ?? null,
        occurredAt: raw.occurredAt, rawEventId: raw.id,
      };

    default:
      return null;
  }
}
```

### 4.7. `src/server/events/process.ts` — CREATE

**Purpose:** DB-aware wrapper: reads unprocessed raw events, normalizes, inserts project events, marks processed. Each raw event is handled in its own **transaction**.

**Exports:** `normalizePending(db: WriterDb): void`

**Algorithm:**

```
1. SELECT * FROM raw_events WHERE processed = 0 ORDER BY occurred_at ASC
2. For each raw event:
   db.transaction((tx) => {
     const result = normalizeRawEvent(raw)
     if (result !== null) {
       tx.insert(projectEvents).values({
         type: result.type, departmentId: result.departmentId,
         subjectTitle: result.subjectTitle, detail: result.detail,
         docType: result.docType, source: result.source,
         sourceId: result.sourceId, url: result.url,
         occurredAt: result.occurredAt, rawEventId: result.rawEventId,
       }).run()
     }
     tx.update(rawEvents).set({ processed: 1 }).where(eq(rawEvents.id, raw.id)).run()
   })
3. Log: { event: "normalize_complete", processed: count, eventsCreated }
```

### 4.8. `src/worker/index.ts` — MODIFY

**Purpose:** Wire `syncNotion()` and `normalizePending()` into the worker loop.

**Extends:** Existing worker loop skeleton from Phase 1.

**Changes:**

```diff
 import { loadConfig } from "@/server/config";
 import { getWriterDb } from "@/server/db/client";
 import { syncState } from "@/server/db/schema";
 import { eq } from "drizzle-orm";
+import { syncNotion } from "@/server/integrations/notion/collector";
+import { normalizePending } from "@/server/events/process";

 // ... inside the while (running) loop, replace the tick-only block:

     try {
       const now = new Date().toISOString();
+      const config = loadConfig();
+
+      // Notion sync
+      const notionStart = Date.now();
+      await syncNotion(db, config);
+      console.log(JSON.stringify({
+        event: "sync_notion_complete",
+        durationMs: Date.now() - notionStart,
+        timestamp: new Date().toISOString(),
+      }));
+
+      // Normalize pending raw events
+      const normalizeStart = Date.now();
+      normalizePending(db);
+      console.log(JSON.stringify({
+        event: "normalize_complete",
+        durationMs: Date.now() - normalizeStart,
+        timestamp: new Date().toISOString(),
+      }));

       // Heartbeat
       db.update(syncState)
         .set({ lastSuccessAt: new Date().toISOString() })
         .where(eq(syncState.source, "worker"))
         .run();
```

### 4.9. `package.json` scripts — MODIFY

**Purpose:** Load `.env` automatically via `tsx --env-file-if-exists=.env` for worker and smoke scripts.

**Changes:**

```diff
-    "worker": "tsx src/worker/index.ts"
+    "worker": "tsx --env-file-if-exists=.env src/worker/index.ts",
+    "smoke:notion": "tsx --env-file-if-exists=.env scripts/smoke-notion.ts"
```

### 4.10. `src/server/queries/health.ts` — MODIFY

**Purpose:** Add `"notion"` to `IMPLEMENTED_SOURCES`.

**Change:**

```diff
-export const IMPLEMENTED_SOURCES: ReadonlyArray<"notion" | "drive"> = [];
+export const IMPLEMENTED_SOURCES: ReadonlyArray<"notion" | "drive"> = ["notion"];
```

### 4.11. `scripts/smoke-notion.ts` — CREATE

**Purpose:** Read-only script proving Notion API access. Uses `client.ts` and `mapPage` — no second Client, no duplicated mapping.

**Run:** `pnpm smoke:notion`

**Behaviour:**

```
1. Load config via loadConfig()
2. Import getNotionClient, queryDataSource, retrieveDataSource from client.ts
3. Import validateSchema, mapPage, deriveStatusGroups/buildConfigStatusGroups from map-page.ts
4. Retrieve schema → validateSchema → build statusGroupMap
5. Query first page (page_size: 5)
6. For each page, call mapPage and print:
   - pageId (truncated to 8 chars)
   - title
   - status → statusGroup
   - departmentId (or "⚠ unknown" if null and department value was present)
   - blocked (✓ / ✗)
   - isNext (✓ / ✗)
   - url
7. Print: "Showing {n} tasks"
8. Exit 0 on success, exit 1 on error
```

**Constraints:**
- Read-only: never calls any Notion write endpoint.
- Reuses `client.ts` (single Client instance) and `mapPage` — no code duplication.

### 4.12. `tests/fixtures/notion-raw-events.ts` — CREATE

**Purpose:** Fixture data for normalizer unit tests. Updated event kinds encode the new value.

```typescript
export const rawEventFixtures = {
  // Status changes
  todoToActive: {
    id: 1, source: 'notion', kind: 'status:active',
    externalId: 'page-001',
    payload: JSON.stringify({
      before: { statusGroup: 'todo' },
      after: { statusGroup: 'active', title: 'Design motor mount', departmentId: '01', url: 'https://notion.so/page-001', blocked: 0, blockerNote: null },
    }),
    occurredAt: '2026-09-27T10:00:00.000Z', ingestedAt: '2026-09-27T10:01:00.000Z', processed: 0,
  },

  doneToActive: {
    id: 2, source: 'notion', kind: 'status:active',
    externalId: 'page-002',
    payload: JSON.stringify({
      before: { statusGroup: 'done' },
      after: { statusGroup: 'active', title: 'Revise wiring diagram', departmentId: '02', url: 'https://notion.so/page-002', blocked: 0, blockerNote: null },
    }),
    occurredAt: '2026-09-27T10:05:00.000Z', ingestedAt: '2026-09-27T10:06:00.000Z', processed: 0,
  },

  activeToDone: {
    id: 3, source: 'notion', kind: 'status:done',
    externalId: 'page-003',
    payload: JSON.stringify({
      before: { statusGroup: 'active' },
      after: { statusGroup: 'done', title: 'Order batteries', departmentId: '00', url: 'https://notion.so/page-003', blocked: 0, blockerNote: null },
    }),
    occurredAt: '2026-09-27T10:10:00.000Z', ingestedAt: '2026-09-27T10:11:00.000Z', processed: 0,
  },

  todoToDone: {
    id: 4, source: 'notion', kind: 'status:done',
    externalId: 'page-004',
    payload: JSON.stringify({
      before: { statusGroup: 'todo' },
      after: { statusGroup: 'done', title: 'Book test site', departmentId: '00', url: 'https://notion.so/page-004', blocked: 0, blockerNote: null },
    }),
    occurredAt: '2026-09-27T10:15:00.000Z', ingestedAt: '2026-09-27T10:16:00.000Z', processed: 0,
  },

  statusTodo: {
    id: 12, source: 'notion', kind: 'status:todo',
    externalId: 'page-012',
    payload: JSON.stringify({
      before: { statusGroup: 'active' },
      after: { statusGroup: 'todo', title: 'Deprioritized task', departmentId: '00', url: 'https://notion.so/page-012', blocked: 0, blockerNote: null },
    }),
    occurredAt: '2026-09-27T10:40:00.000Z', ingestedAt: '2026-09-27T10:41:00.000Z', processed: 0,
  },

  // Blocked changes
  unblockedToBlocked: {
    id: 5, source: 'notion', kind: 'blocked:true',
    externalId: 'page-005',
    payload: JSON.stringify({
      before: { blocked: 0 },
      after: { statusGroup: 'active', blocked: 1, blockerNote: 'Waiting for PCB delivery', title: 'Assemble avionics', departmentId: '01', url: 'https://notion.so/page-005' },
    }),
    occurredAt: '2026-09-27T10:20:00.000Z', ingestedAt: '2026-09-27T10:21:00.000Z', processed: 0,
  },

  blockedToUnblocked: {
    id: 6, source: 'notion', kind: 'blocked:false',
    externalId: 'page-006',
    payload: JSON.stringify({
      before: { blocked: 1 },
      after: { statusGroup: 'active', blocked: 0, blockerNote: null, title: 'Test GPS module', departmentId: '01', url: 'https://notion.so/page-006' },
    }),
    occurredAt: '2026-09-27T10:25:00.000Z', ingestedAt: '2026-09-27T10:26:00.000Z', processed: 0,
  },

  // New task directly in active (before = null)
  newTaskActive: {
    id: 7, source: 'notion', kind: 'status:active',
    externalId: 'page-007',
    payload: JSON.stringify({
      before: null,
      after: { statusGroup: 'active', title: 'Calibrate ESCs', departmentId: '02', url: 'https://notion.so/page-007', blocked: 0, blockerNote: null },
    }),
    occurredAt: '2026-09-27T10:30:00.000Z', ingestedAt: '2026-09-27T10:31:00.000Z', processed: 0,
  },

  // New task directly in done (before = null)
  newTaskDone: {
    id: 8, source: 'notion', kind: 'status:done',
    externalId: 'page-008',
    payload: JSON.stringify({
      before: null,
      after: { statusGroup: 'done', title: 'Register team', departmentId: '00', url: 'https://notion.so/page-008', blocked: 0, blockerNote: null },
    }),
    occurredAt: '2026-09-27T10:35:00.000Z', ingestedAt: '2026-09-27T10:36:00.000Z', processed: 0,
  },

  // Null department (should still produce event)
  noDepartment: {
    id: 11, source: 'notion', kind: 'status:active',
    externalId: 'page-011',
    payload: JSON.stringify({
      before: { statusGroup: 'todo' },
      after: { statusGroup: 'active', title: 'Unassigned task', departmentId: null, url: 'https://notion.so/page-011', blocked: 0, blockerNote: null },
    }),
    occurredAt: '2026-09-27T10:50:00.000Z', ingestedAt: '2026-09-27T10:51:00.000Z', processed: 0,
  },
};
```

### 4.13. `tests/fixtures/notion-pages.ts` — CREATE

**Purpose:** Fixture Notion page objects for `mapPage` and `diffTask` unit tests. Covers:

1. **Multi-segment title** — title array with 3 segments (`[{ plain_text: "Motor " }, { plain_text: "mount " }, { plain_text: "v2" }]`)
2. **Multi-segment rich_text** — blocker_note with 2 segments
3. **Missing optional properties** — page with no `due`, `blocked`, `blocker_note`, `milestone`, `next`
4. **Unknown department** — department select value not in config
5. **Standard page** — all properties present

Also export a minimal `DataSourceSchema` fixture for `validateSchema` tests and a fixture with a wrong property type for the negative test.

### 4.14. `tests/normalizer.test.ts` — CREATE

**Purpose:** Fixture-based unit tests for `normalizeRawEvent`. Updated for encoded kinds.

**Test cases:**

| # | Fixture | Expected type | Notes |
|---|---|---|---|
| 1 | `todoToActive` | `TASK_STARTED` | kind=`status:active` |
| 2 | `doneToActive` | `TASK_STARTED` | Re-opened task |
| 3 | `activeToDone` | `TASK_COMPLETED` | kind=`status:done` |
| 4 | `todoToDone` | `TASK_COMPLETED` | Direct skip to done |
| 5 | `unblockedToBlocked` | `TASK_BLOCKED` | detail = blocker note |
| 6 | `blockedToUnblocked` | `TASK_UNBLOCKED` | detail = null |
| 7 | `newTaskActive` | `TASK_STARTED` | New task, before = null |
| 8 | `newTaskDone` | `TASK_COMPLETED` | New task, before = null |
| 9 | `statusTodo` | `null` | kind=`status:todo`, not a semantic event |
| 10 | `noDepartment` | `TASK_STARTED` | departmentId = null in output |

**Assertions per test:**
- `result.source === 'notion'`
- `result.sourceId === fixture.externalId`
- `result.occurredAt === fixture.occurredAt`
- `result.rawEventId === fixture.id`
- `result.subjectTitle` is never empty
- For `TASK_BLOCKED`: `result.detail === 'Waiting for PCB delivery'`
- For `TASK_UNBLOCKED`: `result.detail === null`
- For `noDepartment`: `result.departmentId === null`

### 4.15. `tests/map-page.test.ts` — CREATE

**Purpose:** Unit tests for `mapPage`, `validateSchema`, `deriveStatusGroups`, `diffTask`.

**Test cases for `mapPage`:**

| # | Fixture | Test |
|---|---|---|
| 1 | Multi-segment title | `title === "Motor mount v2"` (all segments joined) |
| 2 | Multi-segment rich_text | `blockerNote` joins all segments |
| 3 | Missing optional properties | `dueDate`, `blockerNote`, `milestoneId` are null; `blocked`, `isNext` are 0 |
| 4 | Unknown department | `departmentId === null`, warn callback called with `notion_unknown_department` |
| 5 | Standard page | All fields mapped correctly |

**Test cases for `validateSchema`:**

| # | Test |
|---|---|
| 1 | Valid schema passes without error |
| 2 | Missing required property → throws with property name and `config/project.yaml` |
| 3 | Wrong type (e.g. `status` property is `select` instead of `status`) → throws with expected and actual types |
| 4 | Missing optional property → does NOT throw |

**Test cases for `deriveStatusGroups`:**

| # | Test |
|---|---|
| 1 | Maps first group's options → `todo`, second → `active`, third → `done` |

**Test cases for `diffTask`:**

| # | Before | After | Expected events |
|---|---|---|---|
| 1 | null | statusGroup=active | `[{ kind: 'status:active' }]` |
| 2 | null | statusGroup=done | `[{ kind: 'status:done' }]` |
| 3 | null | statusGroup=todo | `[]` |
| 4 | statusGroup=todo | statusGroup=active | `[{ kind: 'status:active' }]` |
| 5 | blocked=0 | blocked=1 | `[{ kind: 'blocked:true' }]` |
| 6 | statusGroup=todo, blocked=0 | statusGroup=active, blocked=1 | `[{ kind: 'status:active' }, { kind: 'blocked:true' }]` (both) |
| 7 | same as before | same as after | `[]` (no-op) |
| 8 | All events include `title`, `departmentId`, `url` in `after` payload | — |

### 4.16. `tests/health.test.ts` — MODIFY

**Purpose:** Update the `IMPLEMENTED_SOURCES` assertion.

```diff
-  expect(IMPLEMENTED_SOURCES).toEqual([]);
+  expect(IMPLEMENTED_SOURCES).toEqual(["notion"]);
```

Add a test case: "notion source without recent success makes ok = false".

### 4.17. `ARCHITECTURE.md` — MODIFY

Replace § Notion sync as described in §3 of this plan.

### 4.18. `HANDOFF.md` — MODIFY

Rewrite for Phase 2 completion.

---

## 5. Implementation Order

Execute these steps in sequence. Each step should pass `pnpm typecheck` before moving on.

### Step 1: Install dependency
```bash
pnpm add @notionhq/client@5.26.0
```
Verify SDK types:
```bash
grep -E "dataSources|timeoutMs|retry" node_modules/@notionhq/client/build/src/Client.d.ts
```
If `dataSources` methods exist, proceed. If not, note fallback in HANDOFF.md and use `databases.*` instead.

### Step 2: Create event types
Create `src/server/events/types.ts` (§4.5).

### Step 3: Create Notion client
Create `src/server/integrations/notion/client.ts` (§4.1).
Run `pnpm typecheck`.

### Step 4: Create map-page module
Create `src/server/integrations/notion/map-page.ts` (§4.2).
Run `pnpm typecheck`.

### Step 5: Create diff-task module
Create `src/server/integrations/notion/diff-task.ts` (§4.3).
Run `pnpm typecheck`.

### Step 6: Create test fixtures (pages + raw events)
Create `tests/fixtures/notion-pages.ts` (§4.13).
Create `tests/fixtures/notion-raw-events.ts` (§4.12).

### Step 7: Create map-page + diff-task tests
Create `tests/map-page.test.ts` (§4.15).
Run `pnpm test` — all tests must pass.

### Step 8: Create normalizer
Create `src/server/events/normalize.ts` (§4.6).
Run `pnpm typecheck`.

### Step 9: Create normalizer tests
Create `tests/normalizer.test.ts` (§4.14).
Run `pnpm test` — all tests must pass.

### Step 10: Create event processor
Create `src/server/events/process.ts` (§4.7).
Run `pnpm typecheck`.

### Step 11: Create collector
Create `src/server/integrations/notion/collector.ts` (§4.4).
Run `pnpm typecheck`.

### Step 12: Wire the worker + update scripts
Modify `src/worker/index.ts` (§4.8).
Modify `package.json` scripts (§4.9).
Run `pnpm typecheck`.

### Step 13: Update health
Modify `src/server/queries/health.ts` (§4.10).
Modify `tests/health.test.ts` (§4.16).
Run `pnpm test` — all tests must pass.

### Step 14: Create smoke script
Create `scripts/smoke-notion.ts` (§4.11).
Manual run: `pnpm smoke:notion` (requires real `.env` and `config/project.yaml`).

### Step 15: Update ARCHITECTURE.md
Modify `ARCHITECTURE.md` § Notion sync (§4.17).

### Step 16: Quality gate
```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
All four must pass.

### Step 17: Update HANDOFF.md
Rewrite `HANDOFF.md` to reflect Phase 2 completion (§4.18).

---

## 6. Error Handling Summary

| Error | Handled by | Behaviour |
|---|---|---|
| `NOTION_TOKEN` missing | `client.ts` | Throws at client creation time. Collector catches, records in `sync_state.last_error`, loop continues. |
| Notion API timeout (>30s) | SDK (`timeoutMs`) | `RequestTimeoutError`. Propagates to collector, which catches and records. |
| Notion 429/529 rate limit | SDK (built-in retry) | SDK retries up to 2 times with exponential backoff + jitter, respects `Retry-After`. After exhausting retries, propagates to collector. No custom retry code. |
| Notion 5xx (non-529) | SDK | Not retried on POST. Propagates to collector. |
| Property missing / wrong type in schema | `map-page.ts` (`validateSchema`) | `PropertyConfigError` with readable message naming property, expected type, and `config/project.yaml`. Caught by collector, recorded in `sync_state.last_error`. Loop continues. |
| Unknown department value | `map-page.ts` (`mapPage`) | `department_id = null`, warn callback called. Sync continues. |
| Unknown status value | `map-page.ts` (`mapPage`) | Falls into default group (`todo`), warns. Sync continues. |
| Unknown milestone value | `map-page.ts` (`mapPage`) | `milestone_id = null`. Sync continues. |
| Partial fetch (error before all pages consumed) | `collector.ts` | `fetchComplete` stays `false`. No pages are marked archived. Error recorded. Loop continues. |
| Any other error | `collector.ts` (top-level catch in `syncNotion`) | Recorded in `sync_state.last_error` and `last_error_at`. Loop continues. |

---

## 7. Payload Shape in `raw_events`

For `status:active` or `status:done`:
```json
{
  "before": { "statusGroup": "todo" },
  "after": {
    "statusGroup": "active",
    "blocked": 0,
    "blockerNote": null,
    "title": "Design motor mount",
    "departmentId": "01",
    "url": "https://notion.so/page-001"
  }
}
```
`before` is `null` for newly created tasks.

For `blocked:true` or `blocked:false`:
```json
{
  "before": { "blocked": 0 },
  "after": {
    "statusGroup": "active",
    "blocked": 1,
    "blockerNote": "Waiting for PCB delivery",
    "title": "Assemble avionics",
    "departmentId": "01",
    "url": "https://notion.so/page-005"
  }
}
```

`buildAfterPayload` always includes `title`, `departmentId`, `url`, `statusGroup`, `blocked`, `blockerNote`. The normalizer reads `after.title`, `after.departmentId`, `after.url`.

---

## 8. "Done When" Checklist

### Offline checks (no Notion token required)

#### 8.1. Quality gate passes
```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```
**Verify:** All four commands exit 0.

#### 8.2. Normalizer has fixture tests for every ARCHITECTURE.md row
**Verify:** `pnpm test -- tests/normalizer.test.ts` passes with at least 10 test cases covering:
- `status:active` → `TASK_STARTED` (from `todo`, from `done`, from `null`/new task)
- `status:done` → `TASK_COMPLETED` (from `active`, from `todo`, from `null`/new task)
- `status:todo` → `null`
- `blocked:true` → `TASK_BLOCKED` (with detail = blocker note)
- `blocked:false` → `TASK_UNBLOCKED`
- `departmentId = null` → still produces an event

#### 8.3. mapPage and diffTask have fixture tests
**Verify:** `pnpm test -- tests/map-page.test.ts` passes covering:
- Multi-segment title and rich_text join all segments
- Missing optional properties use defaults
- Unknown department → null + warn
- Schema validation: missing property → readable error with config path; wrong type → readable error
- Status group derivation by position
- diffTask: new tasks, status changes, blocked changes, simultaneous changes, no-op

#### 8.4. `IMPLEMENTED_SOURCES` includes "notion"
**Verify:** `pnpm test -- tests/health.test.ts` passes.

#### 8.5. `ARCHITECTURE.md` updated
**Verify:** § Notion sync describes full-fetch, schema validation, no cursor, encoded event kinds, archival detection.

#### 8.6. `HANDOFF.md` updated
**Verify:** Reflects Phase 2 completion.

### Live checks (require real `NOTION_TOKEN` and `config/project.yaml`)

#### 8.7. Smoke script works
```bash
pnpm smoke:notion
```
**Verify:** Output shows real task titles, statuses, department mappings, Notion URLs. Exit code 0.

#### 8.8. First sync is a seed (no events)
```bash
rm -f data/app.db
pnpm worker
# Wait for one iteration, then Ctrl+C
sqlite3 data/app.db "SELECT COUNT(*) FROM notion_tasks;"           # → > 0
sqlite3 data/app.db "SELECT seeded FROM sync_state WHERE source='notion';"  # → 1
sqlite3 data/app.db "SELECT COUNT(*) FROM raw_events WHERE source='notion';"  # → 0
sqlite3 data/app.db "SELECT COUNT(*) FROM project_events WHERE source='notion';"  # → 0
```

#### 8.9. Changing a task's status creates the right project event
After the seed, change a task's status in Notion (e.g. "Yapılacak" → "Devam ediyor"). Wait for one interval.
```bash
sqlite3 data/app.db "SELECT type, subject_title FROM project_events WHERE source='notion' ORDER BY id DESC LIMIT 1;"
# → TASK_STARTED|<task title>
```

#### 8.10. Blocking a task creates TASK_BLOCKED with blocker note
Check "Tıkalı" on a task, fill "Neden". Wait for one interval.
```bash
sqlite3 data/app.db "SELECT type, detail FROM project_events WHERE type='TASK_BLOCKED' ORDER BY id DESC LIMIT 1;"
# → TASK_BLOCKED|<blocker note>
```

#### 8.11. `/api/health` shows notion as implemented
```bash
curl -s http://localhost:3000/api/health | python3 -m json.tool
```
**Verify:** `sources.notion.implemented` = `true`, `lastSuccessAt` recent, `seeded` = `true`.

#### 8.12. Unknown department does not fail
**Verify:** Task with an unknown department value → stored with `department_id = NULL`, worker logs `notion_unknown_department`, sync continues.

#### 8.13. Missing/wrong property fails with readable error
Rename a property in `config/project.yaml` to something wrong, restart worker.
```bash
sqlite3 data/app.db "SELECT last_error FROM sync_state WHERE source='notion';"
# → contains property name, expected type, and "config/project.yaml"
```
Worker must NOT crash. Restore config.

#### 8.14. Trashed task detected
Delete a task in Notion (trash it). Wait for one interval.
```bash
sqlite3 data/app.db "SELECT page_id, archived FROM notion_tasks WHERE archived = 1;"
# → the trashed task's page_id appears with archived = 1
```
No event emitted for archival.

---

## 9. Files Summary

| File | Action | Purpose |
|---|---|---|
| `package.json` | MODIFY | Add `@notionhq/client@5.26.0`, update `worker` and add `smoke:notion` scripts |
| `src/server/integrations/notion/client.ts` | CREATE | Notion client singleton with SDK `timeoutMs` + built-in retry |
| `src/server/integrations/notion/map-page.ts` | CREATE | Pure `mapPage`, `validateSchema`, `deriveStatusGroups`, `buildConfigStatusGroups` |
| `src/server/integrations/notion/diff-task.ts` | CREATE | Pure `diffTask`, `buildAfterPayload` |
| `src/server/integrations/notion/collector.ts` | CREATE | Full-fetch sync, schema validation, snapshot diff, raw event writes, archival |
| `src/server/events/types.ts` | CREATE | `ProjectEventType` union, `NormalizedEvent` interface |
| `src/server/events/normalize.ts` | CREATE | Pure normalizer: raw event → project event |
| `src/server/events/process.ts` | CREATE | DB wrapper: read unprocessed, normalize, insert (transactional) |
| `src/worker/index.ts` | MODIFY | Wire `syncNotion()` + `normalizePending()` into the loop |
| `src/server/queries/health.ts` | MODIFY | Add `"notion"` to `IMPLEMENTED_SOURCES` |
| `scripts/smoke-notion.ts` | CREATE | Read-only diagnostic using `client.ts` + `mapPage` |
| `tests/fixtures/notion-raw-events.ts` | CREATE | Fixture raw events for normalizer tests |
| `tests/fixtures/notion-pages.ts` | CREATE | Fixture Notion pages for mapPage/diffTask tests |
| `tests/normalizer.test.ts` | CREATE | 10+ test cases covering every normalizer row |
| `tests/map-page.test.ts` | CREATE | mapPage, validateSchema, deriveStatusGroups, diffTask tests |
| `tests/health.test.ts` | MODIFY | Update `IMPLEMENTED_SOURCES` assertion |
| `ARCHITECTURE.md` | MODIFY | Rewrite § Notion sync for full-fetch model |
| `HANDOFF.md` | MODIFY | Rewrite for Phase 2 completion |
