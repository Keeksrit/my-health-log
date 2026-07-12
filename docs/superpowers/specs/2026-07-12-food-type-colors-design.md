# Food type colors — design

**Date:** 2026-07-12
**Status:** Approved (brainstorming)

## Goal

Let the user assign a color to each food type in Settings, and render each dot on the
Nutrition → Log timeline in its food type's color. A small legend on the Log maps the
colors back to type names.

## Decisions

- **Storage:** hex color string in a new nullable `color` column on
  `health.nutrition_food_types`. (Chosen over a palette-index/token column and over a
  localStorage map — mirrors the existing food-types/units pattern and syncs across
  devices.)
- **Picker:** a curated preset palette of distinguishable, on-theme swatches. No free
  hex entry — guarantees dots stay readable.
- **Fallback:** dots for foods with no type, or whose type has no color assigned, use a
  neutral grey so colored types visually stand out from un-categorized ones.
- **Scope:** timeline dots colored + a color legend on the Log. The legend lists only
  the food types actually present in the current log window (kept tight). No swatch
  added to the Foods table.

## Data layer

- **Migration** `migrations/2026-07-12-food-type-colors.sql`:
  `ALTER TABLE health.nutrition_food_types ADD COLUMN color text;`
  Nullable — existing rows stay `null` → grey fallback. No RLS/grant change (inherits
  the table's existing policy/grants).
- **`src/lib/foodTypes.ts`:**
  - Add `color: string | null` to the `FoodType` interface.
  - Add `updateFoodTypeColor(id: string, color: string | null): Promise<void>`.
  - `addFoodType` unchanged (new types start with `color = null` → grey until picked).
- **New `src/lib/foodTypeColors.ts`:**
  - `PALETTE: string[]` — curated hex swatches (~10–12), distinguishable in light/dark.
  - `FALLBACK_COLOR` — the neutral grey.
  - `colorForType(typeName: string | null | undefined, foodTypes: FoodType[]): string`
    — returns the matching type's `color`, or `FALLBACK_COLOR` when the name is
    null/unknown or the matched type's `color` is null.

## Settings (`src/pages/Settings.tsx`)

In `FoodTypesSection`, each row gains a palette-swatch picker beside the name: clicking
a swatch calls `updateFoodTypeColor(type.id, hex)` then `reload()`. The currently
selected swatch is visually marked (so the row doubles as the color indicator). Errors
surface through the section's existing `error` state.

## Log timeline (`src/pages/Nutrition.tsx` + `.module.css`)

- Each dot's `background` is set inline to `colorForType(entry.food?.type, foodTypes)`.
  `foodTypes` comes from the existing `useFoodTypes()` hook.
- Existing highlight behavior is preserved and layered over the per-type color:
  `dotDim` (opacity) and `dotActive` (box-shadow ring) still apply. The static
  `background: var(--accent)` rule on `.dot` is removed/overridden by the inline color;
  `.dotActive`'s hard-coded accent background is dropped so the ring shows around the
  type color.
- **Legend:** a compact list rendered on the Log (in/near the sidebar) showing a swatch
  + type name for each food type present in the current log window. Derived from the
  entries currently shown, deduped, using `colorForType`.

## Testing

- Unit tests for `foodTypeColors.ts` (`colorForType`): returns a type's color; returns
  grey for unknown name, null/undefined name, and a matched type whose `color` is null.
- UI verified via `npm run build` (repo has no React component test infra), per
  convention.

## Deploy

Feature is inert until `migrations/2026-07-12-food-type-colors.sql` is run in the
Supabase SQL editor. Until then `color` reads as `null` and every dot uses the grey
fallback — functional, just uncolored.
