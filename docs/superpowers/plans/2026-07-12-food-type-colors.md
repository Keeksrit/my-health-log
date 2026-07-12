# Food Type Colors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user assign a color per food type in Settings, and render each Nutrition → Log timeline dot in its food type's color, with a legend on the Log.

**Architecture:** A new nullable `color` column on `health.nutrition_food_types` stores a hex string chosen from a curated frontend palette. A pure helper `colorForType` maps a food's type name to its color (grey fallback). Settings gains a swatch picker per type; the Log timeline colors dots inline and shows a legend of the types present.

**Tech Stack:** React 18 + TypeScript + Vite, Supabase (`@supabase/supabase-js` v2, schema `health`), CSS Modules + CSS vars, Vitest (node env, `src/**/*.test.ts`).

## Global Constraints

- Styling: CSS Modules + existing CSS vars only (`--bg`, `--card`, `--ink`, `--ink2`, `--accent`, `--accent-l`, `--red`, `--border`). No Tailwind.
- Security model is RLS-only; new table columns inherit the table's existing grants/policy — no RLS change.
- No React component test infra — only pure `src/**/*.test.ts` unit tests run under Vitest. UI is verified with `npm run build`.
- Migrations are hand-run in the Supabase SQL editor and must be idempotent (safe to re-run).
- Feature must stay inert/functional pre-migration: `color` reads as `null` → grey dots.

---

### Task 1: Palette + `colorForType` helper (pure)

**Files:**
- Create: `src/lib/foodTypeColors.ts`
- Test: `src/lib/foodTypeColors.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `PALETTE: string[]` — curated hex swatches.
  - `FALLBACK_COLOR: string` — neutral grey (`'#9CA3AF'`).
  - `colorForType(typeName: string | null | undefined, foodTypes: Array<{ name: string; color: string | null }>): string` — returns the matching type's `color`, else `FALLBACK_COLOR`.
  - Structural param type (`{ name; color }[]`) so this file does NOT import `FoodType`; `FoodType` (after Task 2) is assignable to it.

- [ ] **Step 1: Write the failing test**

Create `src/lib/foodTypeColors.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { PALETTE, FALLBACK_COLOR, colorForType } from './foodTypeColors'

const types = [
  { name: 'Fruit', color: '#6AA84F' },
  { name: 'Dessert', color: null },
]

describe('PALETTE', () => {
  it('is a non-empty list of hex colors', () => {
    expect(PALETTE.length).toBeGreaterThan(0)
    for (const c of PALETTE) expect(c).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })
})

describe('colorForType', () => {
  it("returns a matched type's color", () => {
    expect(colorForType('Fruit', types)).toBe('#6AA84F')
  })

  it('returns grey when the matched type has no color', () => {
    expect(colorForType('Dessert', types)).toBe(FALLBACK_COLOR)
  })

  it('returns grey for an unknown type name', () => {
    expect(colorForType('Nope', types)).toBe(FALLBACK_COLOR)
  })

  it('returns grey for null or undefined type name', () => {
    expect(colorForType(null, types)).toBe(FALLBACK_COLOR)
    expect(colorForType(undefined, types)).toBe(FALLBACK_COLOR)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- foodTypeColors`
Expected: FAIL — cannot resolve `./foodTypeColors`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/foodTypeColors.ts`:

```typescript
// Curated categorical palette for food-type dots. Chosen to stay
// distinguishable and readable over the card background in light and dark.
export const PALETTE: string[] = [
  '#E4572E', // orange
  '#F2B705', // amber
  '#6AA84F', // green
  '#17A398', // teal
  '#3B82C4', // blue
  '#8E5FD9', // purple
  '#D96BA0', // pink
  '#B5651D', // brown
  '#E23B3B', // red
  '#607D8B', // slate
]

// Dots for foods with no type, or a type with no color assigned yet.
export const FALLBACK_COLOR = '#9CA3AF'

export function colorForType(
  typeName: string | null | undefined,
  foodTypes: Array<{ name: string; color: string | null }>,
): string {
  if (!typeName) return FALLBACK_COLOR
  const match = foodTypes.find(t => t.name === typeName)
  return match?.color ?? FALLBACK_COLOR
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- foodTypeColors`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/foodTypeColors.ts src/lib/foodTypeColors.test.ts
git commit -m "feat: add food-type color palette + colorForType helper"
```

---

### Task 2: DB layer — migration, `color` field, `updateFoodTypeColor`

**Files:**
- Create: `migrations/2026-07-12-food-type-colors.sql`
- Modify: `src/lib/foodTypes.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `FoodType` interface now includes `color: string | null`.
  - `updateFoodTypeColor(id: string, color: string | null): Promise<void>`.
  - `FoodType[]` is assignable to `colorForType`'s `foodTypes` param.

- [ ] **Step 1: Create the migration**

Create `migrations/2026-07-12-food-type-colors.sql`:

```sql
-- Per-food-type dot colors. Adds a nullable color column to the food-types
-- table; existing rows stay null and render with the grey fallback until a
-- color is picked in Settings. Column inherits the table's existing grants
-- and RLS policy, so no grant/policy change is needed.
--
-- Run in the Supabase SQL editor. Idempotent: safe to re-run.

alter table health.nutrition_food_types
  add column if not exists color text;
```

- [ ] **Step 2: Add `color` to the `FoodType` interface**

In `src/lib/foodTypes.ts`, update the interface:

```typescript
export interface FoodType {
  id: string
  name: string
  color: string | null
  created_at: string
}
```

- [ ] **Step 3: Add `updateFoodTypeColor`**

Append to `src/lib/foodTypes.ts` (after `deleteFoodType`):

```typescript
export async function updateFoodTypeColor(id: string, color: string | null): Promise<void> {
  const { error } = await supabase
    .from('nutrition_food_types')
    .update({ color })
    .eq('id', id)
  if (error) throw error
}
```

- [ ] **Step 4: Typecheck / build**

Run: `npm run build`
Expected: PASS (tsc + vite) — `select('*')` in `fetchFoodTypes` already returns `color`, and the interface now types it.

- [ ] **Step 5: Commit**

```bash
git add migrations/2026-07-12-food-type-colors.sql src/lib/foodTypes.ts
git commit -m "feat: add color column + updateFoodTypeColor to food types"
```

---

### Task 3: Settings — per-type swatch picker

**Files:**
- Modify: `src/pages/Settings.tsx`
- Modify: `src/pages/Settings.module.css`

**Interfaces:**
- Consumes: `PALETTE` from Task 1; `updateFoodTypeColor` + `FoodType` from Task 2; existing `useFoodTypes()` (`reload`).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Import palette + updater**

In `src/pages/Settings.tsx`, extend the existing imports:

```typescript
import { addFoodType, deleteFoodType, updateFoodTypeColor } from '../lib/foodTypes'
import { PALETTE } from '../lib/foodTypeColors'
```

- [ ] **Step 2: Add the color-set handler in `FoodTypesSection`**

Inside `FoodTypesSection`, after `handleDelete`, add:

```typescript
  async function handleColor(id: string, color: string) {
    setError(null)
    try {
      await updateFoodTypeColor(id, color)
      await reload()
    } catch (err: any) {
      setError(err?.message ?? 'Could not set color.')
    }
  }
```

- [ ] **Step 3: Render swatches in each type row**

In `FoodTypesSection`, replace the `foodTypes.map(...)` list item with:

```tsx
        {foodTypes.map(t => (
          <li key={t.id} className={styles.item}>
            <span>{t.name}</span>
            <span className={styles.swatches}>
              {PALETTE.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`${styles.swatch} ${t.color === c ? styles.swatchActive : ''}`}
                  style={{ background: c }}
                  onClick={() => handleColor(t.id, c)}
                  aria-label={`Set ${t.name} color ${c}`}
                />
              ))}
            </span>
            <button className={styles.remove} onClick={() => handleDelete(t.id)} aria-label={`Delete ${t.name}`}>×</button>
          </li>
        ))}
```

- [ ] **Step 4: Add swatch styles**

Append to `src/pages/Settings.module.css`:

```css
.swatches { display: flex; flex-wrap: wrap; gap: .3rem; margin: 0 .5rem; }
.swatch {
  width: 18px; height: 18px; border-radius: 50%;
  border: 2px solid var(--card); padding: 0; cursor: pointer;
  box-shadow: 0 0 0 1px var(--border);
}
.swatchActive { box-shadow: 0 0 0 2px var(--ink); }
```

- [ ] **Step 5: Build to verify**

Run: `npm run build`
Expected: PASS. Manual check (dev server): each food type row shows the palette; clicking a swatch marks it selected and persists after reload.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Settings.tsx src/pages/Settings.module.css
git commit -m "feat: add food-type color swatch picker in Settings"
```

---

### Task 4: Log timeline — colored dots + legend

**Files:**
- Modify: `src/pages/Nutrition.tsx`
- Modify: `src/pages/Nutrition.module.css`

**Interfaces:**
- Consumes: `colorForType`, `FALLBACK_COLOR` from Task 1; `useFoodTypes()`; `FoodType` from Task 2.
- Produces: nothing.

- [ ] **Step 1: Import the hook + helper**

In `src/pages/Nutrition.tsx`, add imports:

```typescript
import { useFoodTypes } from '../lib/useFoodTypes'
import { colorForType, FALLBACK_COLOR } from '../lib/foodTypeColors'
```

- [ ] **Step 2: Read food types in the component**

Inside `Nutrition()`, near the other hooks (after `const [error, setError] = useState('')`):

```typescript
  const { foodTypes } = useFoodTypes()
```

- [ ] **Step 3: Color each dot inline**

In the `day.dots.map(...)` block, set the dot color inline. Replace the dot `<button>`'s `style` and add a `color` const:

```tsx
                    {day.dots.map(({ entry, min, level }) => {
                      const name = entry.food?.name ?? 'Unknown food'
                      const color = colorForType(entry.food?.type, foodTypes)
                      const dotClass = highlightFood
                        ? (name === highlightFood ? styles.dotActive : styles.dotDim)
                        : ''
                      return (
                      <button
                        key={entry.id}
                        className={`${styles.dot} ${dotClass}`}
                        style={{ left: `${(min / 1440) * 100}%`, bottom: 6 + level * 16, background: color }}
                        onClick={(ev) => {
                          if (ev.shiftKey) { handleDeleteEntry(entry); return }
                          setEditEntry(entry); setModal('logEntry')
                        }}
                      >
                        <span className={styles.tooltip}>{dotTooltip(entry)}</span>
                      </button>
                      )
                    })}
```

- [ ] **Step 4: Drop the hard-coded accent backgrounds in CSS**

In `src/pages/Nutrition.module.css`, remove `background: var(--accent);` from `.dot` (it's now set inline) and from `.dotActive` (so the highlight ring shows around the type color). Result:

```css
.dot {
  position: absolute;
  width: 12px;
  height: 12px;
  margin-left: -6px; /* center on its time position */
  padding: 0;
  border: 2px solid var(--card);
  border-radius: 50%;
  cursor: pointer;
  z-index: 1;
}
.dot:hover { z-index: 3; }

.dotActive {
  box-shadow: 0 0 0 3px var(--accent-l);
  z-index: 4;
}
.dotDim { opacity: 0.18; }
```

- [ ] **Step 5: Build a legend of types present in the log**

Add a helper near `foodCounts` (top-level in `Nutrition.tsx`). It returns the food types present in the current log, each with its color, plus a trailing grey "No type" entry when any shown entry lacks a type:

```typescript
// Food types present in the given log window, each with its dot color, for the
// legend. Appends a grey "No type" row when some entries have no type.
function legendItems(
  entries: LogEntry[],
  foodTypes: Array<{ name: string; color: string | null }>,
): { name: string; color: string }[] {
  const present = new Set<string>()
  let hasUntyped = false
  for (const e of entries) {
    const t = e.food?.type
    if (t) present.add(t); else hasUntyped = true
  }
  const items = foodTypes
    .filter(t => present.has(t.name))
    .map(t => ({ name: t.name, color: colorForType(t.name, foodTypes) }))
  if (hasUntyped) items.push({ name: 'No type', color: FALLBACK_COLOR })
  return items
}
```

- [ ] **Step 6: Render the legend in the sidebar**

In the `<aside className={styles.sidebar}>` block, after the "Most logged" `countList` `</ul>`, add:

```tsx
              {legendItems(log, foodTypes).length > 0 && (
                <>
                  <p className={styles.sectionLabel}>Types</p>
                  <ul className={styles.legend}>
                    {legendItems(log, foodTypes).map(item => (
                      <li key={item.name} className={styles.legendItem}>
                        <span className={styles.legendSwatch} style={{ background: item.color }} />
                        <span>{item.name}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
```

- [ ] **Step 7: Add legend styles**

Append to `src/pages/Nutrition.module.css`:

```css
.legend { list-style: none; padding: 0; margin: 6px 0 0; display: flex; flex-direction: column; gap: 6px; }
.legendItem { display: flex; align-items: center; gap: 8px; color: var(--ink); font-size: 13px; }
.legendSwatch {
  width: 12px; height: 12px; border-radius: 50%;
  border: 2px solid var(--card); box-shadow: 0 0 0 1px var(--border);
  flex: none;
}
```

- [ ] **Step 8: Build + manual verify**

Run: `npm run build`
Expected: PASS. Manual check (dev server, after migration applied and colors set): timeline dots render in their type colors, untyped/uncolored dots are grey, the sidebar legend lists present types (+ "No type" when applicable), and food-highlight dim/active still works.

- [ ] **Step 9: Commit**

```bash
git add src/pages/Nutrition.tsx src/pages/Nutrition.module.css
git commit -m "feat: color log dots by food type + type legend"
```

---

## Deploy

After merge, run `migrations/2026-07-12-food-type-colors.sql` in the Supabase SQL editor. Until then `color` is `null` for every type and all dots use the grey fallback — functional, just uncolored.

## Self-Review

- **Spec coverage:** storage (`color` column, Task 2) ✓; curated palette picker (Task 1 + 3) ✓; grey fallback (Task 1 `colorForType`/`FALLBACK_COLOR`, used in Task 4) ✓; colored dots (Task 4) ✓; legend scoped to present types (Task 4 `legendItems`) ✓; unit tests for `colorForType` (Task 1) ✓; `npm run build` verification ✓; deploy/inert note ✓; no Foods-table swatch (correctly omitted) ✓.
- **Placeholder scan:** none — all steps carry real code/commands.
- **Type consistency:** `colorForType(typeName, foodTypes: {name;color}[])` used identically in Tasks 1 & 4; `updateFoodTypeColor(id, color)` defined in Task 2, called in Task 3; `FoodType.color` added in Task 2 and structurally satisfies Task 1's param in Tasks 3 & 4.
