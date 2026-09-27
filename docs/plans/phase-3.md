# Phase 3 — Dashboard v1 on Notion Data

> **Scope:** Domain logic (department status, next action, progress, counts), query layer, six dashboard components, stale-data banner, last-visit cookie, sync-status indicator, DESIGN.md and ARCHITECTURE.md updates, fixture unit tests, visual verification at 1280px and 390px in light and dark modes.
>
> **Prerequisite:** Phase 2 is complete. The Notion pipeline is working — real task and event data are in SQLite. Worker runs, `/api/health` returns `ok: true` with `sources.notion.seeded: true`. All quality-gate checks pass. `NOTION_TOKEN` and real IDs are in `.env` / `config/project.yaml`.

---

## 0. Before Writing Code — Populate Real Data

The implementer must have a working local database with real Notion data before starting UI work. The Notion integration is read-only, so do not edit tasks in Notion just for testing. Seeded data is enough; an empty feed is a valid state to verify.

Run:

```bash
# Verify the Notion connection
pnpm smoke:notion

# Run one sync cycle to seed data (Ctrl-C after the first loop completes)
SYNC_INTERVAL_SECONDS=9999 pnpm worker
```

After the first loop finishes, verify:

```bash
# Check that tasks were seeded
sqlite3 data/app.db "SELECT count(*) FROM notion_tasks WHERE archived = 0;"
# → should be > 0

sqlite3 data/app.db "SELECT * FROM sync_state;"
# → notion row: seeded = 1, last_success_at has a recent timestamp
```

---

## 1. Documentation Updates (Do First)

These updates define the rules the code must follow. Make them before writing any application code.

### 1.1. ARCHITECTURE.md — Derived logic section

Replace the entire `## Derived logic` section (lines 220–236) with:

```markdown
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
```

### 1.2. ARCHITECTURE.md — Progress section

In the current text (line 234–236), the progress description references milestones. Replace it as part of 1.1 above.

### 1.3. DESIGN.md — Department status words

Replace line 122:

```
Department status words: "Yolunda", "{n} gün sessiz", "Tıkalı", "Boşta".
```

with:

```
Department status words:
- `blocked` → "Tıkalı"
- `stale` → "{n} gün sessiz"
- `active` → "Yolunda"
- `waiting` → (quiet, in summary line)
- `not_started` → (quiet, in summary line)
- `done` → (quiet, in summary line)
- `idle` → (quiet, in summary line)
```

### 1.4. DESIGN.md — Annunciator description

Replace the `annunciator` line in § Components (line 93):

```
- `annunciator` — one tile per department from config, plus nothing else. Tile: department id and name, status word. Clicking goes to `/departman/[id]`.
```

with:

```
- `annunciator` — one tile per loud department (blocked, stale, active). Tile: WP id and short name, status word. Clicking goes to the WP's Drive folder in a new tab. All quiet departments (waiting, not_started, done, idle) collapse into one muted summary line below the tiles (e.g. "9 WP başlamadı · 2 WP beklemede · 2 tamamlandı"). If all departments are quiet, no tiles are shown, only the summary.
```

### 1.5. DESIGN.md — Progress line in layout diagram

Replace the milestone progress line in the desktop layout diagram (line 65):

```
│ ▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░  Milestone 2/5, %38                   │
```

with:

```
│ ▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░  38 / 112 görev tamamlandı · %34       │
```

### 1.6. DESIGN.md — Counts panel labels

Replace the counts line in the desktop layout (line 67–69):

```
│ Şimdi ne yapmalıyım?           │  Tıkalı    Biten    Devam   │
│ RTK base kurulumunu doğrula    │    2         5        7     │
│ 01 Avionik, bugün              │         (bu hafta)          │
```

with:

```
│ Şimdi ne yapmalıyım?           │  Tıkalı    Biten    Devam   │
│ WP-01.7b — GCS mimarisi: Mod   │    2         5        7     │
│ A… (iki satır, title'da tam)   │       (bu hafta biten)      │
│ WP-01 Avionik, bugün           │                             │
```

### 1.7. DESIGN.md — Task title clamping rule

Add after the "No animations in v1" line (after line 104):

```
- Task titles in the next-action panel and event feed are clamped to two lines with CSS (`-webkit-line-clamp: 2`). The full title is in the `title` attribute of the element. Never truncate the title in the data layer.
```

---

## 2. Files to Create or Modify

### 2.1. `src/server/domain/department-status.ts` — CREATE

**Purpose:** Pure function to compute the status of each department. No DB access.

**Extends:** New module under `src/server/domain/` (directory layout from ARCHITECTURE.md).

**Inputs:**

```typescript
export type DepartmentStatus = 'blocked' | 'stale' | 'active' | 'waiting' | 'not_started' | 'done' | 'idle';

export interface DepartmentStatusInput {
  departmentId: string;
  tasks: Array<{
    statusGroup: 'todo' | 'active' | 'done';
    blocked: number; // 0 or 1
  }>;
  latestActivityAt: string | null; // Max of (latest project_event occurred_at, max notion_tasks last_edited_time)
  staleDays: number;
  now: Date;
}

export interface DepartmentStatusResult {
  departmentId: string;
  status: DepartmentStatus;
  /** For stale: how many days since the last activity */
  staleDaysCount?: number;
}

export function computeDepartmentStatus(input: DepartmentStatusInput): DepartmentStatusResult;
```

**Logic:**

```
1. If tasks is empty → return 'idle'
2. nonDone = tasks.filter(t => t.statusGroup !== 'done')
3. If nonDone is empty → all tasks done → return 'done'
4. If any nonDone task has blocked === 1 → return 'blocked'
5. activeTasks = tasks.filter(t => t.statusGroup === 'active')
6. If activeTasks.length > 0:
   a. If latestActivityAt is null → return 'stale' (staleDaysCount = staleDays + 1 or "∞")
   b. daysSince = floor((now - latestActivityAt) / 86400000)
   c. If daysSince >= staleDays → return 'stale' (staleDaysCount = daysSince)
   d. Else → return 'active'
7. If all tasks are todo → return 'not_started'
8. If some done, the rest todo (none active) → return 'waiting'
9. Fallback → return 'idle'
```

Also export a helper to compute the quiet summary line:

```typescript
export interface QuietSummary {
  notStartedCount: number;
  waitingCount: number;
  doneCount: number;
  idleCount: number;
  /** Turkish summary string, e.g. "9 WP başlamadı · 2 WP beklemede · 2 tamamlandı". Empty string if all counts are 0. */
  text: string;
}

export function computeQuietSummary(statuses: DepartmentStatusResult[]): QuietSummary;
```

**Summary text rules:**
- Segments: `"{n} WP başlamadı"` for not_started, `"{k} WP beklemede"` for waiting, `"{m} tamamlandı"` for done, `"{p} boşta"` for idle
- Only include segments with count > 0
- Join with ` · `
- Empty string if all counts are zero (all departments are loud)

### 2.2. `src/server/domain/next-action.ts` — CREATE

**Purpose:** Pure function to pick the single next action from a list of tasks.

**Inputs:**

```typescript
export interface NextActionTask {
  pageId: string;
  title: string;
  statusGroup: 'todo' | 'active' | 'done';
  departmentId: string | null;
  dueDate: string | null;
  blocked: number;
  isNext: number;
  priorityRank: number | null;
  sortOrder: number | null;
  url: string;
}

export interface NextAction {
  pageId: string;
  title: string;
  departmentId: string | null;
  dueDate: string | null;
  url: string;
}

export function pickNextAction(tasks: NextActionTask[]): NextAction | null;
```

**Logic:**

```
1. Filter out done and archived tasks (caller should not pass them, but guard anyway)
2. If any task has isNext === 1, return the first one
3. Sort remaining by: blocked ASC (non-blocked first), then:
   - active tasks before todo tasks
   - priorityRank ASC (nulls last)
   - sortOrder ASC (nulls last)
   - dueDate ASC (nulls last)
4. Return the first non-blocked result, or null if empty
```

The comparator function should be extracted and exported for testing:

```typescript
export function compareTaskPriority(a: NextActionTask, b: NextActionTask): number;
```

### 2.3. `src/server/domain/progress.ts` — CREATE

**Purpose:** Pure function to compute overall progress and counts.

**Inputs:**

```typescript
export interface ProgressInput {
  totalTasks: number;       // non-archived
  doneTasks: number;        // non-archived, status_group = 'done'
  deadline: string;         // YYYY-MM-DD from config
  timezone: string;         // e.g. "Europe/Istanbul"
  now: Date;
}

export interface ProgressResult {
  daysLeft: number;
  totalTasks: number;
  doneTasks: number;
  percent: number;          // 0-100, integer
  /** e.g. "38 / 112 görev tamamlandı · %34" */
  progressText: string;
}

export function computeProgress(input: ProgressInput): ProgressResult;
```

Also export the counts computation:

```typescript
export interface CountsInput {
  blockedCount: number;           // non-done, blocked=1
  activeNotBlockedCount: number;  // status_group='active', blocked=0
  completedThisWeekCount: number; // TASK_COMPLETED events since Monday 00:00 timezone
}

/** Returns the Monday 00:00 in the given timezone as an ISO string.
 *  Exported for testability. */
export function getMondayMidnight(now: Date, timezone: string): string;
```

**Days left calculation:**
```
const todayStr = now.toLocaleDateString('en-CA', { timeZone: timezone }); // YYYY-MM-DD
const todayMs = new Date(todayStr).getTime();
const deadlineMs = new Date(deadline).getTime();
daysLeft = Math.ceil((deadlineMs - todayMs) / 86_400_000);
```

**Monday midnight:**
```
// Get current day-of-week in timezone (0=Sun, 1=Mon, ...)
// Shift back to Monday, set time to 00:00:00 in that timezone
// Return as ISO string for SQL comparison
```

### 2.4. `src/server/queries/dashboard.ts` — CREATE

**Purpose:** Single entry point for all dashboard data. The ONLY module that touches the DB for the dashboard page. 

**Exports:**

```typescript
import type { DepartmentStatusResult, QuietSummary } from '@/server/domain/department-status';
import type { NextAction } from '@/server/domain/next-action';
import type { ProgressResult, CountsInput } from '@/server/domain/progress';
import { getReaderDb, type WriterDb } from '@/server/db/client';
import { loadConfig, type ProjectConfig } from '@/server/config';

export interface ProjectEventRow {
  id: number;
  type: string;
  departmentId: string | null;
  subjectTitle: string;
  detail: string | null;
  docType: string | null;
  source: string;
  sourceId: string;
  url: string | null;
  occurredAt: string;
  ingestedAt: string; // From raw_events
}

export interface DashboardData {
  progress: ProgressResult;
  nextAction: NextAction | null;
  counts: CountsInput;
  departments: DepartmentStatusResult[];
  quietSummary: QuietSummary;
  recentEvents: ProjectEventRow[];
  projectName: string;
  deadline: string;
  deliverable: string;
}

/**
 * DB-aware wrapper for getting dashboard data.
 * Returns null when the database file does not exist yet (empty state).
 */
export function getDashboardData(db: WriterDb | null, config: ProjectConfig): DashboardData | null {
  if (!db) return null;
  return computeDashboardData(db, config, new Date());
}

/**
 * Core query logic with injected dependencies for testability.
 */
export function computeDashboardData(db: WriterDb, config: ProjectConfig, now: Date): DashboardData {
  // Implementation below
}
```

**Implementation approach:**

```
1. Query all non-archived tasks:
   SELECT * FROM notion_tasks WHERE archived = 0

2. Compute progress:
   const doneTasks = tasks.filter(t => t.statusGroup === 'done').length;
   computeProgress({ totalTasks: tasks.length, doneTasks, deadline: config.project.deadline, timezone: config.project.timezone, now })

3. Pick next action:
   pickNextAction(tasks.filter(t => t.statusGroup !== 'done'))

4. Compute counts:
   blockedCount = tasks.filter(t => t.statusGroup !== 'done' && t.blocked === 1).length
   activeNotBlockedCount = tasks.filter(t => t.statusGroup === 'active' && t.blocked === 0).length
   mondayMidnight = getMondayMidnight(now, config.project.timezone)
   completedThisWeekCount = SELECT count(*) FROM project_events WHERE type = 'TASK_COMPLETED' AND occurred_at >= mondayMidnight

5. Compute department statuses:
   For each department in config.departments:
     deptTasks = tasks.filter(t => t.departmentId === dept.id)
     // latestActivityAt is the max of the newest project event for the dept AND the newest last_edited_time of its non-archived tasks
     latestEventAt = SELECT MAX(occurred_at) FROM project_events WHERE department_id = dept.id
     maxTaskEditedAt = MAX(deptTasks.map(t => t.lastEditedTime))
     latestActivityAt = max(latestEventAt, maxTaskEditedAt)
     computeDepartmentStatus({ departmentId: dept.id, tasks: deptTasks, latestActivityAt, staleDays: config.project.stale_days, now })
   Then computeQuietSummary(allStatuses)

6. Recent events (last 48 hours, max 5):
   SELECT p.*, r.ingested_at FROM project_events p JOIN raw_events r ON p.raw_event_id = r.id WHERE p.occurred_at >= (now - 48h) ORDER BY p.occurred_at DESC LIMIT 5

7. Return assembled DashboardData
```

### 2.5. `src/server/queries/health.ts` — NO CHANGE

Already exists and exports `computeHealth` and `getHealth`. The dashboard reuses `computeHealth` for the stale-data banner.

### 2.6. `src/components/dashboard/deadline-strip.tsx` — CREATE

**Purpose:** Project name, days left (40px), deadline & deliverable, progress bar with text, sync status.

**Props:**

```typescript
interface DeadlineStripProps {
  projectName: string;
  daysLeft: number;
  deadline: string;        // "31 Aralık 2026" — formatted by the page
  deliverable: string;
  progressText: string;    // "38 / 112 görev tamamlandı · %34"
  progressPercent: number; // 0-100
  syncStatus: {
    lastSuccessAt: string | null;
    ok: boolean;
  };
}
```

**Layout:**
- Desktop: project name top-left, sync status top-right (using `<SyncStatus>` sub-component)
- Days left: 40px font, `font-weight: 600`
- Below: deadline date, deliverable text (13px, `ink-muted`)
- Progress bar: full width, 6px height, `border-radius: 3px`, track = `rule`, fill = `progress`
- Below bar: progress text (13px, `ink-muted`)

**Sync status sub-component** (inline or in same file):
- Shows "Son senkron {relativeTimeAgo}" in `ink-muted` 13px (or "Henüz senkron yok" if `lastSuccessAt` is null)
- Relative time: use the `relativeTimeAgo` utility (§ 2.12)

### 2.7. `src/components/dashboard/next-action.tsx` — CREATE

**Purpose:** Shows the single most important next task.

**Props:**

```typescript
interface NextActionProps {
  action: {
    title: string;
    departmentId: string | null;
    departmentName: string | null;
    dueDate: string | null;    // formatted, e.g. "bugün", "3 Ekim"
    url: string;
  } | null;
}
```

**Layout:**
- Question label: "Şimdi ne yapmalıyım?" in 13px `ink-muted`
- Task title: 18px, `font-weight: 600`, clamped to 2 lines with CSS:
  ```css
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  ```
  Full title in `title` attribute.
- Wrap in `<a>` linking to the Notion URL (opens in new tab)
- Meta line: `"{WP-XX} {dept name}, {due date}"` in 13px `ink-muted`
- Empty state: "Sırada iş yok. Notion'da bir görevi devam ediyor durumuna al." in `ink-muted`

### 2.8. `src/components/dashboard/counts.tsx` — CREATE

**Purpose:** Three count numbers: blocked, completed this week, active.

**Props:**

```typescript
interface CountsProps {
  blocked: number;
  completedThisWeek: number;
  activeNotBlocked: number;
}
```

**Layout:**
- Three columns, equal width
- Each: number (18px, `font-weight: 600`) + label below (13px, `ink-muted`)
- Labels: "Tıkalı", "Bu hafta biten", "Devam"
- Blocked number uses `warning` color ONLY when > 0; otherwise `ink`
- Other numbers always use `ink`
- Desktop: sits to the right of next-action in a 2-column grid
- Mobile: full-width row of three below next-action

### 2.9. `src/components/dashboard/annunciator.tsx` — CREATE

**Purpose:** The cockpit caution/warning panel. Only loud departments get tiles.

**Props:**

```typescript
import type { DepartmentStatusResult, QuietSummary } from '@/server/domain/department-status';

interface AnnunciatorProps {
  departments: Array<DepartmentStatusResult & {
    name: string; // from config
    driveFolderId: string; // from config
  }>;
  quietSummary: QuietSummary;
}
```

**Layout:**
- Section label: "Kim ne durumda?" in 13px `ink-muted`
- Filter `departments` to loud statuses: `blocked`, `stale`, `active`
- **Tiles** in a responsive grid:
  - Desktop: auto-fill, `min(140px, 1fr)` columns
  - Mobile: 3 columns
- Each tile:
  - Border: 1px `rule`, `border-radius: 10px`, padding 12px
  - `blocked`: background `warning-tint`, text `warning`, border `warning`
  - `stale`: background `caution-tint`, text `caution`, border `caution`
  - `active`: background `panel`, small `go` dot (6px circle, absolutely positioned or inline), text `ink`
  - Content: WP id (e.g. "WP-01") in 13px `ink-muted`, department name in 15px, status word below in 13px
  - Status words: "Tıkalı" for blocked, "{n} gün sessiz" for stale, "Yolunda" for active
  - Link goes to Drive folder: `https://drive.google.com/drive/folders/${dept.driveFolderId}` (target="_blank")
  - Labels must not break mid-word (`overflow-wrap: break-word` or `hyphens: manual`)
- **Quiet summary line** below tiles:
  - Only shown if `quietSummary.text` is not empty
  - 13px, `ink-muted`, centered or left-aligned
  - Example: "9 WP başlamadı · 2 WP beklemede · 2 tamamlandı"
- If all departments are quiet (no tiles), show only the summary line

### 2.10. `src/components/dashboard/event-feed.tsx` — CREATE

**Purpose:** Last 48 hours of activity, max 5 rows on dashboard.

**Props:**

```typescript
interface EventFeedProps {
  events: Array<{
    id: number;
    type: string;
    departmentId: string | null;
    subjectTitle: string;
    detail: string | null;
    url: string | null;
    occurredAt: string;
    isNew: boolean; // true if ingestedAt > lastVisit
  }>;
}
```

**Layout:**
- Section label: "Son 48 saat" in 13px `ink-muted`
- Bordered list rows (1px `rule` bottom border), NOT cards
- Each row:
  - **New dot**: if `isNew`, a small 6px `ink` dot at the left
  - **Icon**: 16px, `ink-muted`, per event type:
    - `TASK_COMPLETED` → `Check`
    - `TASK_STARTED` → `Play`
    - `TASK_BLOCKED` → `OctagonAlert`
    - `TASK_UNBLOCKED` → `CircleCheck`
    - `DOC_CREATED` → `FilePlus`
    - `DOC_UPDATED` → `FilePen`
  - **Sentence**: composed from DESIGN.md Copy rules (Turkish):
    - `TASK_COMPLETED` → `{title} tamamlandı`
    - `TASK_STARTED` → `{title} başladı`
    - `TASK_BLOCKED` → `{title} tıkalı: {detail}` (or `{title} tıkandı` without detail)
    - `TASK_UNBLOCKED` → `{title} artık tıkalı değil`
    - `DOC_CREATED` → `Yeni belge: {title}`
    - `DOC_UPDATED` → `{title} güncellendi`
  - **Title clamping**: 2-line clamp with full text in `title` attribute
  - **Department id**: "WP-{id}" in 13px `ink-muted` (right side)
  - **Relative time**: `relativeTime(occurredAt)` in 13px `ink-muted` (right side), full ISO date in `title` attribute
  - Clicking the row opens the source URL in a new tab (if url is not null)
- Omit the "Tümünü gör" link for now.
- Empty state: "Son 48 saatte hareket yok." in `ink-muted`

### 2.11. `src/components/dashboard/stale-banner.tsx` — CREATE

**Purpose:** Full-width warning banner when sync is stale.

**Props:**

```typescript
interface StaleBannerProps {
  ok: boolean;
  lastSuccessAt: string | null; // from computeHealth
}
```

**Logic:**
- If `ok === true`, render nothing
- If `ok === false`, render a full-width banner at the very top of the page:
  - Background: `caution-tint`
  - Text: `caution` color, 13px
  - Message: If `lastSuccessAt` is null: `"Veriler henüz hiç güncellenmedi."`; otherwise `"Veriler {relativeTimeAgo} güncellendi. Senkron çalışmıyor olabilir."` where `{relativeTimeAgo}` is computed from `lastSuccessAt`.

### 2.12. `src/lib/format.ts` — CREATE

**Purpose:** Shared formatting utilities used by multiple components.

**Exports:**

```typescript
/**
 * Turkish relative time string (short form for feed rows).
 * Rules from DESIGN.md:
 * - < 1 min  → "az önce"
 * - < 60 min → "{n} dk"
 * - < 24 hr  → "{n} sa"
 * - < 48 hr  → "dün"
 * - else     → "{n} gün"
 */
export function relativeTime(isoTimestamp: string, now?: Date): string;

/**
 * Turkish relative time string for sentences (sync status, stale banner).
 * Rules:
 * - < 1 min  → "az önce"
 * - < 60 min → "{n} dk önce"
 * - < 24 hr  → "{n} sa önce"
 * - < 48 hr  → "dün"
 * - else     → "{n} gün önce"
 */
export function relativeTimeAgo(isoTimestamp: string, now?: Date): string;

/**
 * Format a YYYY-MM-DD date as Turkish: "3 Ekim", "31 Aralık 2026"
 * Includes year only if different from current year.
 */
export function formatDateTurkish(dateStr: string, now?: Date): string;

/**
 * Format deadline as Turkish: "31 Aralık, 2 uçan prototip"
 */
export function formatDeadline(deadline: string, deliverable: string): string;
```

### 2.13. `src/lib/last-visit.ts` — CREATE

**Purpose:** Client component to write the last-visit cookie and server utility to read it. Next.js Server Components cannot set cookies.

**Contents:**

```typescript
import { cookies } from 'next/headers';

export const COOKIE_NAME = 'bumin_last_visit';

/**
 * Reads the last visit timestamp from cookies.
 * Returns null if the cookie does not exist.
 * Must be called in a Server Component.
 */
export async function getLastVisit(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value ?? null;
}
```

Create a client component `src/components/dashboard/client-visit-manager.tsx`:

```typescript
'use client';
import { useEffect } from 'react';

export function ClientVisitManager() {
  useEffect(() => {
    // Write new timestamp to cookie on mount. Non-HTTP-only, 365 days max-age.
    const now = new Date().toISOString();
    const expires = new Date(Date.now() + 365 * 86400000).toUTCString();
    document.cookie = `bumin_last_visit=${now};path=/;max-age=${365 * 86400};expires=${expires};samesite=lax`;
  }, []);
  return null;
}
```

### 2.14. `src/app/page.tsx` — REWRITE

**Purpose:** Dashboard page. Server component that fetches data and renders all panels.

**Behavior:**

```typescript
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // 1. Load config safely
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    return (
      <main>
        <p className="text-warning p-4">{err instanceof Error ? err.message : 'Config error'}</p>
      </main>
    );
  }

  // 2. Read last visit from cookie
  const lastVisit = await getLastVisit();

  // 3. Get database and health status
  const db = getReaderDb();
  const health = getHealth(db);

  // 4. Get dashboard data using loaded config
  const data = getDashboardData(db, config);

  // 5. If no data (DB doesn't exist), show empty state
  if (!data) {
    return (
      <main>
        <p>Henüz veri yok. Worker'ın en az bir senkron tamamlamasını bekleyin.</p>
      </main>
    );
  }

  // 6. Mark events as new/old based on lastVisit
  const eventsWithNew = data.recentEvents.map(e => ({
    ...e,
    isNew: lastVisit ? e.ingestedAt > lastVisit : false,
  }));

  // 7. Render
  return (
    <main>
      <ClientVisitManager />
      <StaleBanner ok={health.ok} lastSuccessAt={...} />
      <DeadlineStrip ... />
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 md:gap-6">
        <NextAction ... />
        <Counts ... />
      </div>
      <Annunciator ... />
      <EventFeed events={eventsWithNew} />
    </main>
  );
}
```

**Important layout notes:**
- `<main>` has no extra padding (body already has 16/24px padding from globals.css)
- Panel gap: 16px mobile, 24px desktop (per DESIGN.md)
- Desktop layout at ≥1024px: deadline strip full width, next-action + counts in 2-column grid, annunciator full width, event feed full width
- Mobile: single column, same order

### 2.15. `src/app/globals.css` — MODIFY

**Purpose:** Add utility classes needed by dashboard components.

**Add at the end:**

```css
/* ─── Dashboard utilities ─── */

/* Progress bar */
.progress-track {
  height: 6px;
  border-radius: 3px;
  background-color: var(--color-rule);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 3px;
  background-color: var(--color-progress);
}
```

---

## 3. Test Files

### 3.1. `tests/fixtures/domain-fixtures.ts` — CREATE

**Purpose:** Shared fixtures for domain function tests.

```typescript
// Task fixtures for different department states
export const blockedDeptTasks = [
  { statusGroup: 'active' as const, blocked: 1, lastEditedTime: '2026-09-20' },
  { statusGroup: 'active' as const, blocked: 0, lastEditedTime: '2026-09-20' },
  { statusGroup: 'todo' as const, blocked: 0, lastEditedTime: '2026-09-20' },
];

export const staleDeptTasks = [
  { statusGroup: 'active' as const, blocked: 0, lastEditedTime: '2026-09-01' },
  { statusGroup: 'todo' as const, blocked: 0, lastEditedTime: '2026-09-01' },
];

export const activeDeptTasks = [
  { statusGroup: 'active' as const, blocked: 0, lastEditedTime: '2026-09-27' },
  { statusGroup: 'done' as const, blocked: 0, lastEditedTime: '2026-09-27' },
];

export const waitingDeptTasks = [
  { statusGroup: 'done' as const, blocked: 0, lastEditedTime: '2026-09-20' },
  { statusGroup: 'todo' as const, blocked: 0, lastEditedTime: '2026-09-20' },
];

export const notStartedDeptTasks = [
  { statusGroup: 'todo' as const, blocked: 0, lastEditedTime: '2026-09-20' },
  { statusGroup: 'todo' as const, blocked: 0, lastEditedTime: '2026-09-20' },
];

export const doneDeptTasks = [
  { statusGroup: 'done' as const, blocked: 0, lastEditedTime: '2026-09-20' },
  { statusGroup: 'done' as const, blocked: 0, lastEditedTime: '2026-09-20' },
];
```

### 3.2. `tests/department-status.test.ts` — CREATE

**Purpose:** Unit tests for `computeDepartmentStatus` and `computeQuietSummary`.

**Test cases:**

| # | Scenario | Expected |
|---|---|---|
| 1 | No tasks | `idle` |
| 2 | All tasks done | `done` |
| 3 | All tasks todo | `not_started` |
| 4 | Some done, rest todo | `waiting` |
| 5 | One blocked active task | `blocked` |
| 6 | Active tasks, no activity in stale_days | `stale` |
| 7 | Active tasks, recent event | `active` |
| 8 | Active tasks, no events, but recent task edit | `active` (Staleness uses max of event and edit time) |
| 9 | Mix: active non-blocked + blocked → still `blocked` (blocked wins) | `blocked` |
| 10 | Quiet summary: 3 not_started, 2 waiting, 1 done, 0 idle | `"3 WP başlamadı · 2 WP beklemede · 1 tamamlandı"` |
| 11 | Quiet summary: all loud | `""` |
| 12 | Quiet summary: 1 idle only | `"1 boşta"` |

### 3.3. `tests/next-action.test.ts` — CREATE

**Purpose:** Unit tests for `pickNextAction` and `compareTaskPriority`.

**Test cases:**

| # | Scenario | Expected |
|---|---|---|
| 1 | Empty list | `null` |
| 2 | One task with `is_next = 1` | That task |
| 3 | `is_next` task wins over higher-priority task | `is_next` task |
| 4 | No `is_next`, two active tasks, different priority | Lower `priorityRank` wins |
| 5 | Same priority, different sort_order | Lower `sortOrder` wins |
| 6 | Same priority and sort_order, different due date | Earlier due date wins |
| 7 | Null due dates sort last | Task with due date wins |
| 8 | Null priorityRank sorts last | Task with rank wins |
| 9 | Blocked tasks are skipped | First non-blocked active |
| 10 | Only todo tasks (no active) | First todo by priority |
| 11 | Active tasks always before todo tasks | Active wins over higher-priority todo |

### 3.4. `tests/progress.test.ts` — CREATE

**Purpose:** Unit tests for `computeProgress` and `getMondayMidnight`.

**Test cases:**

| # | Scenario | Expected |
|---|---|---|
| 1 | 38 done, 112 total, deadline 2026-12-31, now Sep 28 | ~94 days left, 34%, text matches |
| 2 | 0 done, 50 total | 0%, "0 / 50 görev tamamlandı · %0" |
| 3 | 50 done, 50 total | 100%, "50 / 50 görev tamamlandı · %100" |
| 4 | 0 total | 0%, "0 / 0 görev tamamlandı · %0" |
| 5 | `getMondayMidnight` on a Wednesday | Previous Monday 00:00 |
| 6 | `getMondayMidnight` on a Monday | Same day 00:00 |
| 7 | `getMondayMidnight` on a Sunday UTC / Monday Istanbul | Returns Istanbul Monday 00:00 |

### 3.5. `tests/format.test.ts` — CREATE

**Purpose:** Unit tests for `relativeTime`, `formatDateTurkish`, `formatDeadline`.

**Test cases for `relativeTime`:**

| # | Input | Expected |
|---|---|---|
| 1 | 30 seconds ago | "az önce" |
| 2 | 5 minutes ago | "5 dk" |
| 3 | 3 hours ago | "3 sa" |
| 4 | 25 hours ago | "dün" |
| 5 | 3 days ago | "3 gün" |

**Test cases for `relativeTimeAgo`:**

| # | Input | Expected |
|---|---|---|
| 1 | 30 seconds ago | "az önce" |
| 2 | 5 minutes ago | "5 dk önce" |
| 3 | 3 hours ago | "3 sa önce" |
| 4 | 25 hours ago | "dün" |
| 5 | 3 days ago | "3 gün önce" |

**Test cases for `formatDateTurkish`:**

| # | Input | Expected |
|---|---|---|
| 1 | "2026-10-03" (same year) | "3 Ekim" |
| 2 | "2027-01-15" (different year) | "15 Ocak 2027" |
| 3 | "2026-12-31" | "31 Aralık" |

### 3.6. `tests/dashboard-query.test.ts` — CREATE

**Purpose:** Integration test for `computeDashboardData` with an in-memory database.

**Setup:**
- Uses a temporary better-sqlite3 database with real migrations applied.
- Inserts mock data into `notion_tasks`, `raw_events`, `project_events`.

**Test cases:**
| # | Scenario | Expected |
|---|---|---|
| 1 | Archived tasks | Archived tasks do not count towards progress, counts, or next action. |
| 2 | 48-hour / 5-row feed limit | Feed contains only events from the last 48 hours, limited to 5 rows, sorted descending. |
| 3 | "bu hafta biten" count | Only counts `TASK_COMPLETED` events since Monday 00:00 Istanbul. |
| 4 | Seeded data with no events | A department with an active task edited yesterday shows as `active`, not `stale` (latest activity fallback to `last_edited_time`). |

---

## 4. File Summary

### New files (16)

| File | Purpose | Tested by |
|---|---|---|
| `src/server/domain/department-status.ts` | Department status computation | `tests/department-status.test.ts` |
| `src/server/domain/next-action.ts` | Next action picker | `tests/next-action.test.ts` |
| `src/server/domain/progress.ts` | Progress + counts computation | `tests/progress.test.ts` |
| `src/server/queries/dashboard.ts` | DB queries → domain functions → DashboardData | `tests/dashboard-query.test.ts` |
| `src/components/dashboard/deadline-strip.tsx` | Days left, progress bar, sync status | (visual) |
| `src/components/dashboard/next-action.tsx` | Single next action display | (visual) |
| `src/components/dashboard/counts.tsx` | Blocked, completed, active counts | (visual) |
| `src/components/dashboard/annunciator.tsx` | Department status tiles | (visual) |
| `src/components/dashboard/event-feed.tsx` | Recent events list | (visual) |
| `src/components/dashboard/stale-banner.tsx` | Stale data warning banner | (visual) |
| `src/components/dashboard/client-visit-manager.tsx` | Write last visit cookie | (integration) |
| `src/lib/format.ts` | relativeTime, formatDateTurkish | `tests/format.test.ts` |
| `src/lib/last-visit.ts` | Cookie-based last visit tracking | (integration) |
| `tests/fixtures/domain-fixtures.ts` | Shared test fixtures | — |
| `tests/format.test.ts` | Format utility tests | — |
| `tests/dashboard-query.test.ts` | Dashboard query layer tests | — |

### Modified files (4)

| File | Change |
|---|---|
| `src/app/page.tsx` | Rewrite: placeholder → real dashboard with config error handling |
| `src/app/globals.css` | Add progress-bar utilities |
| `ARCHITECTURE.md` | Update Derived logic section |
| `DESIGN.md` | Update department statuses, annunciator, progress, title clamping |

### Test files (5 new)

| File | Tests |
|---|---|
| `tests/department-status.test.ts` | 12 cases |
| `tests/next-action.test.ts` | 11 cases |
| `tests/progress.test.ts` | 7 cases |
| `tests/format.test.ts` | ~8 cases |
| `tests/dashboard-query.test.ts`| 4 cases |

---

## 5. Implementation Order

Execute in this exact sequence. Each step must pass `pnpm typecheck && pnpm lint && pnpm test` before proceeding.

### Step 1: Documentation updates
1. Update `ARCHITECTURE.md` (§1.1)
2. Update `DESIGN.md` (§1.3–1.7)
3. Run `pnpm typecheck && pnpm lint` (no code changes, just docs)

### Step 2: Format utilities
1. Create `src/lib/format.ts`
2. Create `tests/format.test.ts`
3. Run `pnpm test -- tests/format.test.ts`
4. Run full quality gate: `pnpm typecheck && pnpm lint && pnpm test`

### Step 3: Domain functions
1. Create `tests/fixtures/domain-fixtures.ts`
2. Create `src/server/domain/department-status.ts`
3. Create `tests/department-status.test.ts`
4. Run `pnpm test -- tests/department-status.test.ts`
5. Create `src/server/domain/next-action.ts`
6. Create `tests/next-action.test.ts`
7. Run `pnpm test -- tests/next-action.test.ts`
8. Create `src/server/domain/progress.ts`
9. Create `tests/progress.test.ts`
10. Run `pnpm test -- tests/progress.test.ts`
11. Run full quality gate

### Step 4: Last-visit cookie
1. Create `src/lib/last-visit.ts`
2. Create `src/components/dashboard/client-visit-manager.tsx`
3. Run `pnpm typecheck`

### Step 5: Query layer
1. Create `src/server/queries/dashboard.ts`
2. Create `tests/dashboard-query.test.ts`
3. Run `pnpm test -- tests/dashboard-query.test.ts`
4. Run `pnpm typecheck`

### Step 6: Dashboard components (one at a time)
1. Create `src/components/dashboard/stale-banner.tsx`
2. Create `src/components/dashboard/deadline-strip.tsx`
3. Create `src/components/dashboard/next-action.tsx`
4. Create `src/components/dashboard/counts.tsx`
5. Create `src/components/dashboard/annunciator.tsx`
6. Create `src/components/dashboard/event-feed.tsx`
7. Update `src/app/globals.css` (for progress bar / line-clamp)
8. Run `pnpm typecheck && pnpm lint`

### Step 7: Wire up the dashboard page
1. Rewrite `src/app/page.tsx`
2. Run full quality gate: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`

### Step 8: Visual verification with real data
1. Ensure the worker has run at least once with real data (§0)
2. Start the dev server: `pnpm dev`
3. Open the dashboard in the browser subagent
4. Take screenshots at all 4 combinations:
   - 1280px wide, light mode
   - 1280px wide, dark mode
   - 390px wide, light mode
   - 390px wide, dark mode
5. Run DESIGN.md → Review checklist against each screenshot (see §6 below)
6. Fix any failures, re-screenshot, re-check

### Step 9: Update HANDOFF.md
1. Rewrite HANDOFF.md with Phase 3 completion status.
2. Note that `/departman/[id]` and `/aktivite` are dead links until Phase 6 (Annunciator temporarily points to Drive, Event Feed omits "Tümünü gör").

---

## 6. Visual Verification Checklist

For each of the 4 screenshot combinations (1280px light, 1280px dark, 390px light, 390px dark), verify:

| # | Check | How to verify |
|---|---|---|
| 1 | **Five-second test** | Can you answer: days to deadline, next action, who is stuck, what changed — all from the screenshot? |
| 2 | **Only problem tiles are colored** | Active WPs have neutral tiles with green dots. Only blocked (red) and stale (amber) tiles have colored backgrounds. Quiet WPs are in the summary line. |
| 3 | **At most 5 feed rows** | Count the rows in the event feed |
| 4 | **No text below 13px** | Inspect smallest text |
| 5 | **No "never show" items** | No file IDs, page IDs, MIME types, raw status keys, English enums, ISO timestamps, JSON, stack traces, "undefined", "null" |
| 6 | **Every colored state has a word** | Blocked tiles say "Tıkalı", stale tiles say "N gün sessiz", active tiles say "Yolunda" |
| 7 | **No horizontal scroll on mobile** | 390px screenshots have no horizontal overflow |
| 8 | **Tile labels don't break mid-word** | Check WP names on mobile tiles |
| 9 | **Sync status visible** | "Son senkron N dk önce" is visible in the deadline strip |
| 10 | **Stale banner test** | If `ok: false`, the caution banner is visible. Manually test by stopping the worker for > 30 min or by temporarily forcing the timestamp. |
| 11 | **Dark mode fully readable** | All text has sufficient contrast, no invisible elements |
| 12 | **Task titles clamped** | Long titles in next-action and feed are clamped to 2 lines, full title in `title` hover |
| 13 | **New-event dots** | Events ingested newer than last visit have a small dot (verify by checking cookie behavior) |
| 14 | **Progress bar shows correct fill** | The bar width corresponds to the done/total percentage |
| 15 | **Quiet summary line present** | If any WPs are waiting, not_started or done, the summary line appears below the tiles |

---

## 7. Done When

All of the following must be true before Phase 3 is complete:

| # | Criterion | Verification command / method |
|---|---|---|
| 1 | `pnpm typecheck` passes | `pnpm typecheck` |
| 2 | `pnpm lint` passes | `pnpm lint` |
| 3 | `pnpm test` passes (all tests including new domain & query tests) | `pnpm test` |
| 4 | `pnpm build` passes | `pnpm build` |
| 5 | Domain tests: `department-status.test.ts` has ≥12 passing tests | `pnpm test -- tests/department-status.test.ts` |
| 6 | Domain tests: `next-action.test.ts` has ≥11 passing tests | `pnpm test -- tests/next-action.test.ts` |
| 7 | Domain tests: `progress.test.ts` has ≥7 passing tests | `pnpm test -- tests/progress.test.ts` |
| 8 | Domain tests: `format.test.ts` has ≥8 passing tests | `pnpm test -- tests/format.test.ts` |
| 9 | Query layer tests: `dashboard-query.test.ts` has ≥4 passing tests | `pnpm test -- tests/dashboard-query.test.ts` |
| 10 | Dashboard renders with real data at 1280px (light + dark) | Browser screenshots |
| 11 | Dashboard renders with real data at 390px (light + dark) | Browser screenshots |
| 12 | DESIGN.md Review checklist passes on all 4 screenshots | Manual check per §6 |
| 13 | ARCHITECTURE.md Derived logic section updated | Visual diff |
| 14 | DESIGN.md updated (status words, annunciator, progress, title clamping) | Visual diff |
| 15 | HANDOFF.md rewritten with Phase 3 status | File exists and is current |
| 16 | No mock data in production code paths | Grep for `mock`, `fixture`, `fake` in `src/` |
| 17 | Empty state works when DB is missing | Delete `data/app.db`, load page, see empty state message |
| 18 | Config error is shown gracefully when loadConfig() fails | Force an invalid yaml file, load page, see error text |
| 19 | Stale banner appears when health is not ok | Stop worker > 30 min or forge old timestamp, reload page |
| 20 | Last-visit cookie is set by client and read by server correctly | Open DevTools → Application → Cookies → check `bumin_last_visit` |

---

## 8. Constraints & Reminders

- **UI code never imports from `src/server/integrations/`**. Pages import from `src/server/queries/` only.
- **Domain functions are pure** — no DB, no IO, no Date.now(). Inject `now: Date` for testability.
- **`src/server/queries/dashboard.ts`** is the only file that imports both domain functions and DB client. It assembles everything.
- **Config values** (department names, deadline, deliverable, stale_days, timezone) come from `config/project.yaml` via `loadConfig()`. Never hardcode them.
- **Turkish copy** in the UI. English in code, comments, docs.
- **Color means status, nothing else.** Never use status colors for decoration.
- **No gradients, no shadows, no glassmorphism.** Flat surfaces, 1px borders.
- **Use `next/font`** — Atkinson Hyperlegible Next is already configured in `layout.tsx`.
- **`font-variant-numeric: tabular-nums`** is already set in `globals.css` on `html`.
- If any quality gate check fails and cannot be fixed, record it in HANDOFF.md → Known issues. Never silence a check.
