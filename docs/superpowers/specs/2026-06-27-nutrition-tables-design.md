# Nutrition tables & type-on-log redesign

**Date:** 2026-06-27
**Status:** Approved design

## Summary

Rework the Nutrition page around editable tables and move the `type` field from
foods to log entries.

- **Library tab:** replace the stacked cards (and the food detail view) with two
  independently editable tables — a **Foods** table and an **Ingredients** table.
- **Log tab:** add a **Timeline | Table** toggle. The table is inline-editable and
  shows date, time, food type, food name, amount, and unit.
- **Type relocation:** drop `type` from `nutrition_foods`; add an optional `type`
  to `nutrition_consumption_log` with values
  `salty snack, sweet snack, drink, main, sports, fermented`.

All three tables share one editing model: **read-only until "Edit", then batch
"Save" / "Cancel"** (see §3).

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Library structure | Two separate tables (foods, ingredients) |
| Type on log | Optional; drop the old `nutrition_foods.type` data |
| Log table | Toggle alongside the timeline; inline-editable |
| Save model | Edit mode + batch save (Cancel reverts) |
| Component architecture | Three purpose-built table components + a shared hook |
| Food detail view | Dropped (ingredients now shown in the table) |
| CSV import formats | Updated to match the new schema |

## 1. Schema & data layer

### Migration (`db/nutrition_schema.sql`)

Update the canonical schema file and document the migration statements:

```sql
alter table health.nutrition_consumption_log add column if not exists type text;
alter table health.nutrition_foods drop column if exists type;
```

Existing `nutrition_foods.type` values are intentionally discarded. Existing log
rows have `type = null` until edited.

### Types (`src/types/nutrition.ts`)

- Remove `type` from the `Food` interface.
- Add `type: string | null` to the `LogEntry` interface.
- Remove `FOOD_TYPES`.
- Add:

```ts
export const LOG_TYPES = [
  'salty snack', 'sweet snack', 'drink', 'main', 'sports', 'fermented',
] as const
```

`INGREDIENT_TYPES` and `LOG_UNITS` are unchanged.

### Lib (`src/lib/nutrition.ts`)

- Remove `type` from `insertFood`, `getOrCreateFoodByName`, and the
  `fetchFoodsWithIngredients` row mapping.
- Add `type` to the input of `insertLogEntry`, `insertLogEntries`, `updateLogEntry`.
- New mutation functions for batch table saves:
  - `updateFood(id, { name })`
  - `setFoodIngredients(foodId, ingredientIds[])` — diff against current links:
    delete removed, insert added (pure diff helper extracted for testing).
  - `deleteFood(id)`
  - `updateIngredient(id, { name, type })`
  - `deleteIngredient(id)` — `nutrition_food_ingredients.ingredient_id` is
    `on delete restrict`; on FK violation (`23503`) surface a friendly
    "still used by a food" message.
  - `updateLogEntries(rows[])` — one update per dirty row.

## 2. Shared editing primitive

`src/lib/useEditableRows.ts` — a generic hook:

```ts
useEditableRows<T extends { id: string }>(source: T[]): {
  editing: boolean
  rows: T[]                 // working copy while editing
  begin(): void
  cancel(): void            // revert to source
  setRow(id, patch): void
  removeRow(id): void       // marks for deletion in the working copy
  dirtyRows: T[]            // changed vs source (shallow compare by id)
  deletedIds: string[]
}
```

Each table component owns its own `save()` that calls the relevant lib batch
function for `dirtyRows` / `deletedIds`, then triggers the parent's `load()` to
refresh and exits edit mode. Errors set a local error string and keep edit mode open.

## 3. Library tab — two tables

Replaces the current cards. The food **detail view is removed**. Each table has a
section heading and an **Edit** button; in edit mode the heading shows
**Save** / **Cancel**.

### FoodsTable (`src/pages/FoodsTable.tsx`)

Columns: **Food name · Ingredients**.

- Read-only: name text, comma-joined ingredient names.
- Edit mode: name → text input; Ingredients → chip editor reusing the
  `AddFoodFlow` pattern (chips with `×` + a type-ahead input suggesting existing
  ingredients). Per-row delete (trash).
- Save commits name changes (`updateFood`), ingredient link diffs
  (`setFoodIngredients`), and deletions (`deleteFood`).
- New foods are still added via the existing **+ Food** flow (`AddFoodFlow`).

### IngredientsTable (`src/pages/IngredientsTable.tsx`)

Columns: **Ingredient name · Type**.

- Edit mode: name → text input; type → `<select>` over `INGREDIENT_TYPES` + blank.
  Per-row delete.
- Save commits `updateIngredient` / `deleteIngredient`; restricted-FK delete
  errors are shown gracefully.
- New ingredients are still added via the existing **+ Ingredient** flow.

## 4. Log tab — Timeline | Table toggle

A sub-toggle inside the Log tab. **Timeline** is the existing view, unchanged.

### LogTable (`src/pages/LogTable.tsx`)

Columns: **Date · Time · Food type · Food name · Amount · Unit**, most-recent first.

- Read-only: formatted date/time, type, food name, amount + unit.
- Edit mode:
  - Date → `<input type="date">`, Time → `<input type="time">`; both written
    back into `eaten_at` (a pure `combineDateTime` helper).
  - Food type → `<select>` over `LOG_TYPES` + blank.
  - Food name → food type-ahead (reusing `LogEntryModal`'s food search), mapping
    selection to `food_id`.
  - Amount → number input; Unit → `<select>` over `LOG_UNITS`.
  - Per-row delete.
- Save batches dirty rows via `updateLogEntries`; deletions via `deleteLogEntry`.
- New entries are still added via the existing **+ Log entry** modal.

## 5. Other touch-points

- **`LogEntryModal.tsx`:** add a **Type** `<select>` (`LOG_TYPES` + blank);
  include `type` in saved rows. Remove the `f.type` text in food suggestions.
- **`AddFoodFlow.tsx`:** remove the MEAL TYPE select and the `FOOD_TYPES` import.
- **`ImportCsvModal.tsx`:**
  - Foods format → `name, ingredients` (drop the type column).
  - Log format → `food, type, amount, unit, eaten_at` (type optional; if present,
    validated against `LOG_TYPES`, else the row is skipped with an error).
  - Update the format `<option>` labels and the parsing/column indices.
- **`Nutrition.tsx`:** remove the detail-view branch and the card rendering;
  render `FoodsTable` + `IngredientsTable` in the Library tab and the
  Timeline/Table toggle in the Log tab.

## 6. Testing

Extend `src/lib/nutrition.test.ts` and add focused tests for the new pure logic:

- Ingredient-link diffing in `setFoodIngredients` (added / removed / unchanged).
- `useEditableRows` dirty-row and deleted-id detection.
- `combineDateTime` (date + time → ISO).
- CSV log-type validation (valid value accepted, invalid skipped, blank allowed).

Table components are thin UI over these helpers and the existing lib functions.

## Out of scope

- No redesign of the timeline view itself.
- No new "add row" UX inside the tables (existing + modals remain the entry points).
- No bulk type-assignment tooling for historical log rows (they stay `null` until edited).
