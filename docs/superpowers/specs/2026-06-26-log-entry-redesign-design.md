# Nutrition Log-Entry Redesign — Design

**Date:** 2026-06-26
**Status:** Approved (design), pending implementation plan

## Summary

Rework the **log-entry flow** of the Nutrition feature. The current `LogEntryModal`
uses a search box plus a separate `<select size>` list-box: typing only filters the
list, the user must click a row to actually select a food, the selection highlight is
nearly invisible with the custom styling, and an empty library leaves nothing to pick.
The result is the "I typed/clicked but it stays gray and says *Pick a food*" bug.

This redesign replaces that with a **type-ahead food picker** (the proven pattern from
`AddFoodFlow`), lets the user **log several foods at once**, makes **amount/unit
optional**, and swaps the native `datetime-local` for a **default-to-now picker with
±day / ±15-minute nudge buttons** (the pattern already used by the medication form).

## Data model change

Two parts, both needed:

1. **Live DB** — run a migration in the Supabase SQL editor against the existing table:
   ```sql
   alter table health.nutrition_consumption_log alter column amount drop not null;
   alter table health.nutrition_consumption_log alter column unit   drop not null;
   ```
2. **Schema file** — update the `create table ... nutrition_consumption_log` definition in
   `db/nutrition_schema.sql` so a fresh setup also gets nullable columns: change
   `amount numeric not null` → `amount numeric` and `unit text not null` → `unit text`.

Type changes follow in `src/types/nutrition.ts`:

```ts
export interface LogEntry {
  id: string
  food_id: string
  amount: number | null   // was: number
  unit: string | null     // was: string
  eaten_at: string
  created_at: string
  food?: Food
}
```

Rules:
- `amount` is optional. When provided it must be a positive number.
- `unit` is stored **only when `amount` is provided**; a unit with no quantity is
  meaningless, so a blank amount stores `amount = null` **and** `unit = null`.
- `eaten_at` is always set and is always aligned to a 15-minute boundary.

## Data-access change (`src/lib/nutrition.ts`)

- `insertLogEntry` / `updateLogEntry` input types change to
  `{ food_id: string; amount: number | null; unit: string | null; eaten_at: string }`.
- Add a batch insert for the multi-food create path:
  ```ts
  export async function insertLogEntries(
    entries: { food_id: string; amount: number | null; unit: string | null; eaten_at: string }[]
  ): Promise<void>
  ```
  Returns early on an empty array; throws on Supabase error. Mirrors `insertLogs` in
  `lib/medication.ts`.
- Stub-food creation reuses the existing `getOrCreateFoodByName` / `insertFood`.

## LogEntryModal redesign (`src/pages/LogEntryModal.tsx`)

The modal has two modes, switched by the existing `entry` prop.

### Create mode (`entry` is null)

Picked foods are held as an array of rows: `{ food: Food; amount: string; unit: string }`.

1. **Type-ahead food picker.** A text input; as the user types, a dropdown lists
   matching foods (by case-insensitive name substring) that are not already picked,
   capped at ~8 results. Selecting one clears the query and appends a chip row. If the
   typed text matches **no existing food name exactly**, the dropdown also shows a
   **"+ Create '\<name>'"** row that calls `getOrCreateFoodByName(name)` (creating a
   stub: name only, `type` null, no ingredients), appends it both to the local food list
   and as a picked chip. This mirrors the inline ingredient-create in `AddFoodFlow`.
2. **Per-food amount + unit.** Each chip row shows the food name, a remove (`×`) button,
   a small **optional** numeric amount input, and a unit `<select>` (the `LOG_UNITS`
   list). Leaving amount blank logs just the food.
3. **Eaten at.** Defaults to now, snapped to the nearest 15-minute boundary, displayed as
   e.g. `Mon 25 Jun · 18:15`. Four nudge buttons: `− day`, `+ day`, `− 15m`, `+ 15m`.
   Held internally as a `Date`/ISO; never a free-text field.
4. **Save.** Builds one row per picked food, all sharing the same `eaten_at`. For each:
   `amount = (amt > 0 ? amt : null)`, `unit = (amt > 0 ? unit : null)`. Inserts via
   `insertLogEntries`. Requires at least one picked food; nothing else is mandatory.
   Errors surface inline (existing pattern). On success calls `onSaved`.

### Edit mode (`entry` supplied)

Operates on the single existing log row — intentionally **not** multi-food. Shows:
the entry's food (changeable via the same type-ahead, but only one), its optional
amount + unit, and the same eaten-at nudge control. Save calls `updateLogEntry`.

## Log list display (`src/pages/Nutrition.tsx`)

The Log-tab entry rows currently render `{e.amount} {e.unit}`. Update so the
amount/unit chip is shown **only when `e.amount != null`**; otherwise the row shows just
the food name and time.

## CSV import consistency (`src/pages/ImportCsvModal.tsx`)

So import is never stricter than the form: in the **Log** format, a **blank** amount cell
is accepted and stored as `amount = null, unit = null`. A **present** amount that is
non-numeric or ≤ 0 is still collected in the error summary (unchanged), as is an invalid
unit when an amount is given.

## Out of scope (YAGNI)

- Grouped "meal" entries (a log row linking multiple foods) — rejected in favour of the
  simpler one-row-per-food model.
- A full custom month-grid calendar — rejected in favour of nudge buttons.
- Per-food amounts in **edit** mode (edit stays single-food).
- Changes to the medication feature.

## Testing

The changes are UI plus two nullable columns; no new pure, logic-heavy helpers are
introduced, so no new unit tests are added (consistent with the existing test scope,
which covers only `parseCsv` / `matchFoodByIngredientSet` / `distinctIngredientTypes`).
Verified by `npx tsc --noEmit`, `npm run build`, and manual testing: log one food, log
several at once, create a not-yet-existing food inline, log with and without an amount,
nudge the time/day, edit an entry, and confirm the Log list renders amountless entries.
