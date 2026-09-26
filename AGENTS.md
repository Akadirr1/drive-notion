# AGENTS.md

Permanent rules for every coding agent in this repository, planner and implementers alike.
Never assume previous chat context exists. The repository must carry all the context needed to continue.

## Read first

1. `AGENTS.md` (this file)
2. `ARCHITECTURE.md` — how the system works, schema, build phases
3. `DESIGN.md` — how the UI must look and read
4. `HANDOFF.md` — where development currently stands

Then read the code you are about to touch.

## Product

A self-hosted, single-user tracking dashboard for the BUMIN-2 multirotor UAV project.
It turns Notion task data and Google Drive activity into one screen that answers, in about five seconds:

1. Where are we? (days to deadline, milestone progress)
2. What should I do now? (exactly one next action)
3. Who is stuck? (department status)
4. What changed? (last 48 hours)

The user has limited attention. Every panel answers exactly one question.
A panel that needs careful reading to be understood is not done, even if it is technically complete.

This is not a file manager, not a Drive clone, not a project management tool. The app never edits Drive or Notion.

## Sources of truth

- Notion: tasks and their status. Everything about done / active / blocked / next action comes from here.
- Google Drive: department records and documents. Evidence and activity, not status.
- SQLite: derived state only (snapshots, events, sync cursors). It can be deleted and rebuilt by a fresh sync.

## Hard boundaries

- Integrations are read-only. Drive scope is `drive.readonly`; the Notion integration has read-content capability only. Never add write calls.
- Only the worker process writes to the database. The web app only reads, through `src/server/queries/`.
- UI code never imports from `src/server/integrations/`. Pages consume query results and normalized project events, never Drive or Notion payloads.
- One client per integration: `src/server/integrations/drive/client.ts` and `src/server/integrations/notion/client.ts`. Never create a second one.
- One normalizer: `src/server/events/normalize.ts`. Never create a parallel event system.
- Drive file IDs and Notion page IDs are identity. Never key anything on file names or paths.
- Project-specific values (department names, Drive folder IDs, Notion property names, status values, deadline, milestones) live only in `config/project.yaml`. Never hardcode them.
- Secrets live only in environment variables. Never commit them. `.env.example` lists names without values.

## Events

Raw integration changes (`raw_events`) and semantic project events (`project_events`) are separate concepts.
The closed list of semantic event types:

- `TASK_STARTED`
- `TASK_COMPLETED`
- `TASK_BLOCKED`
- `TASK_UNBLOCKED`
- `DOC_CREATED`
- `DOC_UPDATED`

Document kind (report, test, decision, other) is an attribute (`doc_type`), not a separate event type.
Adding an event type requires, in the same change, an ARCHITECTURE.md update and a real UI use for it.

## Stack and dependencies

The stack is fixed: see `ARCHITECTURE.md` → Stack. Do not swap any part of it.

Add a dependency only when it solves a concrete current problem that nothing in the stack already solves. State the reason in the commit message.

Never add: Postgres, Redis, message queues, ORMs other than Drizzle, auth libraries, global state libraries, CSS-in-JS, chart libraries (v1 has no charts), analytics, AI SDKs.

Authentication is handled by Cloudflare Access in front of the app. The app itself has no login.

## Workflow

- Work one build phase at a time (`ARCHITECTURE.md` → Build phases). Do not start the next phase until the current one meets its "done when".
- Planner: before implementation, produce a plan that lists the files to create or change and names the existing abstraction each change extends.
- Implementer: follow the plan. If you must deviate, write why in `HANDOFF.md` → Important context.
- Before creating a new module, search the repository for one that already owns that responsibility.
- Use the Context7 MCP for current docs of Next.js, Tailwind CSS v4, Drizzle, `@notionhq/client` and `googleapis`. Do not rely on memory; these APIs change.
- Use the shadcn MCP to add UI primitives. Do not hand-write components shadcn already provides.

## Quality gate

A task is complete only when all of these pass:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm build`

For any UI change, additionally:

- Open the page with the browser subagent at 1280px and 390px widths and take screenshots.
- Check the screenshots against `DESIGN.md` → Review checklist. Fix every failure before reporting done.

Pure logic (normalizer, department status, next action, progress, config parsing) must have unit tests with fixtures.
Never silence a failing check. If something cannot be fixed now, record it in `HANDOFF.md` → Known issues.

## No fake completeness

- No mock data in production code paths. Fixtures live only under `tests/fixtures/`.
- No placeholder panels that look finished but are not wired to real data. An unwired or empty panel shows a clear empty state.
- If sync is failing or data is older than 30 minutes, the UI must say so (see `DESIGN.md`).

## Non-goals (do not build)

Editing Drive or Notion, multi-user accounts, notifications, email, AI summaries, file previews, full-text search, generic project templates, a settings UI (configuration is a file).

## Documentation

- `ARCHITECTURE.md`: update when architecture, schema or event types change.
- `DESIGN.md`: update when a design rule changes. Code and DESIGN.md must not drift apart.
- `HANDOFF.md`: rewrite at the end of every meaningful session. Short and current, never an append-only history. Sections: Current state, Completed, In progress, Known issues, Next recommended step, Important context.
- `CHANGELOG.md`: user-visible changes only.

## Language

Code, comments, commit messages and docs: English.
UI copy: Turkish (see `DESIGN.md` → Copy).

## Deployment

Docker Compose: one image, two services (`web`, `worker`), one volume for SQLite.
Runs on the owner's self-hosted Coolify. Public hostname `bumin.akadir.tech`, behind Cloudflare Access.
Production must never depend on a developer machine.
