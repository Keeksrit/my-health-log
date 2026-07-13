# Nutrition: incomplete-day flag + view filters

**Date:** 2026-07-13
**Status:** Design approved, pending spec review

## Problem

On the Nutrition → Log view, some days are logged accurately and others are not —
the user sometimes forgets to log some foods and later can't remember. There is
currently no way to mark such a day or to focus the view. We want:

1. A way to **manually flag a day as incomplete** (an accuracy indicator — the app
   cannot detect forgotten foods, so this is user-controlled).
2. A **filter to hide flagged (incomplete) days**, on/off.
3. A separate **filter by food type** (main, salty snack, etc.) that controls which
   food dots are shown.

The two filters are independent controls.

## Data model & persistence

Days are not a stored entity today — they are derived by grouping log entries by
local calendar day in `groupByDay` (`Nutrition.tsx`). The incomplete flag is
per-day, so it needs its own storage.

Add a small table, mirroring the `nutrition_units` / `nutrition_food_types`
pattern:

```sql
create table if not exists health.nutrition_incomplete_days (
  day        date primary key,
  created_at timestamptz not null default now()
);
```

- **Presence of a row = the day is flagged incomplete.** Toggle on = insert,
  toggle off = delete. No `update` is ever needed.
- `day` is the local calendar day, formatted `YYYY-MM-DD` — the same key
  `groupByDay` already produces.
- RLS-only security (consistent with the app): the migration adds an RLS policy
  (`auth.role() = 'authenticated'`) and `grant select, insert, delete on
  health.nutrition_incomplete_days to authenticated`. No `update` grant (we never
  update). No re-run of the auth-rls migration needed.

**Persistence choice:** DB table (chosen) over browser `localStorage`. Rationale:
the flag is real data that should survive cache clears and be consistent across
devices, and the DB-table-per-list pattern is already established in this app.
The *filter toggle states* (hide-incomplete on/off, which types are shown) are
ephemeral UI state (`useState`), not persisted.

**Best-effort fetch:** loading incomplete days is wrapped like `fetchSleep` /
`fetchTraining` — a failure (e.g. table not yet created) is logged with
`console.warn` and yields an empty set, so the timeline still renders. The feature
is therefore inert-but-safe until the migration is deployed.

## Data layer

New `src/lib/incompleteDays.ts`:

- `fetchIncompleteDays(): Promise<Set<string>>` — selects all rows, returns a
  `Set` of `YYYY-MM-DD` day keys.
- `setDayIncomplete(day: string, flagged: boolean): Promise<void>` — inserts when
  `flagged` is true, deletes when false.

Loaded in `Nutrition.tsx`'s `load()` (best-effort) into an `incompleteDays`
state `Set<string>`. Toggling updates the DB and optimistically updates local
state.

## Filtering logic (pure, unit-tested)

New `src/lib/nutritionFilters.ts` with pure helpers (vitest unit tests; the repo
has no React component test infra):

- `dayIsIncomplete(dayKey: string, incompleteDays: Set<string>): boolean`
- `entryMatchesTypes(entry: LogEntry, selectedTypes: Set<string>, noTypeSelected: boolean): boolean`
  — a food with a type matches when its type is in `selectedTypes`; an untyped
  food matches when `noTypeSelected` is true (the "No type" chip). Mirrors the
  existing legend's untyped handling.
- `filterLog(log: LogEntry[], opts: { hideIncomplete: boolean; incompleteDays: Set<string>; selectedTypes: Set<string>; noTypeSelected: boolean }): LogEntry[]`
  — for the Table view: drops entries on incomplete days (when `hideIncomplete`)
  and entries whose type isn't selected.

Composition rules (as specified):

- **Incomplete toggle drops whole days.** When ON, day groups whose key is in
  `incompleteDays` are removed before rendering (timeline) / entries dropped
  (table). When OFF, incomplete days show, with their marker.
- **Type filter hides dots, keeps days.** On the timeline it is applied per-dot at
  render: a dot whose type isn't selected is not drawn, but the day row remains
  (it may show only sleep/training bands). Stack levels are computed from the full
  day in `groupByDay`, so hiding dots never repositions the remaining ones.
- **Table view:** both filters remove rows (empty days don't exist in a table, so
  there's nothing to keep).

The sidebar "Most logged" list is computed from the filtered set.

## UI

### Filter bar (both views)

A filter bar rendered above the content, just under the Timeline/Table sub-toggle,
visible in **both** Timeline and Table views:

- **☐ Hide incomplete days** — a toggle. Off by default.
- **Type chips** — one chip per food type, plus a **"No type"** chip. Each chip is
  a colored swatch (the food type's dot color, via `colorForType`) + the type
  name, and can be toggled on/off. All chips on by default (show everything).
  These chips double as the color legend.

Because the chips serve as the legend and work in both views, the redundant
"Types" legend is **removed from the sidebar**. "Most logged" and "Clear
highlight" remain in the sidebar (timeline only).

### Marking a day incomplete (timeline)

Each day row's label area gets a small toggle button (a ⚠ / flag icon). Clicking
it calls `setDayIncomplete` and optimistically updates state. A flagged day
renders with a visible marker (icon + muted / de-emphasized label) so it's obvious
even when not hidden.

Marking is timeline-only (day rows exist there). The *hide-incomplete* filter then
applies to both Timeline and Table.

## Testing & deploy

- `nutritionFilters.ts` helpers get vitest unit tests (pure functions). Cases:
  incomplete-day drop on/off, type match with/without "No type", `filterLog`
  combinations, untyped foods.
- UI verified via `npm run build` (tsc + vite), per repo convention.
- **Manual deploy step (feature inert-but-safe until done):** run
  `migrations/2026-07-13-incomplete-days.sql` in the Supabase SQL editor. Until
  then `fetchIncompleteDays` fails best-effort → empty set → no days flagged, all
  filters still function on type.

## Out of scope (YAGNI)

- Auto-detecting incomplete days (heuristics) — explicitly rejected; flag is manual.
- Persisting filter toggle states across reloads.
- Dropping empty day rows when type-filtering (explicitly: keep all days).
- Notes/reasons on the incomplete flag (presence-only).
