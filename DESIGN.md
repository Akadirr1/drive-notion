# DESIGN.md

How the dashboard must look and read. This file is the authority for UI work. Do not improvise a different style.

## Brief

One user: the engineering lead of a drone project, with limited attention. He opens the page between tasks, often on his phone, and needs the answer before his attention drifts. The target is five seconds from page load to knowing: where we are, what to do now, who is stuck, what changed.

## The one idea: an annunciator panel

Aircraft cockpits have a caution/warning annunciator: a grid of labeled lamps that stay quiet when everything is fine and light up amber or red only when something needs attention. A pilot reads it in one glance.

The department panel is our annunciator, and it is the only visually loud element on the page:

- Departments that are fine stay quiet: neutral tile, small green dot.
- Stale departments light up amber. Blocked departments light up red.
- Everything else on the page is quiet grayscale.

If nothing is wrong, the page is calm. Only problems light up.

## Tokens

Define these as CSS variables in the Tailwind v4 theme. Dark mode follows `prefers-color-scheme`.

| Token | Light | Dark | Use |
|---|---|---|---|
| `ground` | `#F4F6F8` | `#12171C` | page background |
| `panel` | `#FFFFFF` | `#1A2027` | tiles, rows |
| `rule` | `#DDE2E7` | `#2A323A` | 1px borders |
| `ink` | `#1A2128` | `#E6EAEE` | primary text |
| `ink-muted` | `#5A6570` | `#9AA5AF` | secondary text, meta |
| `go` | `#1F8F4E` | `#3FBF74` | ok dot, completed icon |
| `caution` | `#8A5A00` | `#F2B233` | stale text |
| `caution-tint` | `#FFF1CC` | `#3A2E10` | stale tile fill |
| `warning` | `#B42323` | `#FF6B6B` | blocked text |
| `warning-tint` | `#FDE4E4` | `#3D1A1A` | blocked tile fill |
| `progress` | `#2F66D0` | `#6B9BFF` | deadline progress bar only |

Rules:
- Color means status, nothing else. Never use status colors for decoration, headings or links.
- Every colored state also has a word ("Tıkalı", "4 gün sessiz"). Color is never the only signal.
- No gradients, no shadows, no glassmorphism. Flat surfaces, 1px `rule` borders.

Typography:
- One family: Atkinson Hyperlegible Next (Google Fonts via `next/font`), fallback `system-ui, sans-serif`. It was designed for legibility, which is the whole point here.
- Weights: 400 and 600 only.
- Numbers use `font-variant-numeric: tabular-nums`.
- Scale: 13px meta, 15px body, 18px panel content (next action, tile labels), 40px days-left number.
- Body line-height 1.45. No line longer than about 75 characters.
- Sentence case everywhere. No all caps, no letter-spaced labels.

Shape and spacing:
- 4px base unit. Gap between panels: 16px mobile, 24px desktop.
- Radius: 10px for tiles and panels, 6px for small controls.
- Page max width 1080px, left aligned.

## Layout

Desktop (≥1024px):

```
┌──────────────────────────────────────────────────────────────┐
│ BUMIN-2                               Son senkron 3 dk önce  │
│ 95 gün kaldı                  31 Aralık, 2 uçan prototip     │
│ ▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░  38 / 112 görev tamamlandı · %34       │
├────────────────────────────────┬─────────────────────────────┤
│ Şimdi ne yapmalıyım?           │  Tıkalı    Biten    Devam   │
│ WP-01.7b — GCS mimarisi: Mod   │    2         5        7     │
│ A… (iki satır, title'da tam)   │       (bu hafta biten)      │
│ WP-01 Avionik, bugün           │                             │
├────────────────────────────────┴─────────────────────────────┤
│ Kim ne durumda?                                              │
│ [00 •] [01 •] [02 4 gün sessiz] [03 Tıkalı] [04 •] [YH •]    │
├──────────────────────────────────────────────────────────────┤
│ Son 48 saat                                                  │
│ ✓  GNSS RTK entegrasyonu tamamlandı            01   3 sa     │
│ +  Yeni belge: Hover test raporu v1            03   8 sa     │
│ !  Titreşim testi tıkalı: şase bekleniyor      03   dün      │
│                                               Tümünü gör     │
└──────────────────────────────────────────────────────────────┘
```

Mobile (390px): one column, same order. Counts become a row of three. Annunciator tiles in a 2-column grid.

Each panel has at most one small muted label, phrased as the question it answers. No other labels above content.

## Components

One file each under `src/components/dashboard/`:

- `deadline-strip` — project name, days left (40px), deadline and deliverable, progress bar with milestone text, sync status on the right.
- `next-action` — one task title (18px, clamped to 3 lines on mobile, 2 lines on desktop), department and due date as meta. Clicking opens the Notion page.
- `counts` — blocked, completed this week, active. Blocked number uses `warning` only when above zero.
- `annunciator` — one tile per loud department (blocked, stale, active). Tile: WP id and name (wrapping up to 3 lines without truncation on mobile), status word. Clicking goes to the WP's Drive folder in a new tab. All quiet departments (waiting, not_started, done, idle) collapse into one muted summary line below the tiles (idle counted together with not_started as "başlamadı", e.g. "15 WP başlamadı · 1 WP beklemede · 2 tamamlandı"). If all departments are quiet, no tiles are shown, only the summary.
- `event-feed` — max 5 rows on the dashboard. Rows are bordered list rows, not cards. Icon, sentence, department id, relative time. Clicking opens the source in a new tab.
- `sync-status` — "Son senkron N dk önce". See stale data below.

Use shadcn primitives (Button, Tooltip, Badge, Separator) for building blocks. Do not wrap every section in a Card with a shadow.

Icons (lucide): `check` completed, `play` started, `octagon-alert` blocked, `circle-check` unblocked, `file-plus` doc created, `file-pen` doc updated. 16–18px, `ink-muted` except status icons.

## Behavior

- Rows newer than the last visit get a small `ink` dot at the start. Store the last visit time in a cookie, updated on each dashboard view.
- No animations in v1. Respect `prefers-reduced-motion` anyway.
- Task titles in the next-action panel are clamped to 3 lines on mobile (<768px) and 2 lines on desktop (`line-clamp-3 md:line-clamp-2`), with the full title in the `title` attribute. Event feed sentences are clamped to two lines. Never truncate titles in the data layer.
- Stale data: if `/api/health` reports `ok: false`, show a full-width `caution` banner at the very top. One sentence per failing implemented source, joined with a space (e.g. "Drive henüz hiç senkron olmadı." or "Notion senkronu çalışmıyor. Son başarı: 2 sa önce."). The sync status shows the oldest non-null lastSuccessAt among implemented sources; a never-synced source is reported only by the banner. The user must never mistake old data for current data.

## Copy

UI language is Turkish. Plain words, short sentences, sentence case.

Event sentences (composed in the UI from structured event fields):

| Type | Sentence |
|---|---|
| `TASK_COMPLETED` | `{görev} tamamlandı` |
| `TASK_STARTED` | `{görev} başladı` |
| `TASK_BLOCKED` | `{görev} tıkalı: {neden}` (or `{görev} tıkandı` without a note) |
| `TASK_UNBLOCKED` | `{görev} artık tıkalı değil` |
| `DOC_CREATED` | `Yeni belge: {dosya adı, uzantısız}` |
| `DOC_UPDATED` | `{dosya adı, uzantısız} güncellendi` |

Department status words:
- `blocked` → "Tıkalı"
- `stale` → "{n} gün sessiz"
- `active` → "Yolunda"
- `waiting` → (quiet, in summary line)
- `not_started` → (quiet, in summary line)
- `done` → (quiet, in summary line)
- `idle` → (quiet, counted with not_started as "başlamadı" in summary line)

Sync status & stale banner:
- Sync status: "Son senkron {relativeTimeAgo}" (oldest non-null `lastSuccessAt` across implemented sources).
- Stale banner: one sentence per failing implemented source, joined with a space:
  - Failing with prior success: `"{Source} senkronu çalışmıyor. Son başarı: {relativeTimeAgo}."` (e.g. `"Notion senkronu çalışmıyor. Son başarı: 2 sa önce."`)
  - Never synced: `"{Source} henüz hiç senkron olmadı."` (e.g. `"Drive henüz hiç senkron olmadı."`)
  - No combined `"Notion ve Drive"` forms.

Relative time: "az önce", "12 dk", "3 sa", "dün", "3 gün". Full date in the `title` attribute.

Empty states:
- Next action: "Sırada iş yok. Notion'da bir görevi devam ediyor durumuna al."
- Feed: "Son 48 saatte hareket yok."
- Missing config value: say which value is missing and in which file.

Never show: file IDs, page IDs, MIME types, raw status keys, English enum names, ISO timestamps, JSON, stack traces, "undefined", "null".

## Review checklist

Run after every UI change on screenshots at 1280px and 390px, light and dark:

1. Five-second test: from the screenshot alone, can you answer where we are, what to do now, who is stuck, what changed?
2. Only problem tiles are colored. Healthy departments are quiet.
3. At most 5 feed rows on the dashboard.
4. No text below 13px. No line longer than about 75 characters.
5. None of the "never show" items are visible anywhere.
6. Every colored state also has a word.
7. No horizontal scroll on mobile. Tile labels do not break mid-word.
8. Sync status is visible. The stale banner appears when the last sync time is forced older than 30 minutes.
9. Dark mode is fully readable.
