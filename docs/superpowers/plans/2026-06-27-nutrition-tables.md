# Nutrition Tables & Type-on-Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the Nutrition page into editable tables (foods, ingredients, log) and move the `type` field from foods onto log entries.

**Architecture:** Three purpose-built, inline-editable table components (`FoodsTable`, `IngredientsTable`, `LogTable`) share a `useEditableRows` hook for edit-mode/dirty/cancel state. Each table batch-saves its dirty + deleted rows through dedicated functions in `lib/nutrition.ts`. Pure helpers (link diffing, date/time split-combine, CSV type validation) are unit-tested; the table components are thin UI verified by `tsc` build + manual check.

**Tech Stack:** React 18 + TypeScript, Vite, Supabase JS (schema `health`), Vitest, CSS Modules.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-27-nutrition-tables-design.md`.
- `LOG_TYPES = ['salty snack', 'sweet snack', 'drink', 'main', 'sports', 'fermented']` — exact strings, lowercase.
- Log `type` is **optional** (nullable); existing log rows stay `null` until edited.
- `nutrition_foods.type` is **dropped**; old values discarded.
- Save model for every table: **read-only until Edit, then batch Save / Cancel (revert)**.
- The build must pass `npm run build` (runs `tsc` then `vite build`) and `npm test` (vitest) at the end of every task.
- Follow existing patterns: CSS Modules per component, supabase client in `lib/nutrition.ts` only, one component per file in `src/pages/`.
- New foods/ingredients/log entries are still added via the existing `+ Food` / `+ Ingredient` / `+ Log entry` modals — tables only edit and delete existing rows.

---

### Task 1: Pure helpers + log `type` plumbing

**Files:**
- Modify: `src/types/nutrition.ts`
- Modify: `src/lib/nutrition.ts`
- Test: `src/lib/nutrition.test.ts`
- Modify: `db/nutrition_schema.sql`

**Interfaces:**
- Consumes: existing `LogEntry`, `Ingredient`, `Food` types.
- Produces:
  - `LOG_TYPES: readonly string[]`
  - `LogEntry.type: string | null`
  - `diffIngredientLinks(current: string[], next: string[]): { toAdd: string[]; toRemove: string[] }`
  - `splitDateTime(iso: string): { date: string; time: string }` (local, `YYYY-MM-DD` / `HH:MM`)
  - `combineDateTime(date: string, time: string): string` (local wall-clock → ISO)
  - log insert/update inputs now accept optional `type?: string | null`

- [ ] **Step 1: Write the failing tests for the new pure helpers**

Add to the bottom of `src/lib/nutrition.test.ts` (and extend the import on line 2 to include the three new names):

```ts
import {
  matchFoodByIngredientSet, parseCsv, distinctIngredientTypes,
  diffIngredientLinks, splitDateTime, combineDateTime,
} from './nutrition'

describe('diffIngredientLinks', () => {
  it('reports added and removed ids, ignoring unchanged', () => {
    expect(diffIngredientLinks(['a', 'b', 'c'], ['b', 'c', 'd'])).toEqual({
      toAdd: ['d'], toRemove: ['a'],
    })
  })
  it('is empty when the sets match regardless of order', () => {
    expect(diffIngredientLinks(['a', 'b'], ['b', 'a'])).toEqual({ toAdd: [], toRemove: [] })
  })
  it('handles empty current/next', () => {
    expect(diffIngredientLinks([], ['a'])).toEqual({ toAdd: ['a'], toRemove: [] })
    expect(diffIngredientLinks(['a'], [])).toEqual({ toAdd: [], toRemove: ['a'] })
  })
})

describe('split/combineDateTime', () => {
  it('round-trips a local wall-clock time', () => {
    const iso = combineDateTime('2026-06-27', '08:30')
    expect(splitDateTime(iso)).toEqual({ date: '2026-06-27', time: '08:30' })
  })
  it('splitDateTime zero-pads month, day, hour, minute', () => {
    const iso = combineDateTime('2026-01-05', '07:05')
    expect(splitDateTime(iso)).toEqual({ date: '2026-01-05', time: '07:05' })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `diffIngredientLinks is not a function` (and the date helpers).

- [ ] **Step 3: Add `LOG_TYPES` and `LogEntry.type` to types**

In `src/types/nutrition.ts`, add `type: string | null` to the `LogEntry` interface (after `unit`):

```ts
export interface LogEntry {
  id: string
  food_id: string
  amount: number | null
  unit: string | null
  type: string | null
  eaten_at: string
  created_at: string
  food?: Food
}
```

Add after the `LOG_UNITS` line:

```ts
export const LOG_TYPES = ['salty snack', 'sweet snack', 'drink', 'main', 'sports', 'fermented'] as const
```

(Leave `Food.type` and `FOOD_TYPES` in place for now — Task 5 removes them.)

- [ ] **Step 4: Implement the pure helpers in `src/lib/nutrition.ts`**

Add to the "Pure helpers" section (after `distinctIngredientTypes`):

```ts
export function diffIngredientLinks(
  current: string[], next: string[]
): { toAdd: string[]; toRemove: string[] } {
  const cur = new Set(current)
  const nxt = new Set(next)
  return {
    toAdd: next.filter(id => !cur.has(id)),
    toRemove: current.filter(id => !nxt.has(id)),
  }
}

function pad2(n: number): string { return String(n).padStart(2, '0') }

export function splitDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  return {
    date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
  }
}

export function combineDateTime(date: string, time: string): string {
  return new Date(`${date}T${time}`).toISOString()
}
```

- [ ] **Step 5: Add optional `type` to the log insert/update inputs**

In `src/lib/nutrition.ts`, update the three log-write signatures so `type` flows through (the column is nullable, so omitting it is fine):

```ts
export async function insertLogEntry(
  input: { food_id: string; amount: number | null; unit: string | null; type?: string | null; eaten_at: string }
): Promise<void> {
  const { error } = await db.from('nutrition_consumption_log').insert(input)
  if (error) throw error
}

export async function insertLogEntries(
  entries: { food_id: string; amount: number | null; unit: string | null; type?: string | null; eaten_at: string }[]
): Promise<void> {
  if (!entries.length) return
  const { error } = await db.from('nutrition_consumption_log').insert(entries)
  if (error) throw error
}

export async function updateLogEntry(
  id: string,
  input: { food_id: string; amount: number | null; unit: string | null; type?: string | null; eaten_at: string }
): Promise<void> {
  const { error } = await db.from('nutrition_consumption_log').update(input).eq('id', id)
  if (error) throw error
}
```

- [ ] **Step 6: Update the schema file for the log `type` column**

In `db/nutrition_schema.sql`, add `type text,` to the `nutrition_consumption_log` create-table (after the `unit text` line):

```sql
create table if not exists health.nutrition_consumption_log (
  id          uuid primary key default gen_random_uuid(),
  food_id     uuid not null references health.nutrition_foods(id) on delete restrict,
  amount      numeric,
  unit        text,
  type        text,
  eaten_at    timestamptz not null,
  created_at  timestamptz not null default now()
);
```

Add this migration note at the very bottom of the file:

```sql
-- Migration (2026-06-27): relocate `type` from foods to the log.
-- Run once on an existing database:
--   alter table health.nutrition_consumption_log add column if not exists type text;
--   alter table health.nutrition_foods drop column if exists type;
```

- [ ] **Step 7: Run the tests to verify they pass and the build is green**

Run: `npm test`
Expected: PASS (all suites).
Run: `npm run build`
Expected: succeeds (no TS errors).

- [ ] **Step 8: Commit**

```bash
git add src/types/nutrition.ts src/lib/nutrition.ts src/lib/nutrition.test.ts db/nutrition_schema.sql
git commit -m "feat(nutrition): add log type, link-diff and date helpers"
```

---

### Task 2: `useEditableRows` hook

**Files:**
- Create: `src/lib/useEditableRows.ts`
- Test: `src/lib/useEditableRows.test.ts`

**Interfaces:**
- Consumes: nothing from prior tasks.
- Produces:
  - `rowsEqual(a, b): boolean` — shallow equality over own enumerable keys (exported, tested).
  - `computeDirty<T extends {id:string}>(source: T[], working: T[]): T[]` — rows present in both whose fields differ (exported, tested).
  - `useEditableRows<T extends {id:string}>(source: T[])` returning `{ editing, rows, begin, cancel, finish, setRow, removeRow, dirtyRows, deletedIds }`. When not editing, `rows === source` (always fresh after a parent reload); the working copy exists only between `begin()` and `cancel()`/`finish()`. `finish()` exits edit mode after a successful save.

- [ ] **Step 1: Write the failing tests for the pure parts**

Create `src/lib/useEditableRows.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { rowsEqual, computeDirty } from './useEditableRows'

describe('rowsEqual', () => {
  it('is true for shallow-equal objects', () => {
    expect(rowsEqual({ id: '1', name: 'a' }, { id: '1', name: 'a' })).toBe(true)
  })
  it('is false when a field differs', () => {
    expect(rowsEqual({ id: '1', name: 'a' }, { id: '1', name: 'b' })).toBe(false)
  })
  it('is false when key sets differ', () => {
    expect(rowsEqual({ id: '1' }, { id: '1', name: 'a' })).toBe(false)
  })
})

describe('computeDirty', () => {
  const source = [{ id: '1', name: 'a' }, { id: '2', name: 'b' }]
  it('returns only changed rows that still exist', () => {
    const working = [{ id: '1', name: 'A' }, { id: '2', name: 'b' }]
    expect(computeDirty(source, working)).toEqual([{ id: '1', name: 'A' }])
  })
  it('ignores rows removed from the working copy', () => {
    expect(computeDirty(source, [{ id: '2', name: 'b' }])).toEqual([])
  })
  it('returns empty when nothing changed', () => {
    expect(computeDirty(source, source)).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./useEditableRows`.

- [ ] **Step 3: Implement the hook and its pure helpers**

Create `src/lib/useEditableRows.ts`:

```ts
import { useState } from 'react'

export function rowsEqual(a: Record<string, any>, b: Record<string, any>): boolean {
  const ak = Object.keys(a)
  const bk = Object.keys(b)
  if (ak.length !== bk.length) return false
  return ak.every(k => a[k] === b[k])
}

export function computeDirty<T extends { id: string }>(source: T[], working: T[]): T[] {
  const byId = new Map(source.map(r => [r.id, r]))
  return working.filter(r => {
    const orig = byId.get(r.id)
    return orig != null && !rowsEqual(orig, r)
  })
}

export function useEditableRows<T extends { id: string }>(source: T[]) {
  const [editing, setEditing] = useState(false)
  const [working, setWorking] = useState<T[]>([])
  const [deletedIds, setDeletedIds] = useState<string[]>([])

  // Outside edit mode, render straight from source so a parent reload is
  // reflected immediately. The working copy lives only while editing.
  const rows = editing ? working : source

  function begin() {
    setWorking(source.map(r => ({ ...r })))
    setDeletedIds([])
    setEditing(true)
  }
  function cancel() { setEditing(false); setDeletedIds([]) }
  function finish() { setEditing(false); setDeletedIds([]) }
  function setRow(id: string, patch: Partial<T>) {
    setWorking(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)))
  }
  function removeRow(id: string) {
    setWorking(prev => prev.filter(r => r.id !== id))
    setDeletedIds(prev => (source.some(r => r.id === id) ? [...prev, id] : prev))
  }

  return {
    editing, rows, begin, cancel, finish, setRow, removeRow,
    dirtyRows: editing ? computeDirty(source, working) : [],
    deletedIds,
  }
}
```

Note: `setRow`/`removeRow` carry only the fields each table needs (see Tasks 4–6); `rowsEqual` is shallow, so nested objects must be replaced, not mutated. A table's `save()` calls `onSaved()` (which reloads the parent) and then `finish()` to leave edit mode.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/useEditableRows.ts src/lib/useEditableRows.test.ts
git commit -m "feat(nutrition): add useEditableRows hook for inline table editing"
```

---

### Task 3: Lib mutation functions for table saves

**Files:**
- Modify: `src/lib/nutrition.ts`

**Interfaces:**
- Consumes: `diffIngredientLinks` (Task 1), supabase `db` client.
- Produces:
  - `updateFood(id: string, input: { name: string }): Promise<void>`
  - `setFoodIngredients(foodId: string, ingredientIds: string[]): Promise<void>`
  - `deleteFood(id: string): Promise<void>`
  - `updateIngredient(id: string, input: { name: string; type: string | null }): Promise<void>`
  - `deleteIngredient(id: string): Promise<void>` (throws a friendly `Error` on FK violation `23503`)
  - `updateLogEntries(rows: { id: string; food_id: string; amount: number | null; unit: string | null; type: string | null; eaten_at: string }[]): Promise<void>`

No new unit tests: these are thin supabase wrappers. The only branching logic — the link diff inside `setFoodIngredients` — is `diffIngredientLinks`, already tested in Task 1. Verified by `tsc` build here and manually in Tasks 4–6.

- [ ] **Step 1: Add the food mutation functions**

In `src/lib/nutrition.ts`, in the "Foods" section, add:

```ts
export async function updateFood(id: string, input: { name: string }): Promise<void> {
  const { error } = await db.from('nutrition_foods').update(input).eq('id', id)
  if (error) throw error
}

export async function setFoodIngredients(foodId: string, ingredientIds: string[]): Promise<void> {
  const { data, error } = await db
    .from('nutrition_food_ingredients')
    .select('ingredient_id')
    .eq('food_id', foodId)
  if (error) throw error
  const current = (data ?? []).map((r: any) => r.ingredient_id as string)
  const { toAdd, toRemove } = diffIngredientLinks(current, ingredientIds)
  if (toRemove.length) {
    const { error: delErr } = await db
      .from('nutrition_food_ingredients')
      .delete()
      .eq('food_id', foodId)
      .in('ingredient_id', toRemove)
    if (delErr) throw delErr
  }
  if (toAdd.length) {
    const links = toAdd.map(id => ({ food_id: foodId, ingredient_id: id }))
    const { error: insErr } = await db.from('nutrition_food_ingredients').insert(links)
    if (insErr) throw insErr
  }
}

export async function deleteFood(id: string): Promise<void> {
  const { error } = await db.from('nutrition_foods').delete().eq('id', id)
  if (error) throw error
}
```

- [ ] **Step 2: Add the ingredient mutation functions**

In the "Ingredients" section, add:

```ts
export async function updateIngredient(
  id: string, input: { name: string; type: string | null }
): Promise<void> {
  const { error } = await db.from('nutrition_ingredients').update(input).eq('id', id)
  if (error) throw error
}

export async function deleteIngredient(id: string): Promise<void> {
  const { error } = await db.from('nutrition_ingredients').delete().eq('id', id)
  if (error) {
    if (error.code === '23503') {
      throw new Error('That ingredient is still used by a food. Remove it from those foods first.')
    }
    throw error
  }
}
```

- [ ] **Step 3: Add the log batch-update function**

In the "Consumption log" section, add:

```ts
export async function updateLogEntries(
  rows: { id: string; food_id: string; amount: number | null; unit: string | null; type: string | null; eaten_at: string }[]
): Promise<void> {
  for (const r of rows) {
    const { id, ...input } = r
    await updateLogEntry(id, input)
  }
}
```

- [ ] **Step 4: Verify the build is green**

Run: `npm run build`
Expected: succeeds.
Run: `npm test`
Expected: PASS (unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/lib/nutrition.ts
git commit -m "feat(nutrition): add table batch-save mutations"
```

---

### Task 4: IngredientsTable + wire into Library tab

**Files:**
- Create: `src/pages/IngredientsTable.tsx`
- Modify: `src/pages/Nutrition.tsx`
- Modify: `src/pages/Nutrition.module.css`

**Interfaces:**
- Consumes: `useEditableRows` (Task 2), `updateIngredient`/`deleteIngredient` (Task 3), `INGREDIENT_TYPES`.
- Produces: `<IngredientsTable ingredients={Ingredient[]} onSaved={() => void} />`.

- [ ] **Step 1: Add shared table CSS**

Append to `src/pages/Nutrition.module.css`:

```css
/* ── Editable tables ── */
.tableHead {
  display: flex; align-items: center; justify-content: space-between;
  margin: 16px 0 8px;
}
.tableActions { display: flex; gap: 10px; }
.tableBtn {
  background: none; border: none; color: var(--accent);
  font-size: 13px; font-weight: 600; cursor: pointer; padding: 0;
}
.tableWrap { overflow-x: auto; border: 1px solid var(--border); border-radius: var(--r); }
.table { width: 100%; border-collapse: collapse; font-size: 14px; }
.table th {
  text-align: left; font-size: 10px; font-weight: 600; color: var(--ink2);
  letter-spacing: 0.07em; text-transform: uppercase;
  padding: 8px 10px; border-bottom: 1px solid var(--border);
}
.table td { padding: 8px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
.table tr:last-child td { border-bottom: none; }
.cellInput, .cellSelect {
  width: 100%; box-sizing: border-box; font: inherit;
  padding: 5px 7px; border: 1px solid var(--border); border-radius: 8px;
  background: var(--card); color: var(--ink);
}
.rowDelete {
  background: none; border: none; color: var(--danger, #B83A3A);
  font-size: 16px; cursor: pointer; padding: 0 4px;
}
.tableError { font-size: 13px; color: var(--danger, #B83A3A); margin: 6px 0 0; }
```

- [ ] **Step 2: Implement `IngredientsTable`**

Create `src/pages/IngredientsTable.tsx`:

```tsx
import { useState } from 'react'
import type { Ingredient } from '../types/nutrition'
import { INGREDIENT_TYPES } from '../types/nutrition'
import { useEditableRows } from '../lib/useEditableRows'
import { updateIngredient, deleteIngredient } from '../lib/nutrition'
import styles from './Nutrition.module.css'

interface Props {
  ingredients: Ingredient[]
  onSaved: () => void
}

export default function IngredientsTable({ ingredients, onSaved }: Props) {
  const t = useEditableRows<Ingredient>(ingredients)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setSaving(true); setError('')
    try {
      for (const id of t.deletedIds) await deleteIngredient(id)
      for (const r of t.dirtyRows) await updateIngredient(r.id, { name: r.name.trim(), type: r.type })
      onSaved(); t.finish()
    } catch (e: any) {
      setError(e?.message ?? 'Could not save ingredients.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className={styles.tableHead}>
        <span className={styles.sectionLabel}>Ingredients ({ingredients.length})</span>
        <div className={styles.tableActions}>
          {t.editing ? (
            <>
              <button className={styles.tableBtn} disabled={saving} onClick={save}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button className={styles.tableBtn} disabled={saving} onClick={t.cancel}>Cancel</button>
            </>
          ) : (
            ingredients.length > 0 && <button className={styles.tableBtn} onClick={t.begin}>Edit</button>
          )}
        </div>
      </div>
      {error && <p className={styles.tableError}>{error}</p>}
      {ingredients.length === 0 ? (
        <p className={styles.empty}>No ingredients yet.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Name</th><th>Type</th>{t.editing && <th />}</tr>
            </thead>
            <tbody>
              {t.rows.map(r => (
                <tr key={r.id}>
                  <td>
                    {t.editing
                      ? <input className={styles.cellInput} value={r.name}
                          onChange={e => t.setRow(r.id, { name: e.target.value })} />
                      : r.name}
                  </td>
                  <td>
                    {t.editing
                      ? <select className={styles.cellSelect} value={r.type ?? ''}
                          onChange={e => t.setRow(r.id, { type: e.target.value || null })}>
                          <option value="">—</option>
                          {INGREDIENT_TYPES.map(x => <option key={x} value={x}>{x}</option>)}
                        </select>
                      : (r.type ?? '—')}
                  </td>
                  {t.editing && (
                    <td><button className={styles.rowDelete} title="Delete"
                      onClick={() => t.removeRow(r.id)}>×</button></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 3: Render it in the Library tab**

In `src/pages/Nutrition.tsx`, add the import near the other page imports:

```tsx
import IngredientsTable from './IngredientsTable'
```

Replace the ingredients section of the library tab (the `<p className={styles.sectionLabel}>Ingredients (...)</p>` block and the `ingredients.map(...)` cards that follow it, lines ~290–300) with:

```tsx
<IngredientsTable ingredients={ingredients} onSaved={load} />
```

(Leave the foods cards untouched — Task 5 replaces them.)

- [ ] **Step 4: Verify build + manual check**

Run: `npm run build`
Expected: succeeds.
Run: `npm run dev`, open the app → Nutrition → Library. Click **Edit** on the Ingredients table, change a name and a type, delete a row, click **Save**. Confirm the list reloads with the changes. Click **Edit** → **Cancel** and confirm edits are discarded.

- [ ] **Step 5: Commit**

```bash
git add src/pages/IngredientsTable.tsx src/pages/Nutrition.tsx src/pages/Nutrition.module.css
git commit -m "feat(nutrition): editable ingredients table in library"
```

---

### Task 5: FoodsTable + drop `type` from foods + remove detail view

**Files:**
- Create: `src/pages/FoodsTable.tsx`
- Create: `src/pages/FoodsTable.module.css`
- Modify: `src/pages/Nutrition.tsx`
- Modify: `src/types/nutrition.ts`
- Modify: `src/lib/nutrition.ts`
- Modify: `src/lib/nutrition.test.ts`
- Modify: `src/pages/AddFoodFlow.tsx`
- Modify: `src/pages/ImportCsvModal.tsx`
- Modify: `src/pages/LogEntryModal.tsx`
- Modify: `db/nutrition_schema.sql`

**Interfaces:**
- Consumes: `useEditableRows`, `updateFood`, `setFoodIngredients`, `deleteFood`, `fetchIngredients`.
- Produces: `<FoodsTable foods={Food[]} allIngredients={Ingredient[]} onSaved={() => void} />`.

This task removes `Food.type` everywhere it is referenced, so it must touch every consumer in one commit to keep the build green.

- [ ] **Step 1: Remove `Food.type` and `FOOD_TYPES` from types**

In `src/types/nutrition.ts`: delete the `type: string | null` line from the `Food` interface, and delete the `FOOD_TYPES` export line.

- [ ] **Step 2: Remove `type` from foods in the lib**

In `src/lib/nutrition.ts`:
- `insertFood` signature → `input: { name: string }`.
- In `fetchFoodsWithIngredients`, delete the `type: row.type,` line from the mapped object.
- In `getOrCreateFoodByName`, change the insert call to `await insertFood({ name }, [])`.

- [ ] **Step 3: Fix the test helper**

In `src/lib/nutrition.test.ts`, change the `food` helper (line ~8) to drop `type`:

```ts
function food(id: string, name: string, ingredients: Ingredient[]): Food {
  return { id, name, created_at: '', ingredients }
}
```

- [ ] **Step 4: Remove meal type from AddFoodFlow**

In `src/pages/AddFoodFlow.tsx`:
- Remove `FOOD_TYPES` from the import on line 3 (delete that import line entirely — it only imported `FOOD_TYPES`).
- Delete the `const [type, setType] = useState('')` line.
- Delete the `MEAL TYPE` label + `<select>` block (lines ~132–136).
- Change the save call to `await insertFood({ name: name.trim() }, pickedIds)`.

- [ ] **Step 5: Fix ImportCsvModal foods format**

In `src/pages/ImportCsvModal.tsx`:
- In the `'foods'` branch, change destructuring to `const [name, ingredientsCell] = r` and the insert to `await insertFood({ name: name.trim() }, ids)`.
- Update the foods `<option>` label to `Foods — name, ingredients`.

- [ ] **Step 6: Remove `f.type` from LogEntryModal suggestions**

In `src/pages/LogEntryModal.tsx`, in the suggestions map (line ~178), change the button content from `{f.name}{f.type ? \` · ${f.type}\` : ''}` to just `{f.name}`.

- [ ] **Step 7: Drop the column from the schema file**

In `db/nutrition_schema.sql`, delete the `type text,` line from the `nutrition_foods` create-table block. (The migration `alter ... drop column` note added in Task 1 already documents the live migration.)

- [ ] **Step 8: Add FoodsTable CSS (ingredient chip editor)**

Create `src/pages/FoodsTable.module.css`:

```css
.chips { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 5px; }
.chip {
  display: inline-flex; align-items: center; gap: 4px;
  background: var(--accent-l); color: var(--accent);
  border-radius: 12px; padding: 2px 8px; font-size: 12px;
}
.chipRemove { background: none; border: none; color: var(--accent); cursor: pointer; font-size: 13px; padding: 0; }
.ingEditor { position: relative; }
.suggestions {
  position: absolute; z-index: 5; left: 0; right: 0; top: 100%;
  background: var(--card); border: 1px solid var(--border); border-radius: 8px;
  margin-top: 2px; max-height: 180px; overflow-y: auto;
}
.suggestion {
  display: block; width: 100%; text-align: left; background: none; border: none;
  padding: 6px 9px; font: inherit; color: var(--ink); cursor: pointer;
}
.suggestion:hover { background: var(--accent-l); }
.ingList { font-size: 13px; color: var(--ink2); }
```

- [ ] **Step 9: Implement `FoodsTable`**

Create `src/pages/FoodsTable.tsx`. The Ingredients cell holds an `ingredientIds: string[]` working field plus the names for display; on save it calls `setFoodIngredients`.

```tsx
import { useMemo, useState } from 'react'
import type { Food, Ingredient } from '../types/nutrition'
import { useEditableRows } from '../lib/useEditableRows'
import { updateFood, setFoodIngredients, deleteFood } from '../lib/nutrition'
import styles from './Nutrition.module.css'
import ft from './FoodsTable.module.css'

interface Props {
  foods: Food[]
  allIngredients: Ingredient[]
  onSaved: () => void
}

interface FoodRow { id: string; name: string; ingredientIds: string[] }

function toRow(f: Food): FoodRow {
  return { id: f.id, name: f.name, ingredientIds: (f.ingredients ?? []).map(i => i.id) }
}

export default function FoodsTable({ foods, allIngredients, onSaved }: Props) {
  const source = useMemo(() => foods.map(toRow), [foods])
  const t = useEditableRows<FoodRow>(source)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const nameById = useMemo(
    () => new Map(allIngredients.map(i => [i.id, i.name])), [allIngredients])

  async function save() {
    setSaving(true); setError('')
    try {
      for (const id of t.deletedIds) await deleteFood(id)
      for (const r of t.dirtyRows) {
        await updateFood(r.id, { name: r.name.trim() })
        await setFoodIngredients(r.id, r.ingredientIds)
      }
      onSaved(); t.finish()
    } catch (e: any) {
      setError(e?.message ?? 'Could not save foods.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className={styles.tableHead}>
        <span className={styles.sectionLabel}>Foods ({foods.length})</span>
        <div className={styles.tableActions}>
          {t.editing ? (
            <>
              <button className={styles.tableBtn} disabled={saving} onClick={save}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button className={styles.tableBtn} disabled={saving} onClick={t.cancel}>Cancel</button>
            </>
          ) : (
            foods.length > 0 && <button className={styles.tableBtn} onClick={t.begin}>Edit</button>
          )}
        </div>
      </div>
      {error && <p className={styles.tableError}>{error}</p>}
      {foods.length === 0 ? (
        <p className={styles.empty}>No foods yet.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Food name</th><th>Ingredients</th>{t.editing && <th />}</tr>
            </thead>
            <tbody>
              {t.rows.map(r => (
                <tr key={r.id}>
                  <td>
                    {t.editing
                      ? <input className={styles.cellInput} value={r.name}
                          onChange={e => t.setRow(r.id, { name: e.target.value })} />
                      : r.name}
                  </td>
                  <td>
                    {t.editing
                      ? <IngredientCell
                          ids={r.ingredientIds}
                          all={allIngredients}
                          onChange={ids => t.setRow(r.id, { ingredientIds: ids })} />
                      : <span className={ft.ingList}>
                          {r.ingredientIds.map(id => nameById.get(id) ?? '?').join(', ') || '—'}
                        </span>}
                  </td>
                  {t.editing && (
                    <td><button className={styles.rowDelete} title="Delete"
                      onClick={() => t.removeRow(r.id)}>×</button></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function IngredientCell(
  { ids, all, onChange }: { ids: string[]; all: Ingredient[]; onChange: (ids: string[]) => void }
) {
  const [query, setQuery] = useState('')
  const byId = new Map(all.map(i => [i.id, i]))
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return all.filter(i => i.name.toLowerCase().includes(q) && !ids.includes(i.id)).slice(0, 8)
  }, [query, all, ids])

  return (
    <div className={ft.ingEditor}>
      <div className={ft.chips}>
        {ids.map(id => (
          <span key={id} className={ft.chip}>
            {byId.get(id)?.name ?? '?'}
            <button className={ft.chipRemove} onClick={() => onChange(ids.filter(x => x !== id))}>×</button>
          </span>
        ))}
      </div>
      <input className={styles.cellInput} value={query}
        placeholder="Add ingredient…" onChange={e => setQuery(e.target.value)} />
      {query.trim() && suggestions.length > 0 && (
        <div className={ft.suggestions}>
          {suggestions.map(i => (
            <button key={i.id} className={ft.suggestion}
              onClick={() => { onChange([...ids, i.id]); setQuery('') }}>
              {i.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 10: Replace the foods cards and remove the detail view in Nutrition**

In `src/pages/Nutrition.tsx`:
- Add import: `import FoodsTable from './FoodsTable'`.
- Delete the entire **food detail view** block — the `if (detailFood) { ... }` early return (lines ~138–167).
- Delete the `detailFood` state (`const [detailFood, setDetailFood] = useState<Food | null>(null)`) and any remaining references to `setDetailFood` (the `onOpenFood` prop passed to `AddFoodFlow`, and the food card `Open →` button).
- Replace the foods section (the `<p className={styles.sectionLabel}>Foods (...)</p>` + `foods.map(...)` cards, lines ~275–288) with:

```tsx
<FoodsTable foods={foods} allIngredients={ingredients} onSaved={load} />
```

- In the `AddFoodFlow` render (line ~305), remove the `onOpenFood` prop, and in `src/pages/AddFoodFlow.tsx` remove `onOpenFood` from `Props` and the match-banner "Open it instead" button that used it (lines ~114–121 and the `onOpenFood` references). Keep the rest of the match banner text.
- Remove the now-unused `distinctIngredientTypes` import if nothing else uses it.

- [ ] **Step 11: Verify build, tests, manual check**

Run: `npm test`
Expected: PASS.
Run: `npm run build`
Expected: succeeds (no references to `Food.type`, `FOOD_TYPES`, `detailFood`, or `onOpenFood`).
Run: `npm run dev` → Nutrition → Library. Edit the Foods table: rename a food, add/remove ingredients via the chip editor, delete a food, Save → confirm reload. Add a new food via **+ Food** (no meal-type field present). Confirm there is no longer an "Open →" detail link.

- [ ] **Step 12: Commit**

```bash
git add src/pages/FoodsTable.tsx src/pages/FoodsTable.module.css src/pages/Nutrition.tsx src/types/nutrition.ts src/lib/nutrition.ts src/lib/nutrition.test.ts src/pages/AddFoodFlow.tsx src/pages/ImportCsvModal.tsx src/pages/LogEntryModal.tsx db/nutrition_schema.sql
git commit -m "feat(nutrition): editable foods table; drop type from foods"
```

---

### Task 6: Log Table view + type field in modal + CSV log type

**Files:**
- Create: `src/pages/LogTable.tsx`
- Modify: `src/pages/Nutrition.tsx`
- Modify: `src/pages/Nutrition.module.css`
- Modify: `src/pages/LogEntryModal.tsx`
- Modify: `src/pages/ImportCsvModal.tsx`
- Test: `src/lib/nutrition.test.ts`

**Interfaces:**
- Consumes: `useEditableRows`, `updateLogEntries`, `deleteLogEntry`, `splitDateTime`, `combineDateTime`, `LOG_TYPES`, `LOG_UNITS`, `validateLogType` (added below).
- Produces: `<LogTable log={LogEntry[]} foods={Food[]} onSaved={() => void} />`; `validateLogType(raw: string): string | null` in `lib/nutrition.ts`.

- [ ] **Step 1: Write the failing test for `validateLogType`**

Add to `src/lib/nutrition.test.ts` (and add `validateLogType` to the import):

```ts
describe('validateLogType', () => {
  it('accepts a known type case-insensitively, normalised to lowercase', () => {
    expect(validateLogType('Main')).toBe('main')
    expect(validateLogType('salty snack')).toBe('salty snack')
  })
  it('returns null for blank input', () => {
    expect(validateLogType('')).toBeNull()
    expect(validateLogType('   ')).toBeNull()
  })
  it('throws for an unknown type', () => {
    expect(() => validateLogType('brunch')).toThrow()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `validateLogType is not a function`.

- [ ] **Step 3: Implement `validateLogType`**

In `src/lib/nutrition.ts`, add to the "Pure helpers" section (add `LOG_TYPES` to the import from `../types/nutrition` at the top):

```ts
export function validateLogType(raw: string): string | null {
  const v = raw.trim().toLowerCase()
  if (!v) return null
  if (!(LOG_TYPES as readonly string[]).includes(v)) {
    throw new Error(`Unknown type "${raw}". Use one of: ${LOG_TYPES.join(', ')}.`)
  }
  return v
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Add Type to LogEntryModal**

In `src/pages/LogEntryModal.tsx`:
- Add `LOG_TYPES` to the import from `../types/nutrition`.
- Add state: `const [type, setType] = useState<string>(entry?.type ?? '')`.
- After the `EATEN AT` block, add a Type select:

```tsx
<label className={formStyles.label}>TYPE <span className={formStyles.optional}>(optional)</span></label>
<select className={formStyles.input} value={type} onChange={e => setType(e.target.value)}>
  <option value="">— none —</option>
  {LOG_TYPES.map(x => <option key={x} value={x}>{x}</option>)}
</select>
```

- In `handleSave`, include `type` in each row object:

```tsx
return { food_id: r.food.id, amount: amt, unit: amt != null ? r.unit : null, type: type || null, eaten_at }
```

- [ ] **Step 6: Add type to the CSV log format**

In `src/pages/ImportCsvModal.tsx`:
- Add `validateLogType` to the lib import.
- In the `'log'` branch, change destructuring to `const [foodName, typeRaw, amount, unit, eatenAt] = r` and the header drop stays `dropHeader(rows, 'food')`.
- Compute the type and skip the row on an invalid value:

```tsx
let logType: string | null = null
try { logType = validateLogType(typeRaw ?? '') }
catch (e: any) { sum.errors.push(`${e?.message ?? 'Bad type'} (row: ${r.join(',')})`); continue }
```

- Pass it to the insert: `await insertLogEntry({ food_id: food.id, amount: amt, unit: u, type: logType, eaten_at: when.toISOString() })`.
- Update the log `<option>` label to `Log — food, type, amount, unit, eaten_at`.

- [ ] **Step 7: Add the Log view-toggle CSS**

Append to `src/pages/Nutrition.module.css`:

```css
.subToggle { display: flex; gap: 6px; margin-bottom: 12px; }
.subBtn {
  padding: 5px 12px; border: 1px solid var(--border); border-radius: 16px;
  background: none; font-size: 13px; color: var(--ink2); cursor: pointer;
}
.subBtnActive { background: var(--accent-l); color: var(--accent); border-color: var(--accent); }
```

- [ ] **Step 8: Implement `LogTable`**

Create `src/pages/LogTable.tsx`:

```tsx
import { useMemo, useState } from 'react'
import type { Food, LogEntry } from '../types/nutrition'
import { LOG_TYPES, LOG_UNITS } from '../types/nutrition'
import { useEditableRows } from '../lib/useEditableRows'
import { updateLogEntries, deleteLogEntry, splitDateTime, combineDateTime } from '../lib/nutrition'
import styles from './Nutrition.module.css'

interface Props {
  log: LogEntry[]
  foods: Food[]
  onSaved: () => void
}

interface LogRow {
  id: string
  date: string
  time: string
  type: string | null
  food_id: string
  foodName: string
  amount: string
  unit: string
}

function toRow(e: LogEntry, foodName: string): LogRow {
  const { date, time } = splitDateTime(e.eaten_at)
  return {
    id: e.id, date, time, type: e.type, food_id: e.food_id, foodName,
    amount: e.amount != null ? String(e.amount) : '',
    unit: e.unit ?? '',
  }
}

export default function LogTable({ log, foods, onSaved }: Props) {
  const nameById = useMemo(() => new Map(foods.map(f => [f.id, f.name])), [foods])
  const source = useMemo(
    () => log.map(e => toRow(e, e.food?.name ?? nameById.get(e.food_id) ?? 'Unknown food')),
    [log, nameById])
  const t = useEditableRows<LogRow>(source)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setSaving(true); setError('')
    try {
      for (const id of t.deletedIds) await deleteLogEntry(id)
      const rows = t.dirtyRows.map(r => {
        const amt = r.amount.trim() ? Number(r.amount) : null
        if (amt != null && !(amt > 0)) throw new Error(`Amount for ${r.foodName} must be positive.`)
        return {
          id: r.id, food_id: r.food_id, amount: amt,
          unit: amt != null ? r.unit : null, type: r.type,
          eaten_at: combineDateTime(r.date, r.time),
        }
      })
      await updateLogEntries(rows)
      onSaved(); t.finish()
    } catch (e: any) {
      setError(e?.message ?? 'Could not save log.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className={styles.tableHead}>
        <span className={styles.sectionLabel}>Log ({log.length})</span>
        <div className={styles.tableActions}>
          {t.editing ? (
            <>
              <button className={styles.tableBtn} disabled={saving} onClick={save}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button className={styles.tableBtn} disabled={saving} onClick={t.cancel}>Cancel</button>
            </>
          ) : (
            log.length > 0 && <button className={styles.tableBtn} onClick={t.begin}>Edit</button>
          )}
        </div>
      </div>
      {error && <p className={styles.tableError}>{error}</p>}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr><th>Date</th><th>Time</th><th>Type</th><th>Food</th><th>Amount</th><th>Unit</th>{t.editing && <th />}</tr>
          </thead>
          <tbody>
            {t.rows.map(r => (
              <tr key={r.id}>
                <td>{t.editing
                  ? <input type="date" className={styles.cellInput} value={r.date}
                      onChange={e => t.setRow(r.id, { date: e.target.value })} />
                  : r.date}</td>
                <td>{t.editing
                  ? <input type="time" className={styles.cellInput} value={r.time}
                      onChange={e => t.setRow(r.id, { time: e.target.value })} />
                  : r.time}</td>
                <td>{t.editing
                  ? <select className={styles.cellSelect} value={r.type ?? ''}
                      onChange={e => t.setRow(r.id, { type: e.target.value || null })}>
                      <option value="">—</option>
                      {LOG_TYPES.map(x => <option key={x} value={x}>{x}</option>)}
                    </select>
                  : (r.type ?? '—')}</td>
                <td>{t.editing
                  ? <select className={styles.cellSelect} value={r.food_id}
                      onChange={e => t.setRow(r.id, {
                        food_id: e.target.value,
                        foodName: nameById.get(e.target.value) ?? '',
                      })}>
                      {foods.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  : r.foodName}</td>
                <td>{t.editing
                  ? <input type="number" min="0" step="any" className={styles.cellInput} value={r.amount}
                      onChange={e => t.setRow(r.id, { amount: e.target.value })} />
                  : (r.amount || '—')}</td>
                <td>{t.editing
                  ? <select className={styles.cellSelect} value={r.unit}
                      onChange={e => t.setRow(r.id, { unit: e.target.value })}>
                      <option value="">—</option>
                      {LOG_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  : (r.unit || '—')}</td>
                {t.editing && (
                  <td><button className={styles.rowDelete} title="Delete"
                    onClick={() => t.removeRow(r.id)}>×</button></td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
```

Note: the food picker uses a plain `<select>` of existing foods (not a free-text type-ahead) because the log table edits existing entries; creating new foods stays in the `+ Log entry` modal.

- [ ] **Step 9: Add the Timeline | Table toggle to the Log tab**

In `src/pages/Nutrition.tsx`:
- Add import: `import LogTable from './LogTable'`.
- Add state near the other `useState` calls: `const [logView, setLogView] = useState<'timeline' | 'table'>('timeline')`.
- In the `tab === 'log'` branch, immediately after the `<div className={styles.actions}>…+ Log entry…</div>`, add the toggle:

```tsx
<div className={styles.subToggle}>
  <button className={`${styles.subBtn} ${logView === 'timeline' ? styles.subBtnActive : ''}`}
    onClick={() => setLogView('timeline')}>Timeline</button>
  <button className={`${styles.subBtn} ${logView === 'table' ? styles.subBtnActive : ''}`}
    onClick={() => setLogView('table')}>Table</button>
</div>
```

- Wrap the existing timeline rendering (the `log.length === 0 ? emptyState : <div className={styles.logLayout}>…`) so the table shows when `logView === 'table'`:

```tsx
{logView === 'table' ? (
  <LogTable log={log} foods={foods} onSaved={load} />
) : log.length === 0 ? (
  /* existing empty state */
) : (
  /* existing timeline logLayout */
)}
```

- [ ] **Step 10: Verify build, tests, manual check**

Run: `npm test`
Expected: PASS (including `validateLogType`).
Run: `npm run build`
Expected: succeeds.
Run: `npm run dev` → Nutrition → Log → **Table**. Click **Edit**: change a date, time, type, food, amount, unit; delete a row; **Save** → confirm reload and that the Timeline view reflects the same changes. Open **+ Log entry**, set a Type, save, and confirm it shows in the table. Test CSV import with a `Log — food, type, amount, unit, eaten_at` row including a valid type and an invalid one (the invalid row is skipped with an error message).

- [ ] **Step 11: Commit**

```bash
git add src/pages/LogTable.tsx src/pages/Nutrition.tsx src/pages/Nutrition.module.css src/pages/LogEntryModal.tsx src/pages/ImportCsvModal.tsx src/lib/nutrition.test.ts
git commit -m "feat(nutrition): editable log table view with type field"
```

---

## Notes for the implementer

- After Task 1, run the two `alter table` statements from the migration note in `db/nutrition_schema.sql` against the live Supabase database (SQL editor) so the app and DB agree. The app reads/writes `nutrition_consumption_log.type` from Task 6 and stops referencing `nutrition_foods.type` from Task 5.
- `useEditableRows`' `rowsEqual` is shallow. `FoodRow.ingredientIds` and `LogRow` fields are all primitives or arrays-replaced-on-change, so dirty detection works; never mutate an array/object in place — always pass a new one to `setRow`.
