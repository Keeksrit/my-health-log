# Nutrition CSV round-trip + food types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the log entry `type` onto foods (editable in Settings) and add full CSV round-trip export/import for the log, foods, and ingredient tables.

**Architecture:** A new pure module `nutritionCsv.ts` handles all CSV serialization, typed-row parsing, and sync-plan computation (fully unit-tested). DB-touching executors live in `nutrition.ts` beside the existing data layer. Food types clone the existing editable-units feature (`foodTypes.ts` + `useFoodTypes.ts` + a Settings section). Import matches rows by `id`; two modes (full sync / add-new-only).

**Tech Stack:** React 18 + TypeScript + Vite, Supabase (`@supabase/supabase-js` v2, schema `health`), CSS Modules, vitest (node env, `src/**/*.test.ts` only).

## Global Constraints

- Supabase client: reuse the singleton `supabase` from `src/lib/supabase.ts` (schema `health`) in new data-layer code. (`nutrition.ts` has its own `db` client — keep using `db` inside `nutrition.ts`.)
- Security is RLS-only: every new table needs `grant ... to authenticated`, `enable row level security`, and an `auth.role() = 'authenticated'` policy. Migrations are run manually in the Supabase SQL editor and must be idempotent (`if not exists`, `on conflict do nothing`, `drop policy if exists`).
- Types are free strings on rows (no FK); deleting a type never alters history — same rule as units.
- No component test infra: only pure `src/**/*.test.ts` files run. Final verification is `npm run build`.
- CSS: reuse existing classes (`Nutrition.module.css` `tableBtn`, `Settings.module.css`). Do not add new CSS files.
- Commit after every task. Work stays on branch `feat/nutrition-csv-roundtrip`.

---

### Task 1: Database migration

**Files:**
- Create: `migrations/2026-07-07-food-types.sql`

**Interfaces:**
- Produces: table `health.nutrition_food_types` (`id`, `name` unique, `created_at`); column `health.nutrition_foods.type text`; removes `health.nutrition_consumption_log.type`.

- [ ] **Step 1: Write the migration file**

```sql
-- Move consumption "type" from the log onto foods (a food's category is intrinsic:
-- "salty snack" is always a salty snack regardless of when it was eaten). Food types
-- become a user-managed list, mirroring nutrition_units. Types are plain strings on
-- foods, so deleting a type here never alters existing foods.
--
-- Run in the Supabase SQL editor. Idempotent: safe to re-run.

-- 1. Foods gain a free-string type column.
alter table health.nutrition_foods add column if not exists type text;

-- 2. Editable food-type list (same shape as nutrition_units).
create table if not exists health.nutrition_food_types (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

insert into health.nutrition_food_types (name)
values ('salty snack'), ('sweet snack'), ('drink'), ('main'), ('sports'), ('fermented')
on conflict (name) do nothing;

grant select, insert, delete on health.nutrition_food_types to authenticated;

alter table health.nutrition_food_types enable row level security;

drop policy if exists nutrition_food_types_authenticated on health.nutrition_food_types;
create policy nutrition_food_types_authenticated
  on health.nutrition_food_types
  for all
  to authenticated
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- 3. Backfill each food's type from the most frequent non-null type across its log
--    entries, so existing categorization survives the column drop.
update health.nutrition_foods f
set type = sub.type
from (
  select distinct on (food_id) food_id, type
  from (
    select food_id, type, count(*) as n
    from health.nutrition_consumption_log
    where type is not null
    group by food_id, type
  ) counts
  order by food_id, n desc, type
) sub
where sub.food_id = f.id
  and f.type is null;

-- 4. Drop the log's type column.
alter table health.nutrition_consumption_log drop column if exists type;
```

- [ ] **Step 2: Sanity-check the SQL by eye**

Confirm: adds `nutrition_foods.type`, creates + seeds + secures `nutrition_food_types`, backfills, then drops `nutrition_consumption_log.type`. No syntax typos.

- [ ] **Step 3: Commit**

```bash
git add migrations/2026-07-07-food-types.sql
git commit -m "feat: migration moving log type onto foods + food_types table"
```

---

### Task 2: Type-move core (schema-aligned code, build green)

Removes `type` from log entries throughout the code and adds `type` to foods. Ends with a green build; the food-type editing UI is added in Task 3.

**Files:**
- Modify: `src/types/nutrition.ts`
- Modify: `src/lib/nutrition.ts`
- Modify: `src/pages/LogEntryModal.tsx`
- Modify: `src/pages/LogTable.tsx`
- Modify: `src/pages/ImportCsvModal.tsx`

**Interfaces:**
- Produces: `Food` gains `type: string | null`; `LogEntry` loses `type`; `LOG_TYPES` and `validateLogType` removed. `insertFood`/`updateFood` accept `{ name: string; type: string | null }`. Log insert/update signatures drop `type`.

- [ ] **Step 1: Update `src/types/nutrition.ts`**

Add `type` to `Food`, remove `type` from `LogEntry`, delete the `LOG_TYPES` const. Result:

```ts
export interface Ingredient {
  id: string
  name: string
  type: string | null
  created_at: string
}

export interface Food {
  id: string
  name: string
  type: string | null
  created_at: string
  // joined via nutrition_food_ingredients
  ingredients?: Ingredient[]
}

export interface LogEntry {
  id: string
  food_id: string
  amount: number | null
  unit: string | null
  eaten_at: string
  created_at: string
  food?: Food
}

export const INGREDIENT_TYPES = [
  'Grains & Starches',
  'Proteins',
  'Dairy',
  'Dairy alternative',
  'Fruit',
  'Vegetable',
  'Fats & Oils',
  'Processed',
] as const
```

(The `LOG_TYPES` line is removed entirely.)

- [ ] **Step 2: Update `src/lib/nutrition.ts` — remove log type, add food type**

Delete the import of `LOG_TYPES` (keep `INGREDIENT_TYPES`):

```ts
import { INGREDIENT_TYPES } from '../types/nutrition'
```

Delete the entire `validateLogType` function (lines defining it).

In `fetchFoodsWithIngredients`, include `type` in the mapped object:

```ts
  return (data ?? []).map((row: any): Food => ({
    id: row.id,
    name: row.name,
    type: row.type ?? null,
    created_at: row.created_at,
    ingredients: (row.nutrition_food_ingredients ?? [])
      .map((link: any) => link.nutrition_ingredients as Ingredient)
      .filter(Boolean),
  }))
```

Change `insertFood`, `updateFood`, and `getOrCreateFoodByName` to carry `type`:

```ts
export async function insertFood(
  input: { name: string; type?: string | null },
  ingredientIds: string[]
): Promise<Food> {
  const { data, error } = await db
    .from('nutrition_foods')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  const foodRow = data as Food
  if (ingredientIds.length) {
    const links = ingredientIds.map(id => ({ food_id: foodRow.id, ingredient_id: id }))
    const { error: linkErr } = await db.from('nutrition_food_ingredients').insert(links)
    if (linkErr) throw linkErr
  }
  return foodRow
}
```

```ts
export async function updateFood(
  id: string, input: { name: string; type?: string | null }
): Promise<void> {
  const { error } = await db.from('nutrition_foods').update(input).eq('id', id)
  if (error) throw error
}
```

(`getOrCreateFoodByName` calls `insertFood({ name }, [])` — leave as is; `type` defaults to undefined → column stays null.)

Drop `type` from all log signatures — `insertLogEntry`, `insertLogEntries`, `updateLogEntry`, `updateLogEntries`:

```ts
export async function insertLogEntry(
  input: { food_id: string; amount: number | null; unit: string | null; eaten_at: string }
): Promise<void> {
  const { error } = await db.from('nutrition_consumption_log').insert(input)
  if (error) throw error
}

export async function insertLogEntries(
  entries: { food_id: string; amount: number | null; unit: string | null; eaten_at: string }[]
): Promise<void> {
  if (!entries.length) return
  const { error } = await db.from('nutrition_consumption_log').insert(entries)
  if (error) throw error
}

export async function updateLogEntry(
  id: string,
  input: { food_id: string; amount: number | null; unit: string | null; eaten_at: string }
): Promise<void> {
  const { error } = await db.from('nutrition_consumption_log').update(input).eq('id', id)
  if (error) throw error
}

export async function updateLogEntries(
  rows: { id: string; food_id: string; amount: number | null; unit: string | null; eaten_at: string }[]
): Promise<void> {
  for (const r of rows) {
    const { id, ...input } = r
    await updateLogEntry(id, input)
  }
}
```

- [ ] **Step 3: Update `src/pages/LogEntryModal.tsx` — remove type selector**

Remove the `LOG_TYPES` import (line 3: `import { LOG_TYPES } from '../types/nutrition'`).
Remove the `type` state (line ~51: `const [type, setType] = useState<string>(entry?.type ?? '')`).
In `handleSave`'s row builder, drop `type` (line ~118):

```ts
      return { food_id: r.food.id, amount: amt, unit: amt != null ? r.unit : null, eaten_at }
```

Remove the entire type `<select>` block in the JSX (the `<label>…TYPE…</label>` + `<select value={type}…>` mapping `LOG_TYPES`, around lines 203–207). Delete its label too.

- [ ] **Step 4: Update `src/pages/LogTable.tsx` — remove type column**

Remove the `LOG_TYPES` import (line 3).
Remove `type` from the `LogRow` interface.
In `toRow`, drop `type: e.type`.
In `save`, drop `type: r.type` from the row object.
Remove the `<th>Food type</th>` header cell.
Remove the entire `<td>` for the type select (the cell rendering the `LOG_TYPES` dropdown / `r.type`).

Resulting `LogRow` and `toRow`:

```ts
interface LogRow {
  id: string
  date: string
  time: string
  food_id: string
  foodName: string
  amount: string
  unit: string
}

function toRow(e: LogEntry, foodName: string): LogRow {
  const { date, time } = splitDateTime(e.eaten_at)
  return {
    id: e.id, date, time, food_id: e.food_id, foodName,
    amount: e.amount != null ? String(e.amount) : '',
    unit: e.unit ?? '',
  }
}
```

Resulting header row:

```tsx
<tr><th>Date</th><th>Time</th><th>Food name</th><th>Amount</th><th>Unit</th>{t.editing && <th />}</tr>
```

Resulting save row builder:

```ts
        return {
          id: r.id, food_id: r.food_id, amount: amt,
          unit: amt != null ? r.unit : null,
          eaten_at: combineDateTime(r.date, r.time),
        }
```

- [ ] **Step 5: Update `src/pages/ImportCsvModal.tsx` — drop type from the log branch (temporary; fully rewritten in Task 6)**

Remove `validateLogType` from the import list (lines 3–11). In the `else` (log) branch, remove the type parsing so it compiles:

```ts
      } else {
        for (const r of dropHeader(rows, 'food')) {
          const [foodName, amount, unit, eatenAt] = r
          if (!foodName?.trim()) { sum.errors.push(`Empty food in row: ${r.join(',')}`); continue }
          const amountRaw = (amount ?? '').trim()
          let amt: number | null = null
          let u: string | null = null
          if (amountRaw) {
            amt = Number(amountRaw)
            if (!(amt > 0)) { sum.errors.push(`Bad amount "${amount}" for ${foodName}`); continue }
            u = (unit ?? '').trim()
            if (!allowedUnits.has(u)) { sum.errors.push(`Bad unit "${unit}" for ${foodName}`); continue }
          }
          const when = eatenAt?.trim() ? new Date(eatenAt.trim()) : new Date()
          if (isNaN(when.getTime())) { sum.errors.push(`Bad date "${eatenAt}" for ${foodName}`); continue }
          try {
            const food = await getOrCreateFoodByName(foodName.trim())
            if (!food.ingredients?.length) sum.stubs.push(`food: ${food.name}`)
            await insertLogEntry({ food_id: food.id, amount: amt, unit: u, eaten_at: when.toISOString() })
            sum.inserted++
          } catch (e: any) {
            sum.errors.push(`Could not import log for "${foodName.trim()}": ${e?.message ?? 'unknown error'}`)
          }
        }
      }
```

Also update the log format `<option>` label (line ~170) to drop `type`:

```tsx
              <option value="log">Log — food, amount, unit, eaten_at</option>
```

- [ ] **Step 6: Verify the build**

Run: `npm run build`
Expected: PASS (no type errors; `LOG_TYPES`/`validateLogType` fully removed, no remaining references).

- [ ] **Step 7: Commit**

```bash
git add src/types/nutrition.ts src/lib/nutrition.ts src/pages/LogEntryModal.tsx src/pages/LogTable.tsx src/pages/ImportCsvModal.tsx
git commit -m "feat: move type off log entries and onto foods"
```

---

### Task 3: Food types data layer, hook, and editing UI

**Files:**
- Create: `src/lib/foodTypes.ts`
- Create: `src/lib/useFoodTypes.ts`
- Create: `src/lib/foodTypes.test.ts`
- Modify: `src/pages/Settings.tsx`
- Modify: `src/pages/FoodsTable.tsx`
- Modify: `src/pages/AddFoodFlow.tsx`

**Interfaces:**
- Consumes: `Food.type` (Task 2), `insertFood`/`updateFood` type param (Task 2).
- Produces: `fetchFoodTypes()`, `addFoodType(name)`, `deleteFoodType(id)`, `normalizeFoodTypeName(raw)`, `useFoodTypes()` returning `{ foodTypes: FoodType[]; loading: boolean; reload: () => Promise<void> }`.

- [ ] **Step 1: Write the failing test for `normalizeFoodTypeName`**

Create `src/lib/foodTypes.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { normalizeFoodTypeName } from './foodTypes'

describe('normalizeFoodTypeName', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeFoodTypeName('  drink  ')).toBe('drink')
  })

  it('collapses internal whitespace', () => {
    expect(normalizeFoodTypeName('salty   snack')).toBe('salty snack')
  })

  it('throws on empty or whitespace-only input', () => {
    expect(() => normalizeFoodTypeName('   ')).toThrow('Food type name cannot be empty')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/foodTypes.test.ts`
Expected: FAIL ("Failed to resolve import './foodTypes'").

- [ ] **Step 3: Create `src/lib/foodTypes.ts`**

```ts
import { supabase } from './supabase'

export interface FoodType {
  id: string
  name: string
  created_at: string
}

export function normalizeFoodTypeName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, ' ')
  if (!name) throw new Error('Food type name cannot be empty')
  return name
}

export async function fetchFoodTypes(): Promise<FoodType[]> {
  const { data, error } = await supabase
    .from('nutrition_food_types')
    .select('*')
    .order('created_at')
  if (error) throw error
  return data as FoodType[]
}

export async function addFoodType(name: string): Promise<FoodType> {
  const clean = normalizeFoodTypeName(name)
  const { data, error } = await supabase
    .from('nutrition_food_types')
    .insert({ name: clean })
    .select()
    .single()
  if (error) {
    if (error.code === '23505') throw new Error('That food type already exists.')
    throw error
  }
  return data as FoodType
}

export async function deleteFoodType(id: string): Promise<void> {
  const { error } = await supabase.from('nutrition_food_types').delete().eq('id', id)
  if (error) throw error
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/foodTypes.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Create `src/lib/useFoodTypes.ts`**

```ts
import { useEffect, useState } from 'react'
import { fetchFoodTypes, type FoodType } from './foodTypes'

// Module-level cache shared across all useFoodTypes() consumers so switching pages
// doesn't refetch. reload() refreshes it and notifies every mounted hook.
let cache: FoodType[] | null = null
let inflight: Promise<FoodType[]> | null = null
const listeners = new Set<(t: FoodType[]) => void>()

async function load(force = false): Promise<FoodType[]> {
  if (cache && !force) return cache
  if (!inflight || force) {
    inflight = fetchFoodTypes().then(t => {
      cache = t
      inflight = null
      listeners.forEach(fn => fn(t))
      return t
    }).catch(err => {
      inflight = null
      throw err
    })
  }
  return inflight
}

export function useFoodTypes(): { foodTypes: FoodType[]; loading: boolean; reload: () => Promise<void> } {
  const [foodTypes, setFoodTypes] = useState<FoodType[]>(cache ?? [])
  const [loading, setLoading] = useState(cache === null)

  useEffect(() => {
    const listener = (t: FoodType[]) => setFoodTypes(t)
    listeners.add(listener)
    load().then(() => setLoading(false)).catch(() => setLoading(false))
    return () => { listeners.delete(listener) }
  }, [])

  async function reload() {
    await load(true)
  }

  return { foodTypes, loading, reload }
}
```

- [ ] **Step 6: Add a Food types section to `src/pages/Settings.tsx`**

Replace the file with a two-section version (Units + Food types) reusing the same styles:

```tsx
import { useState } from 'react'
import { useUnits } from '../lib/useUnits'
import { addUnit, deleteUnit } from '../lib/units'
import { useFoodTypes } from '../lib/useFoodTypes'
import { addFoodType, deleteFoodType } from '../lib/foodTypes'
import styles from './Settings.module.css'

export default function Settings() {
  return (
    <div className={styles.page}>
      <UnitsSection />
      <FoodTypesSection />
    </div>
  )
}

function UnitsSection() {
  const { units, reload } = useUnits()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await addUnit(name)
      setName('')
      await reload()
    } catch (err: any) {
      setError(err?.message ?? 'Could not add unit.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(id: string) {
    setError(null)
    try {
      await deleteUnit(id)
      await reload()
    } catch (err: any) {
      setError(err?.message ?? 'Could not delete unit.')
    }
  }

  return (
    <>
      <h2 className={styles.heading}>Units</h2>
      <p className={styles.hint}>
        Units available when logging food. Deleting one keeps it on past entries.
      </p>
      <ul className={styles.list}>
        {units.map(u => (
          <li key={u.id} className={styles.item}>
            <span>{u.name}</span>
            <button className={styles.remove} onClick={() => handleDelete(u.id)} aria-label={`Delete ${u.name}`}>×</button>
          </li>
        ))}
      </ul>
      <form className={styles.addRow} onSubmit={handleAdd}>
        <input className={styles.input} value={name} onChange={e => setName(e.target.value)} placeholder="Add a unit (e.g. tbsp)" />
        <button className={styles.add} type="submit" disabled={busy}>Add</button>
      </form>
      {error && <p className={styles.error}>{error}</p>}
    </>
  )
}

function FoodTypesSection() {
  const { foodTypes, reload } = useFoodTypes()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await addFoodType(name)
      setName('')
      await reload()
    } catch (err: any) {
      setError(err?.message ?? 'Could not add food type.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(id: string) {
    setError(null)
    try {
      await deleteFoodType(id)
      await reload()
    } catch (err: any) {
      setError(err?.message ?? 'Could not delete food type.')
    }
  }

  return (
    <>
      <h2 className={styles.heading}>Food types</h2>
      <p className={styles.hint}>
        Categories available when adding a food. Deleting one keeps it on existing foods.
      </p>
      <ul className={styles.list}>
        {foodTypes.map(t => (
          <li key={t.id} className={styles.item}>
            <span>{t.name}</span>
            <button className={styles.remove} onClick={() => handleDelete(t.id)} aria-label={`Delete ${t.name}`}>×</button>
          </li>
        ))}
      </ul>
      <form className={styles.addRow} onSubmit={handleAdd}>
        <input className={styles.input} value={name} onChange={e => setName(e.target.value)} placeholder="Add a food type (e.g. dessert)" />
        <button className={styles.add} type="submit" disabled={busy}>Add</button>
      </form>
      {error && <p className={styles.error}>{error}</p>}
    </>
  )
}
```

- [ ] **Step 7: Add a Type column to `src/pages/FoodsTable.tsx`**

Add the hook import and use, extend `FoodRow`/`toRow` with `type`, render a Type dropdown, and save it. Full replacement of the relevant parts:

Imports and top of component:

```tsx
import { useMemo, useState } from 'react'
import type { Food, Ingredient } from '../types/nutrition'
import { useEditableRows } from '../lib/useEditableRows'
import { useFoodTypes } from '../lib/useFoodTypes'
import { updateFood, setFoodIngredients, deleteFood } from '../lib/nutrition'
import styles from './Nutrition.module.css'
import ft from './FoodsTable.module.css'

interface Props {
  foods: Food[]
  allIngredients: Ingredient[]
  onSaved: () => void
}

interface FoodRow { id: string; name: string; type: string | null; ingredientIds: string[] }

function toRow(f: Food): FoodRow {
  return { id: f.id, name: f.name, type: f.type, ingredientIds: (f.ingredients ?? []).map(i => i.id) }
}

export default function FoodsTable({ foods, allIngredients, onSaved }: Props) {
  const source = useMemo(() => foods.map(toRow), [foods])
  const t = useEditableRows<FoodRow>(source)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const { foodTypes } = useFoodTypes()
  const nameById = useMemo(
    () => new Map(allIngredients.map(i => [i.id, i.name])), [allIngredients])

  async function save() {
    setSaving(true); setError('')
    try {
      for (const id of t.deletedIds) await deleteFood(id)
      for (const r of t.dirtyRows) {
        await updateFood(r.id, { name: r.name.trim(), type: r.type })
        await setFoodIngredients(r.id, r.ingredientIds)
      }
      onSaved(); t.finish()
    } catch (e: any) {
      setError(e?.message ?? 'Could not save foods.')
    } finally {
      setSaving(false)
    }
  }
```

Update the table header to add a Type column:

```tsx
              <tr><th>Food name</th><th>Type</th><th>Ingredients</th>{t.editing && <th />}</tr>
```

Add the Type cell as the second `<td>` in each row (immediately after the name `<td>`):

```tsx
                  <td>
                    {t.editing
                      ? <select className={styles.cellSelect} value={r.type ?? ''}
                          onChange={e => t.setRow(r.id, { type: e.target.value || null })}>
                          <option value="">—</option>
                          {foodTypes.map(x => <option key={x.id} value={x.name}>{x.name}</option>)}
                        </select>
                      : (r.type ?? '—')}
                  </td>
```

- [ ] **Step 8: Add a Type selector to `src/pages/AddFoodFlow.tsx`**

Add the hook and a `type` state, render a selector, and pass it to `insertFood`.

Imports:

```tsx
import { useFoodTypes } from '../lib/useFoodTypes'
```

Inside the component, after the other `useState` declarations:

```tsx
  const { foodTypes } = useFoodTypes()
  const [type, setType] = useState<string>('')
```

Change the save call to include `type`:

```tsx
      await insertFood({ name: name.trim(), type: type || null }, pickedIds)
```

Add a Type selector in the JSX just before the `NAME *` label:

```tsx
        <label className={formStyles.label}>TYPE <span className={formStyles.optional}>(optional)</span></label>
        <select className={formStyles.input} value={type} onChange={e => setType(e.target.value)}>
          <option value="">—</option>
          {foodTypes.map(x => <option key={x.id} value={x.name}>{x.name}</option>)}
        </select>
```

- [ ] **Step 9: Verify build and tests**

Run: `npx vitest run src/lib/foodTypes.test.ts && npm run build`
Expected: tests PASS, build PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/foodTypes.ts src/lib/useFoodTypes.ts src/lib/foodTypes.test.ts src/pages/Settings.tsx src/pages/FoodsTable.tsx src/pages/AddFoodFlow.tsx
git commit -m "feat: editable food types managed in Settings, shown on foods"
```

---

### Task 4: Pure CSV module (`nutritionCsv.ts`)

**Files:**
- Create: `src/lib/nutritionCsv.ts`
- Create: `src/lib/nutritionCsv.test.ts`

**Interfaces:**
- Consumes: `parseCsv` from `nutrition.ts`; `Food`, `Ingredient`, `LogEntry` types (type-only imports).
- Produces:
  - `toCsv(headers: string[], rows: string[][]): string`
  - `formatLocalDateTime(iso: string): string` → `YYYY-MM-DDTHH:MM` (local)
  - `ingredientsToCsv(rows: Ingredient[]): string`
  - `foodsToCsv(rows: Food[]): string`
  - `logToCsv(rows: LogEntry[]): string`
  - `parseIngredientRows(rows: string[][]): IngredientCsvRow[]`
  - `parseFoodRows(rows: string[][]): FoodCsvRow[]`
  - `parseLogRows(rows: string[][]): LogCsvRow[]`
  - `computeSyncPlan<T extends { id: string }>(fileRows: T[], dbIds: string[], mode: SyncMode): SyncPlan<T>`
  - types `IngredientCsvRow`, `FoodCsvRow`, `LogCsvRow`, `SyncMode`, `SyncPlan<T>`

- [ ] **Step 1: Write failing tests**

Create `src/lib/nutritionCsv.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  toCsv,
  formatLocalDateTime,
  parseFoodRows,
  parseLogRows,
  computeSyncPlan,
} from './nutritionCsv'
import { parseCsv } from './nutrition'

describe('toCsv', () => {
  it('quotes cells containing commas, quotes, and newlines and round-trips through parseCsv', () => {
    const text = toCsv(['id', 'name', 'ingredients'], [
      ['1', 'Rye bread', 'rye,water,salt'],
      ['2', 'She said "hi"', 'line1\nline2'],
    ])
    const parsed = parseCsv(text.trim())
    expect(parsed[0]).toEqual(['id', 'name', 'ingredients'])
    expect(parsed[1]).toEqual(['1', 'Rye bread', 'rye,water,salt'])
    expect(parsed[2]).toEqual(['2', 'She said "hi"', 'line1\nline2'])
  })
})

describe('formatLocalDateTime', () => {
  it('formats an ISO instant as local YYYY-MM-DDTHH:MM', () => {
    // Build the expected value from the same Date so the test is timezone-agnostic.
    const iso = new Date(2026, 6, 5, 9, 30).toISOString()
    expect(formatLocalDateTime(iso)).toBe('2026-07-05T09:30')
  })
})

describe('parseFoodRows', () => {
  it('drops the header row and splits the ingredients cell', () => {
    const rows = [
      ['id', 'name', 'type', 'ingredients'],
      ['ab1', 'Rye bread', 'main', 'rye, water, salt'],
      ['', 'Coffee', 'drink', ''],
    ]
    expect(parseFoodRows(rows)).toEqual([
      { id: 'ab1', name: 'Rye bread', type: 'main', ingredientNames: ['rye', 'water', 'salt'] },
      { id: '', name: 'Coffee', type: 'drink', ingredientNames: [] },
    ])
  })
})

describe('parseLogRows', () => {
  it('parses log rows without a type column', () => {
    const rows = [
      ['id', 'food', 'amount', 'unit', 'eaten_at'],
      ['x1', 'Rye bread', '2', 'serving', '2026-07-05T09:00'],
    ]
    expect(parseLogRows(rows)).toEqual([
      { id: 'x1', food: 'Rye bread', amount: '2', unit: 'serving', eatenAt: '2026-07-05T09:00' },
    ])
  })
})

describe('computeSyncPlan', () => {
  const file = [
    { id: 'a', name: 'A' },   // exists → update
    { id: '', name: 'C' },    // blank → insert
    { id: 'z', name: 'Z' },   // non-blank, not in db → unknown
  ]
  const dbIds = ['a', 'b']    // b missing from file → delete (sync)

  it('sync mode: update matched, insert blank, delete missing, flag unknown', () => {
    const plan = computeSyncPlan(file, dbIds, 'sync')
    expect(plan.updates.map(r => r.id)).toEqual(['a'])
    expect(plan.inserts.map(r => r.name)).toEqual(['C'])
    expect(plan.deletes).toEqual(['b'])
    expect(plan.unknownIds.map(r => r.id)).toEqual(['z'])
  })

  it('add mode: insert blank only, no updates or deletes', () => {
    const plan = computeSyncPlan(file, dbIds, 'add')
    expect(plan.inserts.map(r => r.name)).toEqual(['C'])
    expect(plan.updates).toEqual([])
    expect(plan.deletes).toEqual([])
    expect(plan.unknownIds).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/nutritionCsv.test.ts`
Expected: FAIL ("Failed to resolve import './nutritionCsv'").

- [ ] **Step 3: Create `src/lib/nutritionCsv.ts`**

```ts
import type { Food, Ingredient, LogEntry } from '../types/nutrition'

export type SyncMode = 'sync' | 'add'

export interface IngredientCsvRow { id: string; name: string; type: string | null }
export interface FoodCsvRow { id: string; name: string; type: string | null; ingredientNames: string[] }
export interface LogCsvRow { id: string; food: string; amount: string; unit: string; eatenAt: string }

export interface SyncPlan<T> {
  inserts: T[]      // blank id
  updates: T[]      // id present in DB
  unknownIds: T[]   // non-blank id absent from DB
  deletes: string[] // DB ids absent from the file (sync mode only)
}

// ── Serialization ──────────────────────────────────────
function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v
}

export function toCsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

function pad2(n: number): string { return String(n).padStart(2, '0') }

export function formatLocalDateTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
    `T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export function ingredientsToCsv(rows: Ingredient[]): string {
  return toCsv(['id', 'name', 'type'],
    rows.map(i => [i.id, i.name, i.type ?? '']))
}

export function foodsToCsv(rows: Food[]): string {
  return toCsv(['id', 'name', 'type', 'ingredients'],
    rows.map(f => [
      f.id, f.name, f.type ?? '',
      (f.ingredients ?? []).map(i => i.name).join(', '),
    ]))
}

export function logToCsv(rows: LogEntry[]): string {
  return toCsv(['id', 'food', 'amount', 'unit', 'eaten_at'],
    rows.map(e => [
      e.id,
      e.food?.name ?? 'Unknown food',
      e.amount != null ? String(e.amount) : '',
      e.unit ?? '',
      formatLocalDateTime(e.eaten_at),
    ]))
}

// ── Parsing (drop an optional header row whose first cell is "id") ──
function dropHeader(rows: string[][]): string[][] {
  if (rows.length && rows[0][0]?.trim().toLowerCase() === 'id') return rows.slice(1)
  return rows
}

export function parseIngredientRows(rows: string[][]): IngredientCsvRow[] {
  return dropHeader(rows).map(r => ({
    id: (r[0] ?? '').trim(),
    name: (r[1] ?? '').trim(),
    type: (r[2] ?? '').trim() || null,
  }))
}

export function parseFoodRows(rows: string[][]): FoodCsvRow[] {
  return dropHeader(rows).map(r => ({
    id: (r[0] ?? '').trim(),
    name: (r[1] ?? '').trim(),
    type: (r[2] ?? '').trim() || null,
    ingredientNames: (r[3] ?? '').split(',').map(s => s.trim()).filter(Boolean),
  }))
}

export function parseLogRows(rows: string[][]): LogCsvRow[] {
  return dropHeader(rows).map(r => ({
    id: (r[0] ?? '').trim(),
    food: (r[1] ?? '').trim(),
    amount: (r[2] ?? '').trim(),
    unit: (r[3] ?? '').trim(),
    eatenAt: (r[4] ?? '').trim(),
  }))
}

// ── Sync plan ──────────────────────────────────────────
export function computeSyncPlan<T extends { id: string }>(
  fileRows: T[], dbIds: string[], mode: SyncMode
): SyncPlan<T> {
  const dbSet = new Set(dbIds)
  const inserts = fileRows.filter(r => !r.id)
  if (mode === 'add') {
    return { inserts, updates: [], unknownIds: [], deletes: [] }
  }
  const updates = fileRows.filter(r => r.id && dbSet.has(r.id))
  const unknownIds = fileRows.filter(r => r.id && !dbSet.has(r.id))
  const fileIdSet = new Set(fileRows.map(r => r.id).filter(Boolean))
  const deletes = dbIds.filter(id => !fileIdSet.has(id))
  return { inserts, updates, unknownIds, deletes }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/nutritionCsv.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/nutritionCsv.ts src/lib/nutritionCsv.test.ts
git commit -m "feat: pure CSV serialize/parse/sync-plan module for nutrition"
```

---

### Task 5: Export buttons

**Files:**
- Modify: `src/lib/utils.ts`
- Modify: `src/pages/LogTable.tsx`
- Modify: `src/pages/FoodsTable.tsx`
- Modify: `src/pages/IngredientsTable.tsx`

**Interfaces:**
- Consumes: `ingredientsToCsv`, `foodsToCsv`, `logToCsv` (Task 4).
- Produces: `downloadCsv(filename: string, text: string): void` in `utils.ts`.

- [ ] **Step 1: Add `downloadCsv` to `src/lib/utils.ts`**

Append:

```ts
export function downloadCsv(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
```

- [ ] **Step 2: Add an Export button to `src/pages/LogTable.tsx`**

Add imports:

```tsx
import { logToCsv } from '../lib/nutritionCsv'
import { downloadCsv } from '../lib/utils'
```

In the `tableActions` div, add an Export button shown when not editing (alongside the existing Edit button). Replace the non-editing branch:

```tsx
          ) : (
            <>
              {log.length > 0 && <button className={styles.tableBtn} onClick={t.begin}>Edit</button>}
              <button className={styles.tableBtn} onClick={() => downloadCsv('log.csv', logToCsv(log))}>⬇ Export</button>
            </>
          )}
```

- [ ] **Step 3: Add an Export button to `src/pages/FoodsTable.tsx`**

Add imports:

```tsx
import { foodsToCsv } from '../lib/nutritionCsv'
import { downloadCsv } from '../lib/utils'
```

Replace the non-editing branch of `tableActions`:

```tsx
          ) : (
            <>
              {foods.length > 0 && <button className={styles.tableBtn} onClick={t.begin}>Edit</button>}
              <button className={styles.tableBtn} onClick={() => downloadCsv('foods.csv', foodsToCsv(foods))}>⬇ Export</button>
            </>
          )}
```

- [ ] **Step 4: Add an Export button to `src/pages/IngredientsTable.tsx`**

Add imports:

```tsx
import { ingredientsToCsv } from '../lib/nutritionCsv'
import { downloadCsv } from '../lib/utils'
```

Replace the non-editing branch of `tableActions`:

```tsx
          ) : (
            <>
              {ingredients.length > 0 && <button className={styles.tableBtn} onClick={t.begin}>Edit</button>}
              <button className={styles.tableBtn} onClick={() => downloadCsv('ingredients.csv', ingredientsToCsv(ingredients))}>⬇ Export</button>
            </>
          )}
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/utils.ts src/pages/LogTable.tsx src/pages/FoodsTable.tsx src/pages/IngredientsTable.tsx
git commit -m "feat: per-table CSV export buttons"
```

---

### Task 6: Import rewrite — id-matched two-mode sync

**Files:**
- Modify: `src/lib/nutrition.ts` (add executors + a small validation helper)
- Modify: `src/lib/nutritionCsv.ts` (add pure `normalizeLogAmountUnit`)
- Modify: `src/lib/nutritionCsv.test.ts` (test the helper)
- Modify: `src/pages/ImportCsvModal.tsx` (full rewrite)

**Interfaces:**
- Consumes: parse functions + `computeSyncPlan` + row types (Task 4); `useUnits`; existing data-layer functions.
- Produces:
  - pure `normalizeLogAmountUnit(amountRaw: string, unitRaw: string, allowedUnits: Set<string>): { amount: number | null; unit: string | null }` (throws `Error` on bad input) in `nutritionCsv.ts`
  - `ImportSummary` interface + `syncIngredients(rows, mode)`, `syncFoods(rows, mode)`, `syncLog(rows, mode, allowedUnits)` in `nutrition.ts`, each returning `Promise<ImportSummary>`

- [ ] **Step 1: Write failing test for `normalizeLogAmountUnit`**

Add to `src/lib/nutritionCsv.test.ts`:

```ts
import { normalizeLogAmountUnit } from './nutritionCsv'

describe('normalizeLogAmountUnit', () => {
  const allowed = new Set(['g', 'serving'])

  it('returns null amount and unit when amount is blank', () => {
    expect(normalizeLogAmountUnit('', 'g', allowed)).toEqual({ amount: null, unit: null })
  })

  it('returns amount and unit when valid', () => {
    expect(normalizeLogAmountUnit('2', 'serving', allowed)).toEqual({ amount: 2, unit: 'serving' })
  })

  it('throws on a non-positive amount', () => {
    expect(() => normalizeLogAmountUnit('0', 'g', allowed)).toThrow('amount')
  })

  it('throws on an unknown unit', () => {
    expect(() => normalizeLogAmountUnit('2', 'cups', allowed)).toThrow('unit')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/nutritionCsv.test.ts`
Expected: FAIL ("normalizeLogAmountUnit is not a function" / not exported).

- [ ] **Step 3: Add `normalizeLogAmountUnit` to `src/lib/nutritionCsv.ts`**

```ts
export function normalizeLogAmountUnit(
  amountRaw: string, unitRaw: string, allowedUnits: Set<string>
): { amount: number | null; unit: string | null } {
  const a = amountRaw.trim()
  if (!a) return { amount: null, unit: null }
  const amount = Number(a)
  if (!(amount > 0)) throw new Error(`Bad amount "${amountRaw}"`)
  const unit = unitRaw.trim()
  if (!allowedUnits.has(unit)) throw new Error(`Bad unit "${unitRaw}"`)
  return { amount, unit }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/nutritionCsv.test.ts`
Expected: PASS (all blocks incl. the new one).

- [ ] **Step 5: Add executors to `src/lib/nutrition.ts`**

Add imports at the top (merge with existing imports):

```ts
import type {
  IngredientCsvRow, FoodCsvRow, LogCsvRow, SyncMode,
} from './nutritionCsv'
import { computeSyncPlan, normalizeLogAmountUnit } from './nutritionCsv'
```

Append these functions at the end of the file:

```ts
// ── CSV import / sync ──────────────────────────────────
export interface ImportSummary {
  inserted: number
  updated: number
  deleted: number
  skipped: string[]   // bad rows, unknown ids
  blocked: string[]   // FK-blocked deletes
  stubs: string[]     // auto-created foods/ingredients
}

function emptySummary(): ImportSummary {
  return { inserted: 0, updated: 0, deleted: 0, skipped: [], blocked: [], stubs: [] }
}

export async function syncIngredients(rows: IngredientCsvRow[], mode: SyncMode): Promise<ImportSummary> {
  const sum = emptySummary()
  const existing = await fetchIngredients()
  const plan = computeSyncPlan(rows, existing.map(i => i.id), mode)
  for (const r of plan.unknownIds) sum.skipped.push(`ingredient row references unknown id "${r.id}"`)
  for (const r of plan.inserts) {
    if (!r.name) { sum.skipped.push('ingredient with empty name'); continue }
    try { await insertIngredient({ name: r.name, type: r.type }); sum.inserted++ }
    catch (e: any) { sum.skipped.push(`insert ingredient "${r.name}": ${e?.message ?? 'error'}`) }
  }
  for (const r of plan.updates) {
    try { await updateIngredient(r.id, { name: r.name, type: r.type }); sum.updated++ }
    catch (e: any) { sum.skipped.push(`update ingredient "${r.name}": ${e?.message ?? 'error'}`) }
  }
  for (const id of plan.deletes) {
    try { await deleteIngredient(id); sum.deleted++ }
    catch (e: any) { sum.blocked.push(`ingredient ${id}: ${e?.message ?? 'still referenced'}`) }
  }
  return sum
}

export async function syncFoods(rows: FoodCsvRow[], mode: SyncMode): Promise<ImportSummary> {
  const sum = emptySummary()
  const existing = await fetchFoodsWithIngredients()
  const plan = computeSyncPlan(rows, existing.map(f => f.id), mode)
  for (const r of plan.unknownIds) sum.skipped.push(`food row references unknown id "${r.id}"`)

  async function resolveIngredientIds(names: string[]): Promise<string[]> {
    const ids: string[] = []
    for (const n of names) {
      const ing = await getOrCreateIngredientByName(n)
      if (ing.type === null) sum.stubs.push(`ingredient: ${ing.name}`)
      ids.push(ing.id)
    }
    return ids
  }

  for (const r of plan.inserts) {
    if (!r.name) { sum.skipped.push('food with empty name'); continue }
    try {
      const ids = await resolveIngredientIds(r.ingredientNames)
      await insertFood({ name: r.name, type: r.type }, ids)
      sum.inserted++
    } catch (e: any) { sum.skipped.push(`insert food "${r.name}": ${e?.message ?? 'error'}`) }
  }
  for (const r of plan.updates) {
    try {
      const ids = await resolveIngredientIds(r.ingredientNames)
      await updateFood(r.id, { name: r.name, type: r.type })
      await setFoodIngredients(r.id, ids)
      sum.updated++
    } catch (e: any) { sum.skipped.push(`update food "${r.name}": ${e?.message ?? 'error'}`) }
  }
  for (const id of plan.deletes) {
    try { await deleteFood(id); sum.deleted++ }
    catch (e: any) { sum.blocked.push(`food ${id}: ${e?.message ?? 'still referenced by the log'}`) }
  }
  return sum
}

export async function syncLog(
  rows: LogCsvRow[], mode: SyncMode, allowedUnits: Set<string>
): Promise<ImportSummary> {
  const sum = emptySummary()
  const existing = await fetchLog()
  const plan = computeSyncPlan(rows, existing.map(e => e.id), mode)
  for (const r of plan.unknownIds) sum.skipped.push(`log row references unknown id "${r.id}"`)

  async function build(r: LogCsvRow): Promise<{ food_id: string; amount: number | null; unit: string | null; eaten_at: string }> {
    if (!r.food) throw new Error('empty food name')
    const { amount, unit } = normalizeLogAmountUnit(r.amount, r.unit, allowedUnits)
    const when = r.eatenAt ? new Date(r.eatenAt) : new Date()
    if (isNaN(when.getTime())) throw new Error(`bad date "${r.eatenAt}"`)
    const food = await getOrCreateFoodByName(r.food)
    if (!food.ingredients?.length) sum.stubs.push(`food: ${food.name}`)
    return { food_id: food.id, amount, unit, eaten_at: when.toISOString() }
  }

  for (const r of plan.inserts) {
    try { await insertLogEntry(await build(r)); sum.inserted++ }
    catch (e: any) { sum.skipped.push(`insert log "${r.food}": ${e?.message ?? 'error'}`) }
  }
  for (const r of plan.updates) {
    try { await updateLogEntry(r.id, await build(r)); sum.updated++ }
    catch (e: any) { sum.skipped.push(`update log "${r.food}": ${e?.message ?? 'error'}`) }
  }
  for (const id of plan.deletes) {
    try { await deleteLogEntry(id); sum.deleted++ }
    catch (e: any) { sum.blocked.push(`log ${id}: ${e?.message ?? 'error'}`) }
  }
  return sum
}
```

- [ ] **Step 6: Rewrite `src/pages/ImportCsvModal.tsx`**

Full replacement:

```tsx
import { useState } from 'react'
import { useUnits } from '../lib/useUnits'
import { parseCsv, syncIngredients, syncFoods, syncLog, type ImportSummary } from '../lib/nutrition'
import {
  parseIngredientRows, parseFoodRows, parseLogRows, type SyncMode,
} from '../lib/nutritionCsv'
import modalStyles from './Modal.module.css'
import formStyles from './AddMedicationFlow.module.css'

type Format = 'ingredients' | 'foods' | 'log'

interface Props {
  onClose: () => void
  onSaved: () => void
}

export default function ImportCsvModal({ onClose, onSaved }: Props) {
  const [format, setFormat] = useState<Format>('ingredients')
  const [mode, setMode] = useState<SyncMode>('add')
  const [text, setText] = useState('')
  const [rows, setRows] = useState<string[][] | null>(null)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { units, loading } = useUnits()

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setText(String(reader.result ?? ''))
    reader.readAsText(file)
  }

  function preview() {
    setError('')
    const parsed = parseCsv(text.trim())
    if (!parsed.length) { setError('Nothing to parse.'); return }
    setRows(parsed)
  }

  async function runImport() {
    if (!rows) return
    if (loading || units.length === 0) {
      setError('Units are still loading — try again in a moment.')
      return
    }
    setBusy(true)
    setError('')
    try {
      let result: ImportSummary
      if (format === 'ingredients') {
        result = await syncIngredients(parseIngredientRows(rows), mode)
      } else if (format === 'foods') {
        result = await syncFoods(parseFoodRows(rows), mode)
      } else {
        result = await syncLog(parseLogRows(rows), mode, new Set(units.map(u => u.name)))
      }
      setSummary(result)
      if (result.inserted + result.updated + result.deleted > 0) onSaved()
    } catch (e: any) {
      setError(e?.message ?? 'Import failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={modalStyles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={modalStyles.sheet}>
        <div className={modalStyles.handle} />
        <div className={formStyles.header}>
          <h2 className={modalStyles.title}>Import CSV</h2>
          <button className={formStyles.cancelBtn} onClick={onClose}>Cancel</button>
        </div>

        {summary ? (
          <div>
            <p className={modalStyles.desc}>
              Inserted {summary.inserted} · Updated {summary.updated} · Deleted {summary.deleted}
            </p>
            {summary.blocked.length > 0 && (
              <>
                <label className={formStyles.label}>COULD NOT DELETE ({summary.blocked.length})</label>
                <ul>{summary.blocked.map((s, i) => <li key={i} style={{ fontSize: 13, color: 'var(--danger, #B83A3A)' }}>{s}</li>)}</ul>
              </>
            )}
            {summary.stubs.length > 0 && (
              <>
                <label className={formStyles.label}>STUBS CREATED ({summary.stubs.length})</label>
                <ul>{summary.stubs.map((s, i) => <li key={i} style={{ fontSize: 13 }}>{s}</li>)}</ul>
              </>
            )}
            {summary.skipped.length > 0 && (
              <>
                <label className={formStyles.label}>SKIPPED ({summary.skipped.length})</label>
                <ul>{summary.skipped.map((s, i) => <li key={i} style={{ fontSize: 13, color: 'var(--danger, #B83A3A)' }}>{s}</li>)}</ul>
              </>
            )}
            <button className={formStyles.nextBtn} onClick={onClose}>Done</button>
          </div>
        ) : (
          <div>
            <label className={formStyles.label}>FORMAT</label>
            <select className={formStyles.input} value={format} onChange={e => { setFormat(e.target.value as Format); setRows(null) }}>
              <option value="ingredients">Ingredients — id, name, type</option>
              <option value="foods">Foods — id, name, type, ingredients</option>
              <option value="log">Log — id, food, amount, unit, eaten_at</option>
            </select>

            <label className={formStyles.label}>MODE</label>
            <select className={formStyles.input} value={mode} onChange={e => setMode(e.target.value as SyncMode)}>
              <option value="add">Add new only — insert rows with a blank id, skip the rest</option>
              <option value="sync">Full sync — update matched ids, insert blank ids, delete missing ids</option>
            </select>

            <label className={formStyles.label}>UPLOAD .CSV</label>
            <input className={formStyles.input} type="file" accept=".csv,text/csv" onChange={onFile} />

            <label className={formStyles.label}>…OR PASTE</label>
            <textarea
              className={formStyles.input}
              rows={6}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Paste CSV rows here"
            />

            {error && <p className={modalStyles.desc} style={{ color: 'var(--danger, #B83A3A)' }}>{error}</p>}

            {rows ? (
              <>
                <label className={formStyles.label}>PREVIEW ({rows.length} row(s))</label>
                <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 12 }}>
                  <table style={{ fontSize: 12, borderCollapse: 'collapse', width: '100%' }}>
                    <tbody>
                      {rows.slice(0, 20).map((r, ri) => (
                        <tr key={ri}>
                          {r.map((c, ci) => (
                            <td key={ci} style={{ border: '1px solid var(--border)', padding: '4px 6px' }}>{c}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button className={formStyles.nextBtn} disabled={busy || loading} onClick={runImport}>
                  {loading ? 'Loading units…' : busy ? 'Importing…' : `Import ${rows.length} row(s)`}
                </button>
              </>
            ) : (
              <button className={formStyles.nextBtn} disabled={!text.trim()} onClick={preview}>
                Preview
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Verify tests and build**

Run: `npx vitest run && npm run build`
Expected: all tests PASS, build PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/nutrition.ts src/lib/nutritionCsv.ts src/lib/nutritionCsv.test.ts src/pages/ImportCsvModal.tsx
git commit -m "feat: id-matched two-mode CSV import (full sync / add-new-only)"
```

---

## Manual deploy step (feature inert until done)

Run `migrations/2026-07-07-food-types.sql` in the Supabase SQL editor. Until then, food-type dropdowns are empty and the app still expects the dropped log `type` column. After running: confirm food-type dropdowns populate and the log table shows no type column.

## Verification summary

- Unit tests: `npx vitest run` (foodTypes + nutritionCsv suites).
- Build: `npm run build`.
- Manual end-to-end (after migration): export each table, edit a row (change a log time, a food's ingredients, add a blank-id row, delete a row), re-import in both modes, confirm the changes appear in the app.
