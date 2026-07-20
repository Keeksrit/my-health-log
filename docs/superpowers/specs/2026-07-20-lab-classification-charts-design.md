# Lab classification & smarter charts — design

**Date:** 2026-07-20
**Status:** Design approved; implementation plan not yet written.
**Amended 2026-07-20:** censored time-series points now render as literal `>`/`<`
glyphs with dashed adjacent segments (was hollow-marker + caret); auto-classify
grows to seven categories (added chemistry, liver-kidney, inflammation, vitamins).
**Builds on:** the shipped lab tracker (`/tests`) — `2026-07-18-lab-tracker-design.md`.

## Problem

The `/tests` lab tracker was built around a single allergy-IgE paste format. Real
portal exports break it in several ways, and every numeric analyte gets the same
generic time-series chart regardless of what it measures. Five improvements:

1. **Preserve the raw pasted text** so a bad parse never loses data — the original
   is always recoverable and re-parseable.
2. **Harden parsing** for the formats the portal actually produces.
3. **Classify each analyte** (material, category, value type).
4. **Pick the chart from that classification** — an allergy class-scale gauge vs. a
   time-series vs. a negative/positive strip.
5. **Unify the hover tooltip** to two lines: value·date·time, then the annotation.

## Decisions locked during brainstorming

- **Classification is hybrid:** auto-guess at import to pre-fill a per-analyte
  dictionary; the user corrects any field in Settings. Guesses never overwrite an
  existing dictionary row.
- **Allergy scale uses the fixed CAP-RAST IgE classes** — same bands for every
  allergen, held as a code constant (not per-analyte, not in the DB).
- **Allergy scale shows the latest value** as an arrow; older dates live in the
  tooltip.
- **`Tulemuse tõlgendus:` and `Tulemuse märkus:`** are stored as two distinct
  columns (interpretation vs. lab caveat) but displayed together as the tooltip's
  second line.
- **Censored values stay plottable** — `>100` / `<0.6` keep a numeric bound plus a
  direction flag, instead of being dropped.
- **Grow the existing `lab_analyte_descriptions` table** into the analyte
  dictionary rather than adding a second analyte-keyed table.

## Reference: real paste formats (fixtures)

Captured from the user's portal exports; drive the parser tests.

- **Multi-session paste:** one paste concatenates several samples, each introduced
  by `Proovimaterjal: <MATERIAL>, Proovinõu ID: <ID>, Võetud: <dd.mm.yyyy HH:MM>`,
  followed by a restated `<Material> - <dd.mm.yyyy HH:MM>` line and an
  `Analüüs  Tulemus  Ühik  Ref.väärtus` header. Materials seen: ROE, VERI, PLASMA.
- **Panel/group headers** (no result columns): `Hemogramm 5-osalise leukogrammiga`,
  `Soole parasiitide DNA paneel roojas`, `Sooleparasiitide DNA paneel roojas`.
- **Binary results:** `Giardia lamblia DNA roojas ⇥ negatiivne ⇥ ⇥ negatiivne`
  (empty unit; ref column also holds a word).
- **Numeric with ranges:** `HbA1c (IFCC) ⇥ 35 ⇥ mmol/mol ⇥ 23 - 42`;
  `ALP ⇥ 46 ⇥ U/L ⇥ 35 - 104`.
- **Censored:** `CRP ⇥ <0.6 ⇥ mg/L ⇥ <5`; `Vitamiin D (25-OH) ⇥ 89.8 ⇥ nmol/L ⇥ >50`.
- **Empty ref:** `eGFR (Crea, CKD-EPI) ⇥ 90 ⇥ mL/min/1.73m2 ⇥` (trailing empty).
- **Trailing annotation lines**, indented with tabs/spaces, attach to the analyte
  above them:
  - `Tulemuse tõlgendus: optimaalne` (interpretation)
  - `Tulemuse tõlgendus: Normaalne neerufunktsioon`
  - `Tulemuse märkus: Proovimaterjal lipeemiline, tulemus võib olla mõjutatud` (note)
- **Noise to ignore:** `Laboratoorsed uuringud`, blank lines, the restated material
  line, the column-header row.

## Architecture

### 1. Data model — migration `migrations/2026-07-20-lab-classification.sql`

Additive, idempotent (`add column if not exists`), matching the health-schema
RLS/grant conventions.

- `health.lab_sessions` → **add `raw_text text`** — full pasted block for the sample.
- `health.lab_results` → **add `panel text`** (group header above the row) and
  **`note text`** (`Tulemuse märkus:`). Existing `verdict` keeps `Tulemuse tõlgendus:`.
- `health.lab_analyte_descriptions` → **add `category text`, `value_type text`,
  `material text`**. `value_type` is `'number' | 'binary'` (nullable = not yet
  classified). No CHECK constraint — kept free-text to avoid migration churn; the UI
  constrains input via dropdowns.
- **Grants/RLS:** the two new columns on insert-only tables need no grant change; the
  dictionary already has `update` granted. No new tables, so no new policies.
- CAP-RAST bands are **not** stored — see the allergy-scale constant below.

`result_num` semantics change (no schema change): a censored value now stores the
**numeric bound** (see parser), so out-of-range logic and plotting work on it. The
censoring direction is derived at render time from the verbatim `result_raw`.

### 2. Parser — `src/lib/labParse.ts`

- **`parseText(text: string): ParsedSession[]`** — new top-level entry. Splits the
  paste into blocks, one per `Proovinõu ID`, and calls `parseSession` on each.
  `parseSession(block)` stays exported for single-block use and unit tests.
- Each `ParsedSession` gains **`raw_text: string`** = the exact block substring.
- `ParsedResult` gains **`panel: string | null`** and **`note: string | null`**.
- Panel tracking: a non-annotation line with **no tab-separated result columns**
  sitting above analytes is recorded as the current panel and stamped on every
  following result until the next panel header or session boundary.
- Annotation lines (trimmed): `Tulemuse tõlgendus:` → `verdict`;
  `Tulemuse märkus:` → `note`; both attach to the **preceding** result.
- **`parseResultNum` change:** `>N`/`<N` (with optional space) now return `N` (the
  bound) instead of `null`. A separate helper **`censoredDir(raw): '<' | '>' | null`**
  derives the direction from the verbatim string. Non-numeric text (e.g.
  `negatiivne`) still returns `null`.
- `parseRefBounds` unchanged (already handles `a - b`, `<a`, `>a`).
- Noise lines ignored as listed in the fixtures section.

### 3. Auto-classify — `src/lib/labClassify.ts` (new, pure, tested)

- **`guessMeta({ analyte, panel, material, resultRaw }): { material, category, value_type }`**
  - `value_type`: `'binary'` when the parsed `result_num` is null **and** the raw is
    a non-censored word (negatiivne/positiivne/…); otherwise `'number'` (censored
    counts as number).
  - `category`: keyword map over `panel` + `analyte` (case-insensitive, first
    match wins; Estonian portal terms included):
    | category | matches on |
    |---|---|
    | `allergy` | IgE |
    | `hematology` | Hemogramm, leukogramm, WBC, RBC, Hb, erü, trombo |
    | `infection` | parasiit, DNA paneel |
    | `chemistry` | glükoos/glucose, HbA1c, naatrium/Na, kaalium/K, kloriid |
    | `liver-kidney` | ALP, ALAT/ALT, ASAT/AST, bilirubiin, GGT, eGFR, kreatiniin/crea |
    | `inflammation` | CRP, SR, settereaktsioon |
    | `vitamins` | vitamiin, B12, folaat/folate, ferritiin, raud/iron |
    No match → `null`. Only `allergy` changes chart type; the rest fall through to
    `timeseries` and are organizational (dictionary grouping) for now.
  - `material`: passed through from the session.
- Applied at import (see §5): for each analyte **absent from the dictionary**, insert
  a guessed row. Existing rows are left untouched.

### 4. Charts

**Chart resolver** `chartTypeFor(meta): 'allergy-scale' | 'timeseries' | 'strip'`
in `labChart.ts`:
- `category === 'allergy'` && `value_type === 'number'` → `allergy-scale`
- `value_type === 'number'` (numeric points exist) → `timeseries`
- otherwise → `strip`

**Allergy class scale** — `src/lib/labAllergyScale.ts` (new, pure, tested):
- Constant bands `[0.35, 0.70, 3.5, 17.5, 50, 100]` → 7 classes (0–6), green→red.
- `positionFor(value): { x: 0..1; className: 0..6; capped: '<' | '>' | null }` maps a
  value to a fraction across the banded bar (piecewise-linear within bands). Values
  `≥100` (or censored `>`) clamp to the far-right with `capped: '>'` ("» off scale");
  `<0.35` (or censored `<`) clamp left with `capped: '<'`.
- Component (`GraphView`): analyte name label, horizontal banded bar with a
  color-blind-safe class-number scale, an arrow at the **latest** value; hover shows
  the two-line tooltip; older dates listed in the tooltip.

**Time-series** — refine the existing chart:
- y-axis **unit label**; two-line tooltip **including time**.
- Censored points render as a **bold literal `>` / `<` glyph** (SVG `<text>`, no
  circle) plotted at the numeric bound; direction from `censoredDir(result_raw)`.
  The glyph shape is itself the color-blind second cue (per DESIGN.md). The
  y-domain expands to include the bounds.
- **Dashed segments:** any line segment **touching a censored endpoint is dashed**
  — both the segment arriving at it and the one leaving it — signalling the exact
  position is uncertain. Segments between two non-censored points stay solid. This
  replaces the single `<polyline>` with **per-segment `<line>` elements**, each
  solid/dashed by whether either endpoint is censored.
- `buildSeries` keeps censored points in `numeric` with a
  **`censored: '<' | '>' | null`** flag (derived via `censoredDir`) rather than
  routing them to the qualitative strip.

**Strip** — the existing verdict strip for binary / no-numeric analytes, with a
second (non-color) cue distinguishing negatiivne vs. positiivne per DESIGN.md.

**Unified tooltip** (all three): row 1 `<result_raw> <unit> · <dd.mm.yyyy HH:MM>`;
row 2 `<verdict ?? note ?? ''>`.

### 5. Import UX — `src/pages/tests/ImportModal.tsx`

- Paste one block (possibly many samples) → `parseText` → the log lists **every
  detected session** (date · material · N analytes · "already saved" when the
  sample_id is a dup). Done saves all, persisting `raw_text` per session and running
  `guessMeta` to seed the dictionary for new analytes.
- Dedup by `sample_id` and partial-failure retry behavior are preserved.

### 6. Settings — analyte dictionary

- The descriptions section becomes the **Analyte dictionary**: columns analyte ·
  category (dropdown) · value_type (dropdown) · material · description. Inline edit +
  CSV round-trip; `labDescriptionsCsv` gains the new columns (round-trip stays
  lossless).

## Data flow

```
paste ─► parseText ─► ParsedSession[] {raw_text, results[{panel, verdict, note, …}]}
                          │
        save ─────────────┼─► lab_sessions(+raw_text), lab_results(+panel,+note)
                          └─► guessMeta ─► lab_analyte_descriptions (new analytes only)

render: fetchSessions + dictionary ─► chartTypeFor(meta) ─►
   allergy-scale │ timeseries │ strip   (+ unified tooltip)
```

## Error handling

- Unparseable block → one `error` log row; other blocks in the paste still parse.
- Duplicate `sample_id` → skipped with a log note (unchanged).
- Analyte with no dictionary row → treated as `value_type: number` if it has numeric
  points, else `strip`; classification can be filled later without re-import.
- Migration not yet run → new columns absent; reads/writes of them fail
  best-effort, consistent with the existing feature's pre-migration behavior.

## Testing

- `labParse.test.ts`: multi-session split; panel capture; verdict vs. note; binary
  detection; censored `>100`/`<0.6` → bound + direction; empty ref/unit; noise
  ignored. Use the real pastes above as fixtures.
- `labClassify.test.ts`: category/value_type guesses for all seven categories
  (allergy, hematology, infection, chemistry, liver-kidney, inflammation,
  vitamins) plus unknown → null; first-match-wins ordering.
- `labAllergyScale.test.ts`: `positionFor` within bands and at edges
  (`<0.35`, exactly 100, `>100`), class-number mapping, capped flags.
- `labChart.test.ts`: `chartTypeFor` matrix; y-domain includes censored points;
  per-segment solid/dashed flag set when either endpoint is censored.
- `labDescriptionsCsv.test.ts`: round-trip stays lossless with the new columns.

## Out of scope (YAGNI)

- Per-analyte custom allergy thresholds (standard classes only).
- Storing CAP-RAST bands in the DB.
- Auto-classification of category beyond the keyword map (user corrects the rest).
- Connecting events/bands to Medications data (still deferred).

## Conventions followed

Pure lib module + unit tests; data layer via the health-pinned `supabase`; Settings
as composed sections; RLS-only single-user model (any UPDATE needs an explicit grant —
already present on the dictionary); each new/changed table needs a manual migration
run in the Supabase SQL editor before the feature is live.
