# Editable Units, Managed from Settings — Design

**Date:** 2026-07-07
**Status:** Approved for planning

## Problem

Log-entry units are a hardcoded array — `LOG_UNITS = ['g', 'ml', 'serving', 'piece']` in
`src/types/nutrition.ts`. Adding a unit means a code change and redeploy. The user wants to
add and remove units themselves from a Settings screen, with the list synced across devices.

## Scope

- Move units into a Supabase table so they are user-editable and sync across devices.
- Add a Settings page (add + delete units).
- Units remain **free strings** on log entries. No unit conversions, no unit-aware math —
  the table only supplies the picklist.

Out of scope: renaming units in place, unit conversions, making `LOG_TYPES` /
`INGREDIENT_TYPES` editable, rewriting units on historical entries.

## Data model — `health.nutrition_units`

Follows the existing `nutrition_*` table naming.

| column       | type                              | notes                                   |
|--------------|-----------------------------------|-----------------------------------------|
| `id`         | `uuid` pk, `default gen_random_uuid()` |                                    |
| `name`       | `text not null unique`            | the unit label, e.g. `tbsp`             |
| `created_at` | `timestamptz default now()`       | list is ordered by this (insertion order) |

Migration `migrations/2026-07-07-nutrition-units.sql`:

1. Create the table.
2. Seed the existing four units: `g`, `ml`, `serving`, `piece`.
3. `grant select, insert, delete on health.nutrition_units to authenticated;`
   (the grant footgun documented in the deploy notes — `authenticated` needs explicit grants).
4. `alter table health.nutrition_units enable row level security;` + a single
   `auth.role() = 'authenticated'` policy, matching the RLS-only security model.

Idempotent — safe to re-run.

## Data access — `src/lib/units.ts`

Thin `db.from('nutrition_units')` wrappers in the same style as `fetchIngredients` /
`insertIngredient` in `src/lib/nutrition.ts`:

- `fetchUnits(): Promise<Unit[]>` — ordered by `created_at`.
- `addUnit(name: string): Promise<void>` — trims/normalizes; maps the unique-constraint
  error to a friendly "unit already exists" message.
- `deleteUnit(id: string): Promise<void>`.

## Loading into the app — `useUnits()` hook

Replaces the synchronous `LOG_UNITS` import in its three consumers. Returns
`{ units, reload }`. Uses a module-level cache in `units.ts` so navigating between pages
does not refetch; the Settings page calls `reload()` after any add/delete so open dropdowns
reflect the change.

(Considered an App-level React context instead; the hook + cache is less plumbing for three
consumers and was chosen.)

## Settings page — `src/pages/Settings.tsx` (+ `Settings.module.css`)

- New route `/settings` in `App.tsx`.
- A **Settings link in the Header**, next to sign-out (bottom nav stays focused on daily
  logging tabs).
- UI: a list of units, each with a delete (✕) control; an input + "Add" button below.
- Uses existing CSS-var styling (`--bg`, `--card`, `--ink`, etc.); no new dependencies.

## Wiring

- `LogEntryModal` and `LogTable`: map dropdown `<option>`s over `units` from `useUnits()`
  instead of `LOG_UNITS`.
- `ImportCsvModal`: validate the CSV `unit` column against fetched units instead of the const.
- Remove the `LOG_UNITS` const from `src/types/nutrition.ts` (the seed now lives in the
  migration).

## Behavior notes

- Deleting a unit does not touch existing entries — `unit` is stored as a plain string on the
  entry, so past entries keep their label; the unit simply disappears from future dropdowns.
- Adding a duplicate name is rejected by the unique constraint with a friendly message.

## Verification & deploy

- No React component test infra — verification is `npm run build`.
- Post-deploy manual step: run `migrations/2026-07-07-nutrition-units.sql` in the Supabase
  SQL editor. Because it grants `authenticated` and adds its own RLS policy, no separate
  re-run of the dynamic auth-rls migration is required for this table.
