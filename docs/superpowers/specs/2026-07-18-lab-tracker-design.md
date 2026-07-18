# Lab Tracker — `/tests` page redesign

**Status:** Design approved 2026-07-18
**Supersedes:** the "Tests screenshot page" feature (screenshot stash on `/tests`)

## Goal

Turn the health-log `/tests` page from a screenshot stash into a **structured
lab-results tracker**. Results are copy-pasted from the Estonian health portal,
persisted in Supabase, and shown as a per-analyte trend graph and a comparison
table. Inspired by the standalone `keeksrit-org/lab_tracker.html` reference tool,
but trimmed to what this single-user app needs.

Screenshots are dropped entirely: the gallery/lightbox UI and the
`test-screenshots` Storage bucket usage are removed.

## Non-goals (YAGNI — explicitly dropped)

- Excel upload / historical backfill — **paste-only going forward**.
- Biohäkk "optimal" reference ranges — use the portal's `ref` per result.
- Claude-generated analyte description dictionary — descriptions are user-authored.
- Time-of-day chart.
- PDF export.

Out of scope but not blocked for later: connecting events/ref bands to the
Medications data (like the sports-hub sleep/training cross-schema bands).

## Data model (Supabase `health` schema)

Normalized: sessions + results, plus two small support tables. Migration
`migrations/2026-07-18-lab-tracker.sql`.

```
lab_sessions
  id           uuid pk default gen_random_uuid()
  sample_id    text UNIQUE NOT NULL      -- portal "Proovinõu ID" = dedup key
  material     text                      -- "SEERUM"
  taken_at     timestamptz NOT NULL      -- "Võetud"
  created_at   timestamptz default now()

lab_results
  id           uuid pk default gen_random_uuid()
  session_id   uuid NOT NULL references lab_sessions(id) on delete cascade
  analyte      text NOT NULL             -- "Analüüs"
  result_raw   text NOT NULL             -- verbatim "Tulemus" ("<0.10", "Negatiivne")
  result_num   double precision          -- parsed number, NULL for qualitative
  unit         text                      -- "Ühik"
  ref          text                      -- verbatim "Ref.väärtus" ("2.0-4.5", "<5")
  ref_min      double precision          -- parsed low bound, NULL if none
  ref_max      double precision          -- parsed high bound, NULL if none
  verdict      text                      -- "Tulemuse tõlgendus" (Negatiivne/Keskmine/Kõrge)

lab_analyte_descriptions
  analyte      text pk
  description  text

lab_events
  id           uuid pk default gen_random_uuid()
  name         text NOT NULL
  event_date   date NOT NULL
  color        text
```

**Design notes:**
- `result_raw` + `result_num` and `ref` + `ref_min`/`ref_max` follow the same
  raw-plus-parsed philosophy: keep verbatim text for display fidelity (Table +
  tooltip), store parsed numbers for the chart geometry so nothing is re-parsed
  at render time.
- `sample_id` UNIQUE is the bullet-proof dedup key.
- `on delete cascade` so deleting a session removes its results.

**Grants (RLS-only single-user model — the recurring gotcha):**
- All four tables: `grant select, insert, delete ... to authenticated` + RLS
  policies restricting to `auth.role() = 'authenticated'`.
- **Plus `grant update`** on `lab_analyte_descriptions` and `lab_events` — both
  are edited in place. Postgres checks grants before RLS, so omitting `update`
  causes "permission denied" on every edit.
- `lab_sessions` / `lab_results` are insert-or-delete only (re-import replaces,
  never updates) → no `update` grant needed.

## Paste parsing & import

### Pure module `src/lib/labParse.ts` (unit-tested)

```ts
interface ParsedResult {
  analyte: string; result_raw: string; result_num: number | null
  unit: string | null; ref: string | null
  ref_min: number | null; ref_max: number | null
  verdict: string | null
}
interface ParsedSession {
  sample_id: string; material: string | null; taken_at: string // ISO
  results: ParsedResult[]
}
export function parseSession(text: string): ParsedSession   // throws on missing sample_id / taken_at
```

Walks the pasted lines:
- **Metadata line** `Proovimaterjal: SEERUM, Proovinõu ID: L26070702301, Võetud: 07.07.2026 15:13`
  → `material`, `sample_id`, `taken_at`. Reuse `parseLocalDateTime` from
  `nutritionCsv.ts` for `DD.MM.YYYY HH:MM` → local date.
- Skip the restated `Seerum - 07.07.2026 15:13` header line.
- **Analyte rows** tab-separated `Analüüs · Tulemus · Ühik · Ref.väärtus`:
  parse `result_num` from `Tulemus` (comma-decimal aware; `<`/`>` prefixes →
  `result_num` null) and `ref_min`/`ref_max` from `Ref.väärtus`.
- A following **`Tulemuse tõlgendus: <verdict>`** line attaches its verdict to
  the just-parsed result.

**Ref parsing** (moved from the reference tool's regex into `labParse.ts`):

| Raw `ref` | `ref_min` | `ref_max` | Band |
|---|---|---|---|
| `2.0-4.5` | 2.0 | 4.5 | full band |
| `<5` | null | 5 | bottom → 5 |
| `>1` | 1 | null | 1 → top |
| qualitative / empty | null | null | no band |

### Import modal UX (rewritten `Tests.tsx`)

Replaces the screenshot dropzone.
- **Top:** paste `<textarea>`. On paste/change → `parseSession`.
- **Bottom:** live **feedback log**, one row per pasted session showing
  `taken_at · material · N analytes`, with a **dedup flag** when `sample_id`
  already exists (in the DB or earlier in this batch). Parse failures append a
  red error row and are not queued.
- Sessions accumulate in component state across multiple pastes.
- **Done** → save all queued, non-duplicate sessions, then close + reload.

### Save path (`src/lib/lab.ts`)

Per session: insert `lab_sessions` row, then bulk-insert its `lab_results` with
the returned `session_id`. Dedup enforced twice: UI skips known `sample_id`s;
DB `UNIQUE(sample_id)` is the backstop (a duplicate insert is caught and
reported, never aborts the batch — same "collect failures, never abort" stance
as the CSV importer).

## Views on `/tests`

A top toggle switches **Graph** ⇄ **Table** (local state, default Graph). Both
read the same data via `src/lib/lab.ts` `fetchSessions()` (sessions with nested
results, newest-first). Page reuses the Nutrition **wide-breakout** CSS pattern
(`position:fixed; width:min(100vw,1290px); overflow:auto`).

### Table view (comparison matrix)
- Rows = analytes, columns = sessions (dates), newest-left. Cell = `result_raw`
  + unit.
- Out-of-range numeric cells (outside `ref_min`/`ref_max`) tinted red;
  qualitative cells tinted by verdict.
- Cell tooltip: raw `ref` + portal `verdict`. Analyte row label shows its
  Settings description (in tooltip).
- Wide matrix scrolls within the breakout width.

### Graph view (per-analyte trends)
- One chart card per analyte with **≥1 numeric result** (`result_num != null`).
- Purely qualitative analytes (no number) get a compact **verdict-dot strip**
  (dots colored by verdict over time) instead of a line — nothing is dropped.
- Charts drawn by hand-rolled SVG via pure `src/lib/labChart.ts`:
  - `<polyline>` + `<circle>` over time (x = `taken_at`, y = `result_num`)
  - `<rect>` ref band from `ref_min`/`ref_max` (one-sided → runs to axis edge)
  - point color: green in-band, red out
  - vertical event `<line>`s from `lab_events` at their `event_date`, across
    every chart
  - `<title>` tooltips per point (`date · value · verdict`)
- `labChart.ts` is pure geometry (`scalePoints`, `refBandRect`, `eventLinesX`,
  nice-number y-ticks) → unit-tested; `Tests.tsx` maps output to SVG.

## Settings additions

Two new composed sections on `/settings` (following the units / food-types
section pattern).

### 1. Analyte descriptions
- `name | description` editor over `lab_analyte_descriptions`.
- Manual inline add/edit/delete **and** a CSV round-trip reusing the
  `nutritionCsv.ts` machinery: **⬇ Export** (`analyte,description`, no id column
  — `analyte` is the natural pk) + id-matched sync import keyed on `analyte`.
- Descriptions surface in both views' tooltips. Separate from the portal
  verdict: descriptions explain *what the analyte is*, verdicts say *how a
  result read*.
- Data layer: `src/lib/labDescriptions.ts` + `useLabDescriptions` shared-cache
  hook (mirrors `useUnits`/`useFoodTypes`). Editing uses the `update` grant.

### 2. Events
- `name | date | color` editor over `lab_events`.
- Add/edit/delete with a curated color swatch picker (reuse `foodTypeColors.ts`
  `PALETTE`).
- Events render as vertical lines across all Graph charts. Moving them into
  Settings is why they leave the page.
- Data layer: `src/lib/labEvents.ts`. Editing/recoloring uses the `update` grant.

## Architecture summary

**New lib modules** (pure logic + data layer; pure ones unit-tested — the app's
only test surface):

| Module | Kind | Contents |
|---|---|---|
| `labParse.ts` | pure | `parseSession(text)`, ref/result number parsing |
| `labChart.ts` | pure | `scalePoints`, `refBandRect`, `eventLinesX`, y-tick math |
| `lab.ts` | data | `fetchSessions`, `saveSessions`, `deleteSession` |
| `labDescriptions.ts` + `useLabDescriptions.ts` | data + hook | CRUD + CSV sync, shared cache |
| `labEvents.ts` | data | CRUD |

**Rewritten / touched:**
- `src/pages/Tests.tsx` + `.module.css` — screenshot UI removed; toggle + Table
  + Graph + Import modal. Keeps wide-breakout CSS.
- `/settings` page — two new sections wired in.

**Removed entirely:**
- `src/lib/testScreenshots.ts` + `testScreenshots.test.ts`.
- `test-screenshots` Storage bucket usage.

## Testing

- Unit tests for `labParse`: metadata line, tab rows, verdict attachment,
  comma-decimals, `<`/`>` refs, `ref_min`/`ref_max`, dedup-key extraction,
  malformed input.
- Unit tests for `labChart`: scaling, one-sided bands, event x-positions, ticks.
- UI verified by `npm run build` (tsc + vite) — no component test infra.

## Deploy (feature inert until done)

1. Run `migrations/2026-07-18-lab-tracker.sql` in the Supabase SQL editor —
   creates the 4 tables; grants select/insert/delete on all, **plus update** on
   `lab_analyte_descriptions` and `lab_events`; RLS authenticated-only policies.
2. Redeploy the app.
3. *(Optional cleanup)* drop the now-unused `test-screenshots` bucket in Supabase
   once the old screenshots are no longer wanted. The migration does not
   force-delete it.

Until step 1, the page renders but reads/writes fail best-effort (empty views,
`console.warn`) — the same graceful pattern as every prior feature.
