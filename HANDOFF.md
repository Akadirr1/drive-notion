# Current state

Phase 3 (Dashboard v1 on Notion Data) is complete on branch `feat/phase-3-dashboard`. The single-screen dashboard is live, wired to real Notion data in SQLite. All pure domain logic (department status, next action, progress, counts), query layer, six dashboard components, stale data banner, client visit manager cookie, Turkish grammar in sentences (`relativeTime` / `relativeTimeAgo`), and design system tokens are implemented and fully unit-tested (122 tests passing across 10 test suites). All quality gate checks pass cleanly.

## Completed

- **Domain logic (`src/server/domain/`)**:
  - `department-status.ts`: pure function computing 7 department states (`blocked`, `stale`, `active`, `waiting`, `not_started`, `done`, `idle`) in priority order with activity fallback (`max(latest_event_at, max_last_edited_time)`), plus `computeQuietSummary` for collapsed quiet departments ("{n} WP başlamadı · {k} WP beklemede · {m} tamamlandı").
  - `next-action.ts`: picks the single highest-priority non-done task (`is_next = 1` first, else active non-blocked by `priority_rank`, `sort_order`, `dueDate`, else todo tasks with the same ordering).
  - `progress.ts`: calculates days left to deadline in project timezone, completion percentage, progress text ("{done} / {total} görev tamamlandı · %{percent}"), and Monday 00:00 midnight in project timezone for weekly counts.
- **Formatting utilities (`src/lib/format.ts`)**:
  - `relativeTime`: short form for event feeds ("az önce", "12 dk", "3 sa", "dün", "3 gün").
  - `relativeTimeAgo`: sentence form for sync status and stale banner ("az önce", "12 dk önce", "3 sa önce", "dün", "3 gün önce").
  - `formatDateTurkish`: Turkish month and date formatting without year if in the same year.
  - `formatDeadline`: Turkish formatted deadline with deliverable ("31 Aralık, 2 uçan prototip").
- **Query layer (`src/server/queries/dashboard.ts`)**:
  - `computeDashboardData(db: WriterDb, config: ProjectConfig, now: Date)`: executes all SQLite reads for non-archived tasks, recent events (last 48 hours, limit 5), weekly completed count, and department statuses.
  - `getDashboardData(db: WriterDb | null, config: ProjectConfig)`: safe wrapper returning null if DB client is null.
- **Dashboard UI components (`src/components/dashboard/`)**:
  - `deadline-strip.tsx`: project name, days left (40px font), deadline & deliverable, 6px progress bar, sync status indicator.
  - `next-action.tsx`: "Şimdi ne yapmalıyım?", 2-line clamped task title with full title on hover, Notion link, meta subtitle, empty state.
  - `counts.tsx`: 3-column metric display for "Tıkalı" (red warning only when > 0), "Bu hafta biten", "Devam".
  - `annunciator.tsx`: "Kim ne durumda?", loud tiles (blocked, stale, active with green dot), links to Google Drive folders, collapsed quiet summary line below.
  - `event-feed.tsx`: "Son 48 saat", bordered list rows with new event dot (based on cookie), Lucide icons, Turkish event sentences, WP id, relative time.
  - `stale-banner.tsx`: full-width caution banner when sync health `ok: false` ("Veriler {relativeTimeAgo} güncellendi. Senkron çalışmıyor olabilir.").
  - `client-visit-manager.tsx`: non-HTTP-only cookie `bumin_last_visit` set on mount.
- **Dashboard page (`src/app/page.tsx`)**:
  - Server Component assembling all panels with `force-dynamic`. Gracefully renders error message if config fails to parse, and empty state if database file does not exist yet.
- **Design system & tokens (`src/app/globals.css`, `layout.tsx`)**:
  - Atkinson Hyperlegible Next font configured. Light and dark modes with exact tokens from `DESIGN.md`. Progress bar track/fill and 2-line clamp utilities.
- **Documentation updates**:
  - `ARCHITECTURE.md`: updated Derived logic section with 7 department statuses, annunciator loud/quiet rules, next action ordering, progress and counts.
  - `DESIGN.md`: updated department status words, annunciator description, progress layout, counts layout, and 2-line task title clamping rule.
  - `docs/plans/phase-3.md`: updated with Amendments A and B.
- **Quality gate & visual verification**:
  - Full suite passes: `pnpm typecheck`, `pnpm lint`, `pnpm test` (122 tests), `pnpm build`.
  - Visual verification with real Notion data at 1280px and 390px in light and dark modes passed against the `DESIGN.md` review checklist.

## In progress

- None. Phase 3 is complete.

## Known issues

- Next.js Turbopack build logs 3 font fallback override warnings for `Atkinson Hyperlegible Next` (font loads and renders properly in browser).

## Next recommended step

1. Merge `feat/phase-3-dashboard` into `main`.
2. Proceed to Phase 4: Google Drive Integration & Sync.

## Important context

- `/departman/[id]` and `/aktivite` are dead links until Phase 6; Annunciator tiles temporarily link to each department's Google Drive folder, and the Event Feed temporarily omits the "Tümünü gör" link.
- `bumin_last_visit` cookie marks feed events with a black dot if they were ingested after the user's previous visit.
- The web app never writes to SQLite; it only reads via `src/server/queries/dashboard.ts` and `src/server/queries/health.ts`.
- Phase 1 change in `src/server/db/client.ts`: `getReaderDb()` checks file existence before returning the cached reader instance, and explicitly closes the old SQLite connection (`readerDb.$client.close()`) if the database file has disappeared from disk.
- Event feed timestamp tooltips use `formatDateTimeTurkish` ("27 Eylül 14:32") in the project timezone rather than raw ISO timestamps per `DESIGN.md`. Dark mode strictly follows `prefers-color-scheme`.

