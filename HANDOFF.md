# Current state

Phase 0 (Scaffold) is complete. The app skeleton runs, all quality-gate checks pass, and the config loader is tested.

## Completed

- Next.js 16.3.6 scaffold with TypeScript strict, Tailwind CSS v4, shadcn/ui.
- Drizzle ORM, Vitest, ESLint installed and configured.
- `better-sqlite3` native addon verified (`pnpm.onlyBuiltDependencies`).
- Design tokens from DESIGN.md wired into Tailwind v4 `@theme inline`; Tailwind generates `bg-ground`, `text-ink`, `border-rule`, etc.
- shadcn semantic variables (`background`, `foreground`, `card`, `border`, `input`, `muted-foreground`, `ring`, `radius`) mapped to DESIGN.md tokens.
- Dark mode via `prefers-color-scheme`, not `.dark` class.
- Atkinson Hyperlegible Next font loaded via next/font/google.
- `config/project.example.yaml` with placeholder values.
- `src/server/config.ts`: zod schema + loadConfig(), validates against project.yaml.
- Three unit tests for config loading: example passes; missing field and wrong type fail with readable messages.
- `.env.example` with all env var names.
- Six package.json scripts (dev, build, start, typecheck, lint, test). `engines.node >= 24`.
- shadcn Button installed and verified to render with DESIGN.md token colors.
- Single page: "Pano henüz hazır değil" — no fake panels.

## In progress

- Nothing.

## Known issues

- None.

## Next recommended step

Phase 1: Database and worker skeleton — schema, migrations, sync loop with sync_state, /api/health, worker script.

## Important context

- The owner fills `config/project.yaml` before Phase 2: Notion tasks data source ID and property names, Drive root folder ID, department folder IDs, milestones.
- Before Phase 2: connect the Notion integration to the tasks database with read-content capability only.
- Before Phase 4: share the BUMIN Drive root folder with the Google service account email as Viewer.
