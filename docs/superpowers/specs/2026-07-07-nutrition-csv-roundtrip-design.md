# Nutrition CSV round-trip export/import + food types

**Date:** 2026-07-07
**Status:** Approved design, pre-implementation

## Summary

Two coupled changes to the Nutrition area of the Health Log app:

1. **Move `type` from log entries to foods.** A food's category ("salty snack") is
   intrinsic to the food, not to the moment it was eaten. Food types become an
   editable list managed in Settings (mirroring the existing units feature).
2. **Full CSV round-trip** for the three nutrition tables (log, foods, ingredients):
   export to CSV, edit in a spreadsheet, import back. Rows are matched by `id` so
   edits (a changed log time, a food's ingredient list, a rename) apply in place.
   Two import modes: full sync and add-new-only.

## Motivation

- The consumption log's `type` field repeated a property that belongs to the food.
  "Salty snack is always a salty snack" — the type never depends on when it was eaten.
- No way today to bulk-edit history or the library. The existing import is
  insert-only and cannot update or remove rows, and matches by name so it can't
  target a specific log entry or rename a food.

## Non-goals

- Ingredient types remain a hardcoded enum (`INGREDIENT_TYPES`); only **food** types
  become editable.
- No conversions, no FK from food/log to the type list — types are free strings on the
  row, consistent with how `unit` works on log entries. Deleting a type never touches
  history.
- No "export all in one click" / combined archive. Per-table CSV only.

## 1. Schema change: `type` moves from log to foods

Migration file `migrations/2026-07-07-food-types.sql`, run manually in the Supabase SQL
editor (same as `2026-07-07-auth-rls.sql` and `2026-07-07-nutrition-units.sql`). Steps,
in order:

1. `alter table health.nutrition_foods add column type text;` (nullable, free string).
2. Create `health.nutrition_food_types` (`id uuid pk default gen_random_uuid()`,
   `name text not null unique`, `created_at timestamptz default now()`), same shape as
   `nutrition_units`. Seed the six current values: `salty snack, sweet snack, drink,
   main, sports, fermented`. Grant `authenticated` the table privileges and add the
   RLS policy (`auth.role() = 'authenticated'`), matching the units migration.
3. **Backfill** each food's `type` from the most frequent non-null `type` among its
   existing log entries, so existing categorization is preserved before the column is
   dropped. (Foods with no typed log entries stay `null`.)
4. `alter table health.nutrition_consumption_log drop column type;`

The feature is inert in the app until this migration runs (food type dropdowns empty,
log still references a dropped column). This is the single manual deploy step.

## 2. Food types editable in Settings

Clones the units feature one-to-one:

- `src/lib/foodTypes.ts` — data layer: `fetchFoodTypes()`, `insertFoodType(name)`,
  `deleteFoodType(id)`. Clone of `units.ts`, table `nutrition_food_types`.
- `src/lib/useFoodTypes.ts` — shared-cache hook. Clone of `useUnits.ts`.
- `src/pages/Settings.tsx` — add a **Food types** section (add + delete only), matching
  the existing units section.
- `src/pages/FoodsTable.tsx` — add a **Type** column with a dropdown fed by
  `useFoodTypes()`; wire into the editable-rows save path.
- `src/pages/AddFoodFlow.tsx` — add a **Type** selector when creating a food.
- `src/pages/LogEntryModal.tsx` — **remove** the type selector.
- `src/pages/LogTable.tsx` — **remove** the "Food type" column.
- `src/types/nutrition.ts` — `Food` gains `type: string | null`; `LogEntry` drops
  `type`; remove the `LOG_TYPES` const. `INGREDIENT_TYPES` unchanged.
- `src/lib/nutrition.ts` — remove `validateLogType`; drop `type` from log insert/update
  signatures; add `type` to food insert/update.

## 3. Export (per-table CSV, includes `id`)

An **⬇ Export** button in each table's header downloads a CSV via a small
`downloadCsv(filename, text)` helper (in `src/lib/utils.ts`). Column schemas:

| File             | Columns                                             |
|------------------|-----------------------------------------------------|
| `ingredients.csv`| `id, name, type`                                    |
| `foods.csv`      | `id, name, type, ingredients`                       |
| `log.csv`        | `id, food, amount, unit, eaten_at`                  |

- `foods.ingredients` = the food's ingredient **names**, comma-joined and CSV-quoted.
- `log.food` = the food's name. `log.type` is gone (moved to foods).
- `log.eaten_at` = local `YYYY-MM-DDTHH:MM` (reuses `splitDateTime`), so times read and
  edit intuitively; parsed back with `new Date(str)` (local), matching current import.
- Header row is always written; the first column is always `id`.

## 4. Import (two modes, id-matched)

`src/pages/ImportCsvModal.tsx` gains a **mode** selector above the existing format
(ingredients / foods / log) selector.

**Matching rule (per row):**
- blank `id` → **insert** (DB generates the id).
- `id` present in the table → **update** every field from the row.
- `id` non-blank but not in the table → **skip + warn** (guards against typos / stale
  files).

**Modes:**
- **Full sync** — insert + update as above, and **delete** any DB row whose `id` is
  absent from the file (file is the source of truth). A food/ingredient still
  referenced by a log row cannot be deleted (FK violation, Postgres `23503`) — it is
  **reported and left in place**, not force-deleted.
- **Add new only** — only blank-`id` rows are inserted; existing/deleted rows untouched.

**Referenced-name auto-create:** a log row naming a food not in the table, or a food row
listing an ingredient not in the table, creates it (existing get-or-create behavior).
Such creations are reported as "stubs".

**Validation** (reused from current import): amount must be `> 0` when present; unit must
be one of the editable units; `eaten_at` must parse. Bad rows are collected and skipped,
never thrown. Type validation is removed.

**Result summary** shown in the modal: counts for inserted / updated / deleted / skipped
/ blocked-delete / stubs, each with per-row reasons where relevant.

## 5. Module layout & data flow

- `src/lib/nutritionCsv.ts` — **pure, no DB**:
  - `toCsv(headers, rows)` — serialize with correct quoting (cells containing `,`, `"`,
    or newline are double-quoted with `""` escaping).
  - typed-row parsers that turn `parseCsv()` output into `{id, ...}` shapes per table,
    tolerating an optional header row (detected by first cell === `id`).
  - `computeSyncPlan(fileRows, dbIds, mode)` → `{ inserts, updates, deletes, unknownIds }`.
- `src/lib/nutrition.ts` — updated signatures (§2) plus per-table **executor** functions
  that run a plan against the DB (insert/update/delete, catching `23503` on deletes and
  returning them as blocked rather than throwing).
- Reuse existing `parseCsv` (already in `nutrition.ts`) for tokenizing.
- Components compose: **export** = fetch rows → `toCsv` → `downloadCsv`; **import** =
  `parseCsv` → parse typed rows → `computeSyncPlan` → executor → summary.

Rationale for the split: `nutritionCsv.ts` stays pure and unit-testable (the repo has no
component test infra); DB-touching executors live beside the other data-layer functions
in `nutrition.ts`.

## 6. Errors & testing

- All row-level failures (bad amount/unit/date, unknown id, FK-blocked delete) are
  collected into the summary; the import never aborts mid-file on a single bad row.
- Unit tests in `src/lib/nutritionCsv.test.ts` (vitest node env, matches existing
  `nutrition.test.ts` / `units.test.ts`):
  - `toCsv` quoting round-trips through `parseCsv` for cells with commas, quotes, and
    newlines.
  - typed-row parsing with and without a header row.
  - `computeSyncPlan` for both modes: blank-id insert, matched-id update, missing-id
    delete (sync only, none in add-only), non-blank unknown id → `unknownIds`.
  - `eaten_at` local formatting round-trip.
- Final verification: `npm run build`.

## Deploy checklist

1. Merge code.
2. Run `migrations/2026-07-07-food-types.sql` in the Supabase SQL editor.
3. Confirm food type dropdowns populate and the log table no longer shows a type column.
