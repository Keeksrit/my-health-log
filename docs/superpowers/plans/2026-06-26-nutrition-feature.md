# Nutrition Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Nutrition page where the user builds a personal food library (foods defined by their exact ingredient set) and logs what they eat against it.

**Architecture:** Mirror the proven medications feature: four `nutrition_*` tables in the Supabase `health` schema, a `lib/nutrition.ts` data module (own schema-scoped client + CRUD + pure helpers), a `types/nutrition.ts` module, and a single `/nutrition` route with Log/Library tabs whose add/import actions are bottom-sheet modals. Set-matching and CSV parsing run client-side in pure, unit-tested helpers.

**Tech Stack:** React 18 + TypeScript, react-router-dom v6, Supabase JS client (`health` schema), Vite, CSS modules. Vitest added for the three pure helpers.

## Global Constraints

- Target the Supabase `health` schema via a `createClient(url, key, { db: { schema: 'health' } })` client, exactly like `src/lib/medication.ts`. Read URL/key from `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
- All four tables are prefixed `nutrition_`.
- Primary keys are database-generated UUIDs (`gen_random_uuid()`), never user-typed.
- `name` is **unique and matched case-insensitively** on both `nutrition_foods` and `nutrition_ingredients` (enforced by a unique index on `lower(name)`).
- The consumption log references a food by `food_id` (FK), never by name.
- Only `name` is mandatory when creating a food; `type` and ingredients are optional. Ingredient `type` is optional.
- `amount` must be a positive number; `unit ∈ {g, ml, serving, piece}`; food `type ∈ {Breakfast, Lunch, Dinner, Snack, Drink} | null`; ingredient `type ∈ {Grains & Starches, Proteins, Dairy, Dairy alternative, Fruit, Vegetable, Fats & Oils, Processed} | null`.
- Supabase errors surface as **visible messages inside each modal** (improving on the existing console-only / `alert()` pattern). Duplicate-name conflicts are caught and explained.
- No new runtime dependencies (no `papaparse`). CSV parsing is a dependency-free helper.
- Follow existing file conventions: CSS modules, `Modal.module.css` for the bottom-sheet overlay/sheet/handle, two-space indent, no semicolons (match surrounding files).

---

## File Structure

| File | Responsibility |
|------|----------------|
| `db/nutrition_schema.sql` (new) | The SQL migration to run in Supabase. Reference artifact, not imported. |
| `src/types/nutrition.ts` (new) | `Ingredient`, `Food`, `LogEntry` interfaces + the `INGREDIENT_TYPES` / `FOOD_TYPES` / `LOG_UNITS` constant lists. |
| `src/lib/nutrition.ts` (new) | Schema-scoped client, CRUD for all four tables, get-or-create stub helpers, and the three pure helpers (`matchFoodByIngredientSet`, `parseCsv`, `distinctIngredientTypes`). |
| `src/lib/nutrition.test.ts` (new) | Vitest unit tests for the three pure helpers. |
| `src/pages/Nutrition.tsx` + `.module.css` (new) | Tabbed page (Log \| Library); owns data load + modal state; renders food detail inline. |
| `src/pages/AddIngredientModal.tsx` (new) | Modal: name + optional type. |
| `src/pages/LogEntryModal.tsx` (new) | Modal: pick food, amount, unit, eaten_at. Also handles editing an existing log entry. |
| `src/pages/AddFoodFlow.tsx` + `.module.css` (new) | Modal: ingredient picker (autocomplete + inline create) with live duplicate-set detection, then name + optional type. |
| `src/pages/ImportCsvModal.tsx` (new) | Modal: pick format, upload/paste, preview, confirm, summary. |
| `src/App.tsx` (modify) | Add `/nutrition` route. |
| `src/components/layout/BottomNav.tsx` (modify) | Add 🥗 Nutrition nav entry. |
| `vite.config.ts` (modify) | Add vitest `test` config. |
| `package.json` (modify) | Add `vitest` devDep + `test` script. |

Shared modal styling reuses `src/pages/Modal.module.css` and `src/pages/AddMedicationFlow.module.css` (imported as `modalStyles` / `formStyles`) so no new generic form CSS is needed; only `Nutrition.module.css` and `AddFoodFlow.module.css` add feature-specific styles.

---

## Task 1: Database schema migration

**Files:**
- Create: `db/nutrition_schema.sql`

**Interfaces:**
- Produces: four tables in the `health` schema — `nutrition_ingredients`, `nutrition_foods`, `nutrition_food_ingredients`, `nutrition_consumption_log` — consumed by every later task through `src/lib/nutrition.ts`.

- [ ] **Step 1: Write the migration SQL**

Create `db/nutrition_schema.sql`:

```sql
-- Nutrition feature schema (health schema)
-- Run in the Supabase SQL editor.

create table if not exists health.nutrition_ingredients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        text,
  created_at  timestamptz not null default now()
);
create unique index if not exists nutrition_ingredients_name_lower_idx
  on health.nutrition_ingredients (lower(name));

create table if not exists health.nutrition_foods (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        text,
  created_at  timestamptz not null default now()
);
create unique index if not exists nutrition_foods_name_lower_idx
  on health.nutrition_foods (lower(name));

create table if not exists health.nutrition_food_ingredients (
  food_id        uuid not null references health.nutrition_foods(id) on delete cascade,
  ingredient_id  uuid not null references health.nutrition_ingredients(id) on delete restrict,
  primary key (food_id, ingredient_id)
);

create table if not exists health.nutrition_consumption_log (
  id          uuid primary key default gen_random_uuid(),
  food_id     uuid not null references health.nutrition_foods(id) on delete restrict,
  amount      numeric not null,
  unit        text not null,
  eaten_at    timestamptz not null,
  created_at  timestamptz not null default now()
);
```

- [ ] **Step 2: Apply the migration in Supabase**

Run the contents of `db/nutrition_schema.sql` in the Supabase SQL editor for the project pointed to by `VITE_SUPABASE_URL`.
Expected: "Success. No rows returned." Verify in the Table editor that all four `nutrition_*` tables exist under the `health` schema.

> Note: the project has no SQL migration runner; this file is a checked-in reference and is applied manually, consistent with how the existing `medication_*` / `entries` tables are managed.

- [ ] **Step 3: Commit**

```bash
git add db/nutrition_schema.sql
git commit -m "feat(nutrition): add health-schema tables for nutrition feature"
```

---

## Task 2: TypeScript types

**Files:**
- Create: `src/types/nutrition.ts`

**Interfaces:**
- Produces:
  - `interface Ingredient { id: string; name: string; type: string | null; created_at: string }`
  - `interface Food { id: string; name: string; type: string | null; created_at: string; ingredients?: Ingredient[] }`
  - `interface LogEntry { id: string; food_id: string; amount: number; unit: string; eaten_at: string; created_at: string; food?: Food }`
  - `const INGREDIENT_TYPES: readonly string[]`, `const FOOD_TYPES: readonly string[]`, `const LOG_UNITS: readonly string[]`
  - These are consumed by Tasks 3–10.

- [ ] **Step 1: Write the types file**

Create `src/types/nutrition.ts`:

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
  amount: number
  unit: string
  eaten_at: string
  created_at: string
  // joined
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

export const FOOD_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Drink'] as const

export const LOG_UNITS = ['g', 'ml', 'serving', 'piece'] as const
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/nutrition.ts
git commit -m "feat(nutrition): add Ingredient, Food, LogEntry types"
```

---

## Task 3: Pure helpers + test infrastructure

This task sets up Vitest (the project currently has no test runner) and implements the three pure helpers test-first, since the spec scopes automated tests to exactly these helpers.

**Files:**
- Modify: `package.json` (add `vitest` devDep + `"test"` script)
- Modify: `vite.config.ts` (add `test` config)
- Create: `src/lib/nutrition.test.ts`
- Create: `src/lib/nutrition.ts` (helpers only in this task; CRUD added in Task 4)

**Interfaces:**
- Consumes: `Ingredient`, `Food`, `INGREDIENT_TYPES` from `src/types/nutrition.ts`.
- Produces (all pure, no I/O):
  - `matchFoodByIngredientSet(foods: Food[], ingredientIds: string[]): Food | null` — returns the food whose joined `ingredients` set of ids exactly equals `ingredientIds` (order-independent, no dups assumed), else `null`. Foods without an `ingredients` array are treated as having an empty set.
  - `parseCsv(text: string): string[][]` — splits CSV into rows of fields; supports double-quoted fields containing commas, newlines, and escaped quotes (`""`). Trims a trailing blank line. Does not interpret a header row.
  - `distinctIngredientTypes(ingredients: Ingredient[]): string[]` — distinct non-null types, ordered by `INGREDIENT_TYPES` canonical order.

- [ ] **Step 1: Install Vitest**

Run: `npm install -D vitest`
Expected: `vitest` added to `devDependencies`; exits 0.

- [ ] **Step 2: Add the `test` script to package.json**

In `package.json`, add to `"scripts"`:

```json
    "test": "vitest run"
```

(Place it after the `"preview": "vite preview"` line, adding the trailing comma to `preview`.)

- [ ] **Step 3: Configure Vitest in vite.config.ts**

Replace `vite.config.ts` with:

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 4: Write the failing tests**

Create `src/lib/nutrition.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { matchFoodByIngredientSet, parseCsv, distinctIngredientTypes } from './nutrition'
import type { Food, Ingredient } from '../types/nutrition'

function ing(id: string, name: string, type: string | null = null): Ingredient {
  return { id, name, type, created_at: '' }
}
function food(id: string, name: string, ingredients: Ingredient[]): Food {
  return { id, name, type: null, created_at: '', ingredients }
}

describe('matchFoodByIngredientSet', () => {
  const pasta1 = food('f1', 'Pepperoni Pasta', [ing('a', 'pepperoni'), ing('b', 'coconut milk'), ing('c', 'pasta')])
  const pasta2 = food('f2', 'Pepperoni Pasta 2', [ing('a', 'pepperoni'), ing('d', 'heavy cream'), ing('c', 'pasta')])
  const foods = [pasta1, pasta2]

  it('matches an exact set regardless of order', () => {
    expect(matchFoodByIngredientSet(foods, ['c', 'a', 'b'])).toBe(pasta1)
  })

  it('distinguishes foods that differ by one ingredient', () => {
    expect(matchFoodByIngredientSet(foods, ['a', 'd', 'c'])).toBe(pasta2)
  })

  it('returns null when no food has that exact set', () => {
    expect(matchFoodByIngredientSet(foods, ['a', 'c'])).toBeNull()
  })

  it('matches an empty set against a food with no ingredients', () => {
    const plain = food('f3', 'Water', [])
    expect(matchFoodByIngredientSet([plain], [])).toBe(plain)
  })
})

describe('parseCsv', () => {
  it('parses simple rows', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']])
  })

  it('handles quoted fields containing commas', () => {
    expect(parseCsv('name,ingredients\nPasta,"pepperoni, pasta, cream"')).toEqual([
      ['name', 'ingredients'],
      ['Pasta', 'pepperoni, pasta, cream'],
    ])
  })

  it('handles escaped double quotes inside a quoted field', () => {
    expect(parseCsv('"he said ""hi"""')).toEqual([['he said "hi"']])
  })

  it('ignores a trailing newline', () => {
    expect(parseCsv('a,b\n')).toEqual([['a', 'b']])
  })
})

describe('distinctIngredientTypes', () => {
  it('returns distinct types in canonical order, dropping nulls', () => {
    const list = [
      ing('1', 'pasta', 'Grains & Starches'),
      ing('2', 'pepperoni', 'Proteins'),
      ing('3', 'olive oil', 'Fats & Oils'),
      ing('4', 'mystery', null),
      ing('5', 'penne', 'Grains & Starches'),
    ]
    expect(distinctIngredientTypes(list)).toEqual(['Grains & Starches', 'Proteins', 'Fats & Oils'])
  })

  it('returns an empty array when all types are null', () => {
    expect(distinctIngredientTypes([ing('1', 'x', null)])).toEqual([])
  })
})
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `nutrition.ts` has no such exports (import/resolve error or "is not a function").

- [ ] **Step 6: Implement the helpers**

Create `src/lib/nutrition.ts`:

```ts
import type { Food, Ingredient } from '../types/nutrition'
import { INGREDIENT_TYPES } from '../types/nutrition'

// ── Pure helpers ───────────────────────────────────────
export function matchFoodByIngredientSet(foods: Food[], ingredientIds: string[]): Food | null {
  const target = new Set(ingredientIds)
  for (const f of foods) {
    const ids = (f.ingredients ?? []).map(i => i.id)
    if (ids.length === target.size && ids.every(id => target.has(id))) return f
  }
  return null
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuotes = false; i++; continue
      }
      field += ch; i++; continue
    }
    if (ch === '"') { inQuotes = true; i++; continue }
    if (ch === ',') { row.push(field); field = ''; i++; continue }
    if (ch === '\n' || ch === '\r') {
      // swallow \r\n as one break
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field); rows.push(row); field = ''; row = []; i++; continue
    }
    field += ch; i++
  }
  // flush trailing field/row unless the input ended exactly on a row break
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }
  return rows
}

export function distinctIngredientTypes(ingredients: Ingredient[]): string[] {
  const present = new Set(ingredients.map(i => i.type).filter((t): t is string => t != null))
  return INGREDIENT_TYPES.filter(t => present.has(t))
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all three describe blocks green.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vite.config.ts src/lib/nutrition.ts src/lib/nutrition.test.ts
git commit -m "feat(nutrition): add pure helpers (set match, csv parse, distinct types) with vitest"
```

---

## Task 4: Data-access layer (CRUD + stub helpers)

**Files:**
- Modify: `src/lib/nutrition.ts` (append the client + async functions; keep the pure helpers from Task 3 at the top)

**Interfaces:**
- Consumes: `Ingredient`, `Food`, `LogEntry` from `src/types/nutrition.ts`.
- Produces (all `throw` on Supabase error, matching `lib/medication.ts`):
  - `fetchIngredients(): Promise<Ingredient[]>`
  - `insertIngredient(input: { name: string; type: string | null }): Promise<Ingredient>`
  - `fetchFoodsWithIngredients(): Promise<Food[]>` — each `Food` has its `ingredients` array populated via the link table.
  - `insertFood(input: { name: string; type: string | null }, ingredientIds: string[]): Promise<Food>` — inserts the food then the link rows.
  - `fetchLog(): Promise<LogEntry[]>` — each `LogEntry` has `food` populated; ordered by `eaten_at` desc.
  - `insertLogEntry(input: { food_id: string; amount: number; unit: string; eaten_at: string }): Promise<void>`
  - `updateLogEntry(id: string, input: { food_id: string; amount: number; unit: string; eaten_at: string }): Promise<void>`
  - `deleteLogEntry(id: string): Promise<void>`
  - `getOrCreateIngredientByName(name: string): Promise<Ingredient>` — case-insensitive lookup, creates a stub (type null) if absent.
  - `getOrCreateFoodByName(name: string): Promise<Food>` — case-insensitive lookup, creates a stub (type null, no ingredients) if absent.

- [ ] **Step 1: Append the data layer to `src/lib/nutrition.ts`**

Add below the pure helpers (keep the existing `import type` line; add the value imports + client). The final import block at the top of the file becomes:

```ts
import { createClient } from '@supabase/supabase-js'
import type { Food, Ingredient, LogEntry } from '../types/nutrition'
import { INGREDIENT_TYPES } from '../types/nutrition'

const db = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  { db: { schema: 'health' } }
)
```

Then append these functions after the pure helpers:

```ts
// ── Ingredients ────────────────────────────────────────
export async function fetchIngredients(): Promise<Ingredient[]> {
  const { data, error } = await db
    .from('nutrition_ingredients')
    .select('*')
    .order('name')
  if (error) throw error
  return data as Ingredient[]
}

export async function insertIngredient(
  input: { name: string; type: string | null }
): Promise<Ingredient> {
  const { data, error } = await db
    .from('nutrition_ingredients')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data as Ingredient
}

export async function getOrCreateIngredientByName(name: string): Promise<Ingredient> {
  const { data, error } = await db
    .from('nutrition_ingredients')
    .select('*')
    .ilike('name', name)
    .maybeSingle()
  if (error) throw error
  if (data) return data as Ingredient
  return insertIngredient({ name, type: null })
}

// ── Foods ──────────────────────────────────────────────
export async function fetchFoodsWithIngredients(): Promise<Food[]> {
  const { data, error } = await db
    .from('nutrition_foods')
    .select('*, nutrition_food_ingredients(nutrition_ingredients(*))')
    .order('name')
  if (error) throw error
  return (data ?? []).map((row: any): Food => ({
    id: row.id,
    name: row.name,
    type: row.type,
    created_at: row.created_at,
    ingredients: (row.nutrition_food_ingredients ?? [])
      .map((link: any) => link.nutrition_ingredients as Ingredient)
      .filter(Boolean),
  }))
}

export async function insertFood(
  input: { name: string; type: string | null },
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

export async function getOrCreateFoodByName(name: string): Promise<Food> {
  const { data, error } = await db
    .from('nutrition_foods')
    .select('*')
    .ilike('name', name)
    .maybeSingle()
  if (error) throw error
  if (data) return data as Food
  return insertFood({ name, type: null }, [])
}

// ── Consumption log ────────────────────────────────────
export async function fetchLog(): Promise<LogEntry[]> {
  const { data, error } = await db
    .from('nutrition_consumption_log')
    .select('*, food:nutrition_foods(*)')
    .order('eaten_at', { ascending: false })
  if (error) throw error
  return data as LogEntry[]
}

export async function insertLogEntry(
  input: { food_id: string; amount: number; unit: string; eaten_at: string }
): Promise<void> {
  const { error } = await db.from('nutrition_consumption_log').insert(input)
  if (error) throw error
}

export async function updateLogEntry(
  id: string,
  input: { food_id: string; amount: number; unit: string; eaten_at: string }
): Promise<void> {
  const { error } = await db.from('nutrition_consumption_log').update(input).eq('id', id)
  if (error) throw error
}

export async function deleteLogEntry(id: string): Promise<void> {
  const { error } = await db.from('nutrition_consumption_log').delete().eq('id', id)
  if (error) throw error
}
```

> Note: `INGREDIENT_TYPES` is already imported for `distinctIngredientTypes`; keep the single import line shown above rather than importing it twice.

- [ ] **Step 2: Verify typecheck and that helper tests still pass**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; Task 3 tests still PASS (CRUD has no tests by design — it does I/O).

- [ ] **Step 3: Commit**

```bash
git add src/lib/nutrition.ts
git commit -m "feat(nutrition): add CRUD + get-or-create stub helpers"
```

---

## Task 5: Add Ingredient modal

**Files:**
- Create: `src/pages/AddIngredientModal.tsx`

**Interfaces:**
- Consumes: `insertIngredient` (Task 4), `INGREDIENT_TYPES` (Task 2), `Modal.module.css` + `AddMedicationFlow.module.css`.
- Produces: `export default function AddIngredientModal(props: { onClose: () => void; onSaved: (ingredient: Ingredient) => void })`. Calls `onSaved` with the created ingredient so callers (the inline-create path in Task 7) can use it immediately.

- [ ] **Step 1: Write the modal**

Create `src/pages/AddIngredientModal.tsx`:

```tsx
import { useState } from 'react'
import type { Ingredient } from '../types/nutrition'
import { INGREDIENT_TYPES } from '../types/nutrition'
import { insertIngredient } from '../lib/nutrition'
import modalStyles from './Modal.module.css'
import formStyles from './AddMedicationFlow.module.css'

interface Props {
  onClose: () => void
  onSaved: (ingredient: Ingredient) => void
  initialName?: string
}

export default function AddIngredientModal({ onClose, onSaved, initialName = '' }: Props) {
  const [name, setName] = useState(initialName)
  const [type, setType] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!name.trim()) { setError('Name is required.'); return }
    setSaving(true)
    setError('')
    try {
      const created = await insertIngredient({ name: name.trim(), type: type || null })
      onSaved(created)
    } catch (e: any) {
      if (e?.code === '23505') setError(`An ingredient named "${name.trim()}" already exists.`)
      else setError(e?.message ?? 'Something went wrong.')
      setSaving(false)
    }
  }

  return (
    <div className={modalStyles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={modalStyles.sheet}>
        <div className={modalStyles.handle} />
        <div className={formStyles.header}>
          <h2 className={modalStyles.title}>Add ingredient</h2>
          <button className={formStyles.cancelBtn} onClick={onClose}>Cancel</button>
        </div>

        <label className={formStyles.label}>NAME *</label>
        <input
          className={formStyles.input}
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Coconut milk"
          autoFocus
        />

        <label className={formStyles.label}>TYPE <span className={formStyles.optional}>(optional)</span></label>
        <select className={formStyles.input} value={type} onChange={e => setType(e.target.value)}>
          <option value="">— none —</option>
          {INGREDIENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        {error && <p className={modalStyles.desc} style={{ color: 'var(--danger, #B83A3A)' }}>{error}</p>}

        <button className={formStyles.nextBtn} disabled={saving || !name.trim()} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save ingredient'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/AddIngredientModal.tsx
git commit -m "feat(nutrition): add ingredient modal with inline error display"
```

---

## Task 6: Log Entry modal (create + edit)

**Files:**
- Create: `src/pages/LogEntryModal.tsx`

**Interfaces:**
- Consumes: `Food`, `LogEntry`, `LOG_UNITS` (Task 2); `insertLogEntry`, `updateLogEntry` (Task 4); `Modal.module.css` + `AddMedicationFlow.module.css`.
- Produces: `export default function LogEntryModal(props: { foods: Food[]; entry?: LogEntry | null; onClose: () => void; onSaved: () => void })`. When `entry` is supplied the modal edits it; otherwise it creates. The food list is passed in by the parent (already loaded) — the modal does not fetch.

- [ ] **Step 1: Write the modal**

Create `src/pages/LogEntryModal.tsx`:

```tsx
import { useState } from 'react'
import type { Food, LogEntry } from '../types/nutrition'
import { LOG_UNITS } from '../types/nutrition'
import { insertLogEntry, updateLogEntry } from '../lib/nutrition'
import modalStyles from './Modal.module.css'
import formStyles from './AddMedicationFlow.module.css'

interface Props {
  foods: Food[]
  entry?: LogEntry | null
  onClose: () => void
  onSaved: () => void
}

// datetime-local wants "YYYY-MM-DDTHH:mm"; trim a stored ISO string to that.
function toLocalInput(iso: string): string {
  return iso.slice(0, 16)
}

export default function LogEntryModal({ foods, entry, onClose, onSaved }: Props) {
  const [foodId, setFoodId] = useState(entry?.food_id ?? '')
  const [search, setSearch] = useState('')
  const [amount, setAmount] = useState(entry ? String(entry.amount) : '')
  const [unit, setUnit] = useState(entry?.unit ?? 'serving')
  const [eatenAt, setEatenAt] = useState(
    entry ? toLocalInput(entry.eaten_at) : new Date().toISOString().slice(0, 16)
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const filtered = search.trim()
    ? foods.filter(f => f.name.toLowerCase().includes(search.trim().toLowerCase()))
    : foods

  async function handleSave() {
    const amt = Number(amount)
    if (!foodId) { setError('Pick a food.'); return }
    if (!(amt > 0)) { setError('Amount must be a positive number.'); return }
    if (!eatenAt) { setError('Pick a date & time.'); return }
    setSaving(true)
    setError('')
    const payload = { food_id: foodId, amount: amt, unit, eaten_at: new Date(eatenAt).toISOString() }
    try {
      if (entry) await updateLogEntry(entry.id, payload)
      else await insertLogEntry(payload)
      onSaved()
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong.')
      setSaving(false)
    }
  }

  return (
    <div className={modalStyles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={modalStyles.sheet}>
        <div className={modalStyles.handle} />
        <div className={formStyles.header}>
          <h2 className={modalStyles.title}>{entry ? 'Edit entry' : 'Log entry'}</h2>
          <button className={formStyles.cancelBtn} onClick={onClose}>Cancel</button>
        </div>

        <label className={formStyles.label}>FOOD *</label>
        <input
          className={formStyles.input}
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search foods…"
        />
        <select
          className={formStyles.input}
          style={{ marginTop: 8 }}
          size={Math.min(6, Math.max(2, filtered.length))}
          value={foodId}
          onChange={e => setFoodId(e.target.value)}
        >
          {filtered.map(f => (
            <option key={f.id} value={f.id}>{f.name}{f.type ? ` · ${f.type}` : ''}</option>
          ))}
        </select>

        <label className={formStyles.label}>AMOUNT *</label>
        <input
          className={formStyles.input}
          type="number"
          min="0"
          step="any"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="e.g. 200"
        />

        <label className={formStyles.label}>UNIT</label>
        <select className={formStyles.input} value={unit} onChange={e => setUnit(e.target.value)}>
          {LOG_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
        </select>

        <label className={formStyles.label}>EATEN AT</label>
        <input
          className={formStyles.input}
          type="datetime-local"
          value={eatenAt}
          onChange={e => setEatenAt(e.target.value)}
        />

        {error && <p className={modalStyles.desc} style={{ color: 'var(--danger, #B83A3A)' }}>{error}</p>}

        <button className={formStyles.nextBtn} disabled={saving} onClick={handleSave}>
          {saving ? 'Saving…' : entry ? 'Save changes' : 'Log it'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/LogEntryModal.tsx
git commit -m "feat(nutrition): add log-entry modal (create + edit)"
```

---

## Task 7: Add Food flow (ingredient picker + duplicate-set detection)

**Files:**
- Create: `src/pages/AddFoodFlow.tsx`
- Create: `src/pages/AddFoodFlow.module.css`

**Interfaces:**
- Consumes: `Food`, `Ingredient`, `FOOD_TYPES` (Task 2); `matchFoodByIngredientSet`, `insertFood`, `fetchIngredients` (Tasks 3–4); `AddIngredientModal` (Task 5); `Modal.module.css` + `AddMedicationFlow.module.css`.
- Produces: `export default function AddFoodFlow(props: { foods: Food[]; onClose: () => void; onSaved: () => void; onOpenFood: (food: Food) => void })`. `foods` (with ingredients) is passed by the parent for client-side set-matching; `onOpenFood` lets the user jump to the matched existing food instead of duplicating.

- [ ] **Step 1: Write the styles**

Create `src/pages/AddFoodFlow.module.css`:

```css
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--accent-l);
  color: var(--accent);
  border-radius: 16px;
  padding: 5px 10px;
  font-size: 13px;
}

.chipRemove {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
}

.suggestions {
  border: 1px solid var(--border);
  border-radius: 10px;
  margin-top: 4px;
  max-height: 180px;
  overflow-y: auto;
}

.suggestion {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  padding: 10px 12px;
  font-size: 14px;
  color: var(--ink);
  border-bottom: 1px solid var(--border);
  cursor: pointer;
}

.suggestion:last-child { border-bottom: none; }
.suggestion:hover { background: var(--accent-l); }

.createRow {
  color: var(--accent);
  font-weight: 600;
}

.matchBanner {
  background: var(--accent-l);
  border: 1px solid var(--accent);
  border-radius: 10px;
  padding: 12px;
  margin: 12px 0;
  font-size: 14px;
  color: var(--ink);
}

.openMatchBtn {
  margin-top: 8px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 16px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
```

- [ ] **Step 2: Write the flow**

Create `src/pages/AddFoodFlow.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react'
import type { Food, Ingredient } from '../types/nutrition'
import { FOOD_TYPES } from '../types/nutrition'
import { fetchIngredients, insertFood, matchFoodByIngredientSet } from '../lib/nutrition'
import AddIngredientModal from './AddIngredientModal'
import modalStyles from './Modal.module.css'
import formStyles from './AddMedicationFlow.module.css'
import styles from './AddFoodFlow.module.css'

interface Props {
  foods: Food[]
  onClose: () => void
  onSaved: () => void
  onOpenFood: (food: Food) => void
}

export default function AddFoodFlow({ foods, onClose, onSaved, onOpenFood }: Props) {
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([])
  const [picked, setPicked] = useState<Ingredient[]>([])
  const [query, setQuery] = useState('')
  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)

  async function loadIngredients() {
    try { setAllIngredients(await fetchIngredients()) }
    catch (e: any) { setError(e?.message ?? 'Could not load ingredients.') }
  }
  useEffect(() => { loadIngredients() }, [])

  const pickedIds = picked.map(i => i.id)

  const match = useMemo(
    () => (picked.length ? matchFoodByIngredientSet(foods, pickedIds) : null),
    [foods, picked]
  )

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return allIngredients
      .filter(i => i.name.toLowerCase().includes(q) && !pickedIds.includes(i.id))
      .slice(0, 8)
  }, [query, allIngredients, picked])

  const exactExists = allIngredients.some(i => i.name.toLowerCase() === query.trim().toLowerCase())

  function addIngredient(ing: Ingredient) {
    if (!pickedIds.includes(ing.id)) setPicked([...picked, ing])
    setQuery('')
  }
  function removeIngredient(id: string) {
    setPicked(picked.filter(i => i.id !== id))
  }

  async function handleSave() {
    if (!name.trim()) { setError('A name is required.'); return }
    setSaving(true)
    setError('')
    try {
      await insertFood({ name: name.trim(), type: type || null }, pickedIds)
      onSaved()
    } catch (e: any) {
      if (e?.code === '23505') setError(`A food named "${name.trim()}" already exists.`)
      else setError(e?.message ?? 'Something went wrong.')
      setSaving(false)
    }
  }

  return (
    <div className={modalStyles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={modalStyles.sheet}>
        <div className={modalStyles.handle} />
        <div className={formStyles.header}>
          <h2 className={modalStyles.title}>Add food</h2>
          <button className={formStyles.cancelBtn} onClick={onClose}>Cancel</button>
        </div>

        <label className={formStyles.label}>INGREDIENTS <span className={formStyles.optional}>(optional)</span></label>
        {picked.length > 0 && (
          <div className={styles.chips}>
            {picked.map(i => (
              <span key={i.id} className={styles.chip}>
                {i.name}
                <button className={styles.chipRemove} onClick={() => removeIngredient(i.id)}>×</button>
              </span>
            ))}
          </div>
        )}
        <input
          className={formStyles.input}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Type to search ingredients…"
        />
        {query.trim() && (
          <div className={styles.suggestions}>
            {suggestions.map(i => (
              <button key={i.id} className={styles.suggestion} onClick={() => addIngredient(i)}>
                {i.name}{i.type ? ` · ${i.type}` : ''}
              </button>
            ))}
            {!exactExists && (
              <button className={`${styles.suggestion} ${styles.createRow}`} onClick={() => setCreateOpen(true)}>
                + Create “{query.trim()}”
              </button>
            )}
          </div>
        )}

        {match && (
          <div className={styles.matchBanner}>
            This is <strong>{match.name}</strong> — a food with exactly these ingredients already exists.
            <div>
              <button className={styles.openMatchBtn} onClick={() => onOpenFood(match)}>Open it instead</button>
            </div>
          </div>
        )}

        <label className={formStyles.label}>NAME *</label>
        <input
          className={formStyles.input}
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Pepperoni Pasta"
        />

        <label className={formStyles.label}>MEAL TYPE <span className={formStyles.optional}>(optional)</span></label>
        <select className={formStyles.input} value={type} onChange={e => setType(e.target.value)}>
          <option value="">— none —</option>
          {FOOD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        {error && <p className={modalStyles.desc} style={{ color: 'var(--danger, #B83A3A)' }}>{error}</p>}

        <button className={formStyles.nextBtn} disabled={saving || !name.trim()} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save food'}
        </button>
      </div>

      {createOpen && (
        <AddIngredientModal
          initialName={query.trim()}
          onClose={() => setCreateOpen(false)}
          onSaved={(ing) => {
            setCreateOpen(false)
            setAllIngredients(prev => [...prev, ing])
            addIngredient(ing)
          }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/AddFoodFlow.tsx src/pages/AddFoodFlow.module.css
git commit -m "feat(nutrition): add food flow with ingredient picker and duplicate-set detection"
```

---

## Task 8: CSV import modal

**Files:**
- Create: `src/pages/ImportCsvModal.tsx`

**Interfaces:**
- Consumes: `parseCsv`, `insertIngredient`, `getOrCreateIngredientByName`, `insertFood`, `getOrCreateFoodByName`, `insertLogEntry` (Tasks 3–4); `INGREDIENT_TYPES`, `FOOD_TYPES`, `LOG_UNITS` (Task 2); `Modal.module.css` + `AddMedicationFlow.module.css`.
- Produces: `export default function ImportCsvModal(props: { onClose: () => void; onSaved: () => void })`.
- Behaviour: pick format → upload/paste → preview parsed rows → confirm → insert leniently (unknown refs become stubs) → show a summary listing created stubs and unparseable rows.

- [ ] **Step 1: Write the modal**

Create `src/pages/ImportCsvModal.tsx`:

```tsx
import { useState } from 'react'
import { LOG_UNITS } from '../types/nutrition'
import {
  parseCsv,
  insertIngredient,
  getOrCreateIngredientByName,
  insertFood,
  getOrCreateFoodByName,
  insertLogEntry,
} from '../lib/nutrition'
import modalStyles from './Modal.module.css'
import formStyles from './AddMedicationFlow.module.css'

type Format = 'ingredients' | 'foods' | 'log'

interface Props {
  onClose: () => void
  onSaved: () => void
}

interface Summary {
  inserted: number
  stubs: string[]
  errors: string[]
}

// Treat the first row as a header only if it looks like one (non-numeric first cell
// matching a known column name). To stay lenient we simply drop a row whose first
// cell equals the expected header keyword.
function dropHeader(rows: string[][], firstHeader: string): string[][] {
  if (rows.length && rows[0][0]?.trim().toLowerCase() === firstHeader) return rows.slice(1)
  return rows
}

export default function ImportCsvModal({ onClose, onSaved }: Props) {
  const [format, setFormat] = useState<Format>('ingredients')
  const [text, setText] = useState('')
  const [rows, setRows] = useState<string[][] | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

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
    setBusy(true)
    setError('')
    const sum: Summary = { inserted: 0, stubs: [], errors: [] }
    try {
      if (format === 'ingredients') {
        for (const r of dropHeader(rows, 'name')) {
          const [name, type] = r
          if (!name?.trim()) { sum.errors.push(`Empty name in row: ${r.join(',')}`); continue }
          await insertIngredient({ name: name.trim(), type: type?.trim() || null })
          sum.inserted++
        }
      } else if (format === 'foods') {
        for (const r of dropHeader(rows, 'name')) {
          const [name, type, ingredientsCell] = r
          if (!name?.trim()) { sum.errors.push(`Empty name in row: ${r.join(',')}`); continue }
          const ingNames = (ingredientsCell ?? '')
            .split(',').map(s => s.trim()).filter(Boolean)
          const ids: string[] = []
          for (const ingName of ingNames) {
            const existing = await getOrCreateIngredientByName(ingName)
            // getOrCreateIngredientByName creates a stub when missing; flag new stubs.
            if (existing.type === null) sum.stubs.push(`ingredient: ${existing.name}`)
            ids.push(existing.id)
          }
          await insertFood({ name: name.trim(), type: type?.trim() || null }, ids)
          sum.inserted++
        }
      } else {
        for (const r of dropHeader(rows, 'food')) {
          const [foodName, amount, unit, eatenAt] = r
          if (!foodName?.trim()) { sum.errors.push(`Empty food in row: ${r.join(',')}`); continue }
          const amt = Number(amount)
          if (!(amt > 0)) { sum.errors.push(`Bad amount "${amount}" for ${foodName}`); continue }
          const u = (unit ?? '').trim()
          if (!LOG_UNITS.includes(u as any)) { sum.errors.push(`Bad unit "${unit}" for ${foodName}`); continue }
          const when = eatenAt?.trim() ? new Date(eatenAt.trim()) : new Date()
          if (isNaN(when.getTime())) { sum.errors.push(`Bad date "${eatenAt}" for ${foodName}`); continue }
          const food = await getOrCreateFoodByName(foodName.trim())
          if (!food.ingredients?.length) sum.stubs.push(`food: ${food.name}`)
          await insertLogEntry({ food_id: food.id, amount: amt, unit: u, eaten_at: when.toISOString() })
          sum.inserted++
        }
      }
      setSummary(sum)
      onSaved()
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
            <p className={modalStyles.desc}>Imported {summary.inserted} row(s).</p>
            {summary.stubs.length > 0 && (
              <>
                <label className={formStyles.label}>STUBS CREATED ({summary.stubs.length})</label>
                <ul>{summary.stubs.map((s, i) => <li key={i} style={{ fontSize: 13 }}>{s}</li>)}</ul>
              </>
            )}
            {summary.errors.length > 0 && (
              <>
                <label className={formStyles.label}>SKIPPED ROWS ({summary.errors.length})</label>
                <ul>{summary.errors.map((s, i) => <li key={i} style={{ fontSize: 13, color: 'var(--danger, #B83A3A)' }}>{s}</li>)}</ul>
              </>
            )}
            <button className={formStyles.nextBtn} onClick={onClose}>Done</button>
          </div>
        ) : (
          <div>
            <label className={formStyles.label}>FORMAT</label>
            <select className={formStyles.input} value={format} onChange={e => { setFormat(e.target.value as Format); setRows(null) }}>
              <option value="ingredients">Ingredients — name, type</option>
              <option value="foods">Foods — name, type, ingredients</option>
              <option value="log">Log — food, amount, unit, eaten_at</option>
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
                <button className={formStyles.nextBtn} disabled={busy} onClick={runImport}>
                  {busy ? 'Importing…' : `Import ${rows.length} row(s)`}
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

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ImportCsvModal.tsx
git commit -m "feat(nutrition): add lenient CSV import modal with preview and summary"
```

---

## Task 9: Nutrition page (tabs + food detail) and modal orchestration

**Files:**
- Create: `src/pages/Nutrition.tsx`
- Create: `src/pages/Nutrition.module.css`

**Interfaces:**
- Consumes: `Food`, `Ingredient`, `LogEntry` (Task 2); `fetchFoodsWithIngredients`, `fetchIngredients`, `fetchLog`, `deleteLogEntry`, `distinctIngredientTypes` (Tasks 3–4); `AddFoodFlow`, `AddIngredientModal`, `LogEntryModal`, `ImportCsvModal` (Tasks 5–8).
- Produces: `export default function Nutrition()` — the route component. Owns loading of foods/ingredients/log, tab state, modal state, and renders the selected food's detail inline (ingredient list + `distinctIngredientTypes`).

- [ ] **Step 1: Write the styles**

Create `src/pages/Nutrition.module.css`:

```css
.page { padding: 16px 20px 24px; }

.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}

.tab {
  flex: 1;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: none;
  font-size: 14px;
  color: var(--ink2);
  cursor: pointer;
}

.tabActive {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.actions {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.actionBtn {
  font-size: 13px;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 20px;
  background: var(--accent);
  color: #fff;
  border: none;
  cursor: pointer;
}

.actionBtnAlt {
  background: none;
  color: var(--accent);
  border: 1px solid var(--accent);
}

.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--r);
  padding: 14px;
  margin-bottom: 10px;
}

.cardRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.foodName { font-size: 16px; font-weight: 600; color: var(--ink); }
.meta { font-size: 12px; color: var(--ink3); margin-top: 4px; }
.sectionLabel {
  font-size: 10px; font-weight: 600; color: var(--ink2);
  letter-spacing: 0.07em; text-transform: uppercase; margin: 16px 0 8px;
}

.linkBtn {
  background: none; border: none; color: var(--accent);
  font-size: 13px; font-weight: 600; cursor: pointer;
}

.rowActions { display: flex; gap: 10px; }

.empty { font-size: 14px; color: var(--ink2); }

.emptyState { text-align: center; padding: 60px 20px; }
.emptyIcon { font-size: 40px; margin-bottom: 12px; }
.emptyState h2 { font-size: 18px; margin-bottom: 6px; color: var(--ink); }
.emptyState p { font-size: 14px; color: var(--ink2); line-height: 1.6; }

.backBtn {
  background: none; border: none; font-size: 20px;
  color: var(--ink2); padding: 4px; margin-bottom: 8px; cursor: pointer;
}

.tagRow { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.tag {
  background: var(--accent-l); color: var(--accent);
  border-radius: 14px; padding: 3px 10px; font-size: 12px;
}
```

- [ ] **Step 2: Write the page**

Create `src/pages/Nutrition.tsx`:

```tsx
import { useEffect, useState } from 'react'
import type { Food, Ingredient, LogEntry } from '../types/nutrition'
import {
  fetchFoodsWithIngredients,
  fetchIngredients,
  fetchLog,
  deleteLogEntry,
  distinctIngredientTypes,
} from '../lib/nutrition'
import AddFoodFlow from './AddFoodFlow'
import AddIngredientModal from './AddIngredientModal'
import LogEntryModal from './LogEntryModal'
import ImportCsvModal from './ImportCsvModal'
import styles from './Nutrition.module.css'

type Tab = 'log' | 'library'
type Modal = null | 'food' | 'ingredient' | 'logEntry' | 'import'

export default function Nutrition() {
  const [tab, setTab] = useState<Tab>('log')
  const [foods, setFoods] = useState<Food[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [log, setLog] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<Modal>(null)
  const [editEntry, setEditEntry] = useState<LogEntry | null>(null)
  const [detailFood, setDetailFood] = useState<Food | null>(null)
  const [error, setError] = useState('')

  async function load() {
    try {
      const [f, i, l] = await Promise.all([
        fetchFoodsWithIngredients(),
        fetchIngredients(),
        fetchLog(),
      ])
      setFoods(f); setIngredients(i); setLog(l)
    } catch (e: any) {
      setError(e?.message ?? 'Could not load nutrition data.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  function closeModal() { setModal(null); setEditEntry(null) }
  function afterSave() { closeModal(); load() }

  async function handleDeleteEntry(entry: LogEntry) {
    if (!confirm('Delete this log entry?')) return
    try { await deleteLogEntry(entry.id); load() }
    catch (e: any) { setError(e?.message ?? 'Could not delete entry.') }
  }

  // ── Food detail view ──
  if (detailFood) {
    const types = distinctIngredientTypes(detailFood.ingredients ?? [])
    return (
      <div className={styles.page}>
        <button className={styles.backBtn} onClick={() => setDetailFood(null)}>←</button>
        <p className={styles.foodName}>{detailFood.name}</p>
        {detailFood.type && <p className={styles.meta}>{detailFood.type}</p>}

        <p className={styles.sectionLabel}>Ingredients</p>
        {detailFood.ingredients?.length ? (
          <ul>
            {detailFood.ingredients.map(i => (
              <li key={i.id} style={{ fontSize: 14 }}>{i.name}{i.type ? ` · ${i.type}` : ''}</li>
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>No ingredients recorded.</p>
        )}

        {types.length > 0 && (
          <>
            <p className={styles.sectionLabel}>Types</p>
            <div className={styles.tagRow}>
              {types.map(t => <span key={t} className={styles.tag}>{t}</span>)}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.tabs}>
        <button className={`${styles.tab} ${tab === 'log' ? styles.tabActive : ''}`} onClick={() => setTab('log')}>Log</button>
        <button className={`${styles.tab} ${tab === 'library' ? styles.tabActive : ''}`} onClick={() => setTab('library')}>Library</button>
      </div>

      {error && <p className={styles.empty} style={{ color: 'var(--danger, #B83A3A)' }}>{error}</p>}

      {loading ? (
        <p className={styles.empty}>Loading…</p>
      ) : tab === 'log' ? (
        <>
          <div className={styles.actions}>
            <button className={styles.actionBtn} onClick={() => { setEditEntry(null); setModal('logEntry') }}>+ Log entry</button>
          </div>
          {log.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>🥗</div>
              <h2>Nothing logged yet</h2>
              <p>Tap + Log entry to record what you ate.</p>
            </div>
          ) : (
            log.map(e => (
              <div key={e.id} className={styles.card}>
                <div className={styles.cardRow}>
                  <span className={styles.foodName}>{e.food?.name ?? 'Unknown food'}</span>
                  <span className={styles.meta}>{e.amount} {e.unit}</span>
                </div>
                <div className={styles.cardRow}>
                  <span className={styles.meta}>{new Date(e.eaten_at).toLocaleString()}</span>
                  <span className={styles.rowActions}>
                    <button className={styles.linkBtn} onClick={() => { setEditEntry(e); setModal('logEntry') }}>Edit</button>
                    <button className={styles.linkBtn} onClick={() => handleDeleteEntry(e)}>Delete</button>
                  </span>
                </div>
              </div>
            ))
          )}
        </>
      ) : (
        <>
          <div className={styles.actions}>
            <button className={styles.actionBtn} onClick={() => setModal('food')}>+ Food</button>
            <button className={`${styles.actionBtn} ${styles.actionBtnAlt}`} onClick={() => setModal('ingredient')}>+ Ingredient</button>
            <button className={`${styles.actionBtn} ${styles.actionBtnAlt}`} onClick={() => setModal('import')}>⬆ Import CSV</button>
          </div>

          <p className={styles.sectionLabel}>Foods ({foods.length})</p>
          {foods.length === 0 ? (
            <p className={styles.empty}>No foods yet.</p>
          ) : foods.map(f => (
            <div key={f.id} className={styles.card}>
              <div className={styles.cardRow}>
                <span className={styles.foodName}>{f.name}</span>
                <button className={styles.linkBtn} onClick={() => setDetailFood(f)}>Open →</button>
              </div>
              <div className={styles.meta}>
                {f.type ? `${f.type} · ` : ''}{f.ingredients?.length ?? 0} ingredient(s)
              </div>
            </div>
          ))}

          <p className={styles.sectionLabel}>Ingredients ({ingredients.length})</p>
          {ingredients.length === 0 ? (
            <p className={styles.empty}>No ingredients yet.</p>
          ) : ingredients.map(i => (
            <div key={i.id} className={styles.card}>
              <div className={styles.cardRow}>
                <span className={styles.foodName} style={{ fontSize: 14 }}>{i.name}</span>
                <span className={styles.meta}>{i.type ?? '—'}</span>
              </div>
            </div>
          ))}
        </>
      )}

      {modal === 'food' && (
        <AddFoodFlow
          foods={foods}
          onClose={closeModal}
          onSaved={afterSave}
          onOpenFood={(f) => { closeModal(); setDetailFood(f) }}
        />
      )}
      {modal === 'ingredient' && (
        <AddIngredientModal onClose={closeModal} onSaved={() => afterSave()} />
      )}
      {modal === 'logEntry' && (
        <LogEntryModal foods={foods} entry={editEntry} onClose={closeModal} onSaved={afterSave} />
      )}
      {modal === 'import' && (
        <ImportCsvModal onClose={closeModal} onSaved={() => load()} />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Nutrition.tsx src/pages/Nutrition.module.css
git commit -m "feat(nutrition): add tabbed Nutrition page with food detail and modal wiring"
```

---

## Task 10: Wire route + bottom-nav entry

**Files:**
- Modify: `src/App.tsx` (import + route)
- Modify: `src/components/layout/BottomNav.tsx` (nav entry)

**Interfaces:**
- Consumes: `Nutrition` (Task 9).
- Produces: the `/nutrition` route and a 🥗 nav button — the user-visible entry point.

- [ ] **Step 1: Add the route to App.tsx**

In `src/App.tsx`, add the import alongside the other page imports:

```tsx
import Nutrition from './pages/Nutrition'
```

And add the route inside `<Routes>` after the medications route:

```tsx
            <Route path="/medications" element={<Medications />} />
            <Route path="/nutrition"   element={<Nutrition />} />
```

- [ ] **Step 2: Add the nav entry to BottomNav.tsx**

In `src/components/layout/BottomNav.tsx`, add this `NavLink` after the medications one and before the Symptom button:

```tsx
      <NavLink to="/nutrition"    className={({ isActive }) => `${styles.btn} ${isActive ? styles.active : ''}`}>
        <span className={styles.icon}>🥗</span>
        <span className={styles.label}>Nutrition</span>
      </NavLink>
```

- [ ] **Step 3: Verify build + typecheck + tests**

Run: `npm run build && npm test`
Expected: `tsc` passes, `vite build` succeeds, the three helper tests PASS.

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`, open the app, tap the 🥗 Nutrition tab. Verify:
- Library tab: add an ingredient (with and without a type); add a food picking ingredients via autocomplete and inline-create; re-entering the same ingredient set surfaces the duplicate banner with "Open it instead"; open a food and see its ingredient list + distinct type tags.
- Log tab: log an entry against a food (amount/unit/eaten_at), see it listed, edit it, delete it.
- Import CSV: try each of the three formats with a small paste; confirm the preview, run the import, and read the summary (stubs + skipped rows).
- Duplicate-name conflicts show an inline error message inside the modal (not a console-only failure).

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/layout/BottomNav.tsx
git commit -m "feat(nutrition): wire /nutrition route and bottom-nav entry"
```

---

## Self-Review Notes

**Spec coverage:**
- Data model (4 tables, UUID PKs, case-insensitive unique names, FK by `food_id`, optional types/ingredients) → Task 1 + Task 4.
- Files list (types, lib, Nutrition page, AddFoodFlow, AddIngredientModal, LogEntryModal, ImportCsvModal) → Tasks 2,3,4,5,6,7,8,9. App route + BottomNav → Task 10.
- Pure helpers `matchFoodByIngredientSet`, `parseCsv`, `distinctIngredientTypes` → Task 3 (with tests, satisfying the "light unit tests only for the three pure helpers" testing scope).
- Log an entry / Add a food (autocomplete + inline create + exact-set match + name required) / Food detail (ingredients + distinct types) / client-side set matching → Tasks 6, 7, 9.
- CSV import: three formats, pick → upload/paste → preview → confirm → insert; lenient stub auto-create; summary of stubs and unparseable rows; dependency-free parser → Task 8 (+ `parseCsv` in Task 3).
- Error handling: visible in-modal messages, duplicate-name conflict explained, positive-amount/constrained-unit validation → Tasks 5–9.
- Out of scope (calories/macros, stats charts) → intentionally omitted.

**Type consistency:** `Food.ingredients`, `LogEntry.food`, the `{ name, type }` insert shapes, and helper signatures (`matchFoodByIngredientSet(foods, ingredientIds)`, `parseCsv(text)`, `distinctIngredientTypes(ingredients)`) are used identically across Tasks 3–9.

**Note on duplicate-detection edge case:** `matchFoodByIngredientSet` assumes no duplicate ids within a food's ingredient list and within `ingredientIds`; the picker enforces this (it ignores an already-picked id), so the length-plus-membership check is a correct set comparison.
