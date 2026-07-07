# Editable Units Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user add and delete log-entry units from a new Settings page, stored in Supabase and synced across devices.

**Architecture:** Replace the hardcoded `LOG_UNITS` const with a `health.nutrition_units` table. A thin data layer (`src/lib/units.ts`) plus a cached `useUnits()` hook feed the unit dropdowns; a new Settings page manages the list. Units remain free strings on log entries — no conversions.

**Tech Stack:** React 18 + TypeScript + Vite, `@supabase/supabase-js` v2 (schema `health`), CSS Modules + CSS vars, vitest (node env), react-router-dom.

## Global Constraints

- Supabase client points at the `health` schema; reuse the shared client `supabase` from `src/lib/supabase.ts` (do not create a new `createClient`).
- No new npm dependencies.
- Styling via existing CSS vars only (`--bg`, `--card`, `--ink`, `--ink2`, `--accent`, `--red`, `--border`); CSS Modules, no Tailwind.
- No React component test infra — component/page changes are verified with `npm run build`. Only pure functions get vitest tests (`src/**/*.test.ts`, node env).
- Security model is RLS-only: any new table needs an `authenticated` grant AND an `auth.role() = 'authenticated'` RLS policy.
- Units are stored as plain strings on entries; deleting a unit must not alter historical entries.

## File Structure

- Create: `migrations/2026-07-07-nutrition-units.sql` — table, seed, grant, RLS.
- Create: `src/lib/units.ts` — `Unit` type, `normalizeUnitName`, `fetchUnits`, `addUnit`, `deleteUnit`.
- Create: `src/lib/units.test.ts` — tests for `normalizeUnitName`.
- Create: `src/lib/useUnits.ts` — `useUnits()` hook with module-level cache.
- Create: `src/pages/Settings.tsx` + `src/pages/Settings.module.css` — units management UI.
- Modify: `src/App.tsx` — add `/settings` route.
- Modify: `src/components/layout/Header.tsx` — add Settings link.
- Modify: `src/components/layout/Header.module.css` — style the link.
- Modify: `src/pages/LogEntryModal.tsx` — units from `useUnits()`.
- Modify: `src/pages/LogTable.tsx` — units from `useUnits()`.
- Modify: `src/pages/ImportCsvModal.tsx` — validate against fetched units.
- Modify: `src/types/nutrition.ts` — remove `LOG_UNITS`.

---

### Task 1: Database migration

**Files:**
- Create: `migrations/2026-07-07-nutrition-units.sql`

**Interfaces:**
- Produces: table `health.nutrition_units(id uuid, name text unique, created_at timestamptz)`, seeded with `g`, `ml`, `serving`, `piece`.

- [ ] **Step 1: Write the migration SQL**

```sql
-- Editable log-entry units. Replaces the hardcoded LOG_UNITS array with a
-- user-managed table. Units are stored as plain strings on log entries, so
-- deleting a unit here never alters historical entries.
--
-- Run in the Supabase SQL editor. Idempotent: safe to re-run.

create table if not exists health.nutrition_units (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

-- Seed the units that used to live in the LOG_UNITS const.
insert into health.nutrition_units (name)
values ('g'), ('ml'), ('serving'), ('piece')
on conflict (name) do nothing;

-- RLS-only security model: authenticated needs explicit table grants
-- (RLS filters rows only AFTER grant checks pass), plus an authenticated-only
-- policy so the anon key is blocked.
grant select, insert, delete on health.nutrition_units to authenticated;

alter table health.nutrition_units enable row level security;

drop policy if exists nutrition_units_authenticated on health.nutrition_units;
create policy nutrition_units_authenticated
  on health.nutrition_units
  for all
  to authenticated
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
```

- [ ] **Step 2: Verify by review**

Confirm: table name matches `nutrition_*` convention, seed covers all four old units, grant + RLS present, `on conflict` and `if not exists` make it idempotent. (Cannot run locally — executed manually in Supabase SQL editor at deploy.)

- [ ] **Step 3: Commit**

```bash
git add migrations/2026-07-07-nutrition-units.sql
git commit -m "feat: add nutrition_units table migration"
```

---

### Task 2: Units data layer

**Files:**
- Create: `src/lib/units.ts`
- Test: `src/lib/units.test.ts`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabase.ts`.
- Produces:
  - `interface Unit { id: string; name: string; created_at: string }`
  - `normalizeUnitName(raw: string): string` — trims and collapses internal whitespace; throws `Error('Unit name cannot be empty')` if the result is empty.
  - `fetchUnits(): Promise<Unit[]>` — ordered by `created_at` ascending.
  - `addUnit(name: string): Promise<Unit>` — normalizes then inserts; on unique-violation (`code === '23505'`) throws `Error('That unit already exists.')`.
  - `deleteUnit(id: string): Promise<void>`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/units.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeUnitName } from './units'

describe('normalizeUnitName', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeUnitName('  tbsp  ')).toBe('tbsp')
  })

  it('collapses internal whitespace', () => {
    expect(normalizeUnitName('fluid   ounce')).toBe('fluid ounce')
  })

  it('throws on empty or whitespace-only input', () => {
    expect(() => normalizeUnitName('   ')).toThrow('Unit name cannot be empty')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- units`
Expected: FAIL — cannot resolve `./units` / `normalizeUnitName is not a function`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/units.ts
import { supabase } from './supabase'

export interface Unit {
  id: string
  name: string
  created_at: string
}

export function normalizeUnitName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, ' ')
  if (!name) throw new Error('Unit name cannot be empty')
  return name
}

export async function fetchUnits(): Promise<Unit[]> {
  const { data, error } = await supabase
    .from('nutrition_units')
    .select('*')
    .order('created_at')
  if (error) throw error
  return data as Unit[]
}

export async function addUnit(name: string): Promise<Unit> {
  const clean = normalizeUnitName(name)
  const { data, error } = await supabase
    .from('nutrition_units')
    .insert({ name: clean })
    .select()
    .single()
  if (error) {
    if (error.code === '23505') throw new Error('That unit already exists.')
    throw error
  }
  return data as Unit
}

export async function deleteUnit(id: string): Promise<void> {
  const { error } = await supabase.from('nutrition_units').delete().eq('id', id)
  if (error) throw error
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- units`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/units.ts src/lib/units.test.ts
git commit -m "feat: add units data layer"
```

---

### Task 3: useUnits hook

**Files:**
- Create: `src/lib/useUnits.ts`

**Interfaces:**
- Consumes: `fetchUnits`, `Unit` from `src/lib/units.ts`.
- Produces: `useUnits(): { units: Unit[]; loading: boolean; reload: () => Promise<void> }`. A module-level cache holds the last-fetched list so navigating between pages does not refetch; `reload()` clears the cache and refetches, updating all mounted consumers.

- [ ] **Step 1: Write the hook**

```typescript
// src/lib/useUnits.ts
import { useEffect, useState } from 'react'
import { fetchUnits, type Unit } from './units'

// Module-level cache shared across all useUnits() consumers so switching pages
// doesn't refetch. reload() refreshes it and notifies every mounted hook.
let cache: Unit[] | null = null
let inflight: Promise<Unit[]> | null = null
const listeners = new Set<(u: Unit[]) => void>()

async function load(force = false): Promise<Unit[]> {
  if (cache && !force) return cache
  if (!inflight || force) {
    inflight = fetchUnits().then(u => {
      cache = u
      inflight = null
      listeners.forEach(fn => fn(u))
      return u
    })
  }
  return inflight
}

export function useUnits(): { units: Unit[]; loading: boolean; reload: () => Promise<void> } {
  const [units, setUnits] = useState<Unit[]>(cache ?? [])
  const [loading, setLoading] = useState(cache === null)

  useEffect(() => {
    const listener = (u: Unit[]) => setUnits(u)
    listeners.add(listener)
    load().then(() => setLoading(false)).catch(() => setLoading(false))
    return () => { listeners.delete(listener) }
  }, [])

  async function reload() {
    await load(true)
  }

  return { units, loading, reload }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: build succeeds (no consumers yet — this just type-checks the hook).

- [ ] **Step 3: Commit**

```bash
git add src/lib/useUnits.ts
git commit -m "feat: add useUnits hook with shared cache"
```

---

### Task 4: Settings page, route, and Header link

**Files:**
- Create: `src/pages/Settings.tsx`
- Create: `src/pages/Settings.module.css`
- Modify: `src/App.tsx:49-50` (routes block)
- Modify: `src/components/layout/Header.tsx:16-18`
- Modify: `src/components/layout/Header.module.css`

**Interfaces:**
- Consumes: `useUnits` (Task 3), `addUnit`, `deleteUnit` (Task 2).
- Produces: route `/settings` rendering `<Settings />`; a "Settings" link in the Header.

- [ ] **Step 1: Create the Settings page**

```tsx
// src/pages/Settings.tsx
import { useState } from 'react'
import { useUnits } from '../lib/useUnits'
import { addUnit, deleteUnit } from '../lib/units'
import styles from './Settings.module.css'

export default function Settings() {
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
    <div className={styles.page}>
      <h2 className={styles.heading}>Units</h2>
      <p className={styles.hint}>
        Units available when logging food. Deleting one keeps it on past entries.
      </p>

      <ul className={styles.list}>
        {units.map(u => (
          <li key={u.id} className={styles.item}>
            <span>{u.name}</span>
            <button
              className={styles.remove}
              onClick={() => handleDelete(u.id)}
              aria-label={`Delete ${u.name}`}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <form className={styles.addRow} onSubmit={handleAdd}>
        <input
          className={styles.input}
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Add a unit (e.g. tbsp)"
        />
        <button className={styles.add} type="submit" disabled={busy}>Add</button>
      </form>

      {error && <p className={styles.error}>{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Create the Settings styles**

```css
/* src/pages/Settings.module.css */
.page { padding: 1rem; max-width: 480px; margin: 0 auto; }
.heading { color: var(--ink); margin: 0 0 .25rem; }
.hint { color: var(--ink2); font-size: .85rem; margin: 0 0 1rem; }
.list { list-style: none; padding: 0; margin: 0 0 1rem; display: flex; flex-direction: column; gap: .5rem; }
.item {
  display: flex; justify-content: space-between; align-items: center;
  background: var(--card); border: 1px solid var(--border);
  border-radius: 8px; padding: .6rem .8rem; color: var(--ink);
}
.remove { background: none; border: none; color: var(--red); font-size: 1.2rem; cursor: pointer; line-height: 1; }
.addRow { display: flex; gap: .5rem; }
.input {
  flex: 1; background: var(--bg); border: 1px solid var(--border);
  border-radius: 8px; padding: .6rem .8rem; color: var(--ink);
}
.add {
  background: var(--accent); border: none; border-radius: 8px;
  padding: .6rem 1rem; color: var(--bg); cursor: pointer;
}
.add:disabled { opacity: .6; cursor: default; }
.error { color: var(--red); font-size: .85rem; margin-top: .75rem; }
```

- [ ] **Step 3: Add the route in App.tsx**

Add the import near the other page imports at the top of `src/App.tsx`:

```tsx
import Settings from './pages/Settings'
```

Add the route inside the `<Routes>` block (after the `/nutrition` route, `src/App.tsx:49`):

```tsx
            <Route path="/nutrition"   element={<Nutrition />} />
            <Route path="/settings"    element={<Settings />} />
```

- [ ] **Step 4: Add the Settings link in the Header**

Replace the sign-out button block in `src/components/layout/Header.tsx` (lines 16-18) so both actions sit together. Add the router import at the top:

```tsx
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import styles from './Header.module.css'
```

Replace lines 16-18 with:

```tsx
        <div className={styles.actions}>
          <Link className={styles.settings} to="/settings">Settings</Link>
          <button className={styles.signout} onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
```

- [ ] **Step 5: Style the Header link**

Append to `src/components/layout/Header.module.css`:

```css
.actions { display: flex; align-items: center; gap: .5rem; }
.settings {
  color: var(--ink2); text-decoration: none; font-size: .9rem;
  padding: .4rem .6rem; border-radius: 6px;
}
.settings:hover { color: var(--ink); }
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: build succeeds. Manually: `npm run dev`, open the app, click **Settings** in the header, add a unit and delete a unit (requires the Task 1 migration to have run against your Supabase project).

- [ ] **Step 7: Commit**

```bash
git add src/pages/Settings.tsx src/pages/Settings.module.css src/App.tsx src/components/layout/Header.tsx src/components/layout/Header.module.css
git commit -m "feat: add Settings page for managing units"
```

---

### Task 5: Wire consumers to useUnits and remove LOG_UNITS

**Files:**
- Modify: `src/pages/LogEntryModal.tsx:3,158`
- Modify: `src/pages/LogTable.tsx:3,126`
- Modify: `src/pages/ImportCsvModal.tsx:2,109`
- Modify: `src/types/nutrition.ts:38`

**Interfaces:**
- Consumes: `useUnits` (Task 3).
- Produces: no `LOG_UNITS` import remains anywhere; dropdowns and CSV validation use DB-backed units.

- [ ] **Step 1: LogEntryModal — use the hook**

In `src/pages/LogEntryModal.tsx`, change the import on line 3 from:

```tsx
import { LOG_UNITS, LOG_TYPES } from '../types/nutrition'
```

to:

```tsx
import { LOG_TYPES } from '../types/nutrition'
import { useUnits } from '../lib/useUnits'
```

Inside the component body (near the other hooks/state, e.g. just after the existing `useState` calls), add:

```tsx
  const { units } = useUnits()
```

Replace the options map on line 158:

```tsx
                  {units.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
```

- [ ] **Step 2: LogTable — use the hook**

In `src/pages/LogTable.tsx`, change the import on line 3 from:

```tsx
import { LOG_TYPES, LOG_UNITS } from '../types/nutrition'
```

to:

```tsx
import { LOG_TYPES } from '../types/nutrition'
import { useUnits } from '../lib/useUnits'
```

Inside the component body add:

```tsx
  const { units } = useUnits()
```

Replace the options map on line 126:

```tsx
                      {units.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
```

- [ ] **Step 3: ImportCsvModal — validate against fetched units**

In `src/pages/ImportCsvModal.tsx`, change the import on line 2 from:

```tsx
import { LOG_UNITS } from '../types/nutrition'
```

to:

```tsx
import { useUnits } from '../lib/useUnits'
```

Inside the component body add:

```tsx
  const { units } = useUnits()
```

The import runs inside an async handler; capture the allowed names as a Set at the start of that handler (before the row loop that contains line 109):

```tsx
    const allowedUnits = new Set(units.map(u => u.name))
```

Replace the validation on line 109:

```tsx
            if (!allowedUnits.has(u)) { sum.errors.push(`Bad unit "${unit}" for ${foodName}`); continue }
```

- [ ] **Step 4: Remove the LOG_UNITS const**

In `src/types/nutrition.ts`, delete line 38:

```tsx
export const LOG_UNITS = ['g', 'ml', 'serving', 'piece'] as const
```

- [ ] **Step 5: Verify no references remain**

Run: `grep -rn "LOG_UNITS" src`
Expected: no output.

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: build succeeds. Manually confirm the unit dropdowns in the log entry modal and log table show the DB units, and CSV import accepts a valid unit / rejects an unknown one.

- [ ] **Step 7: Commit**

```bash
git add src/pages/LogEntryModal.tsx src/pages/LogTable.tsx src/pages/ImportCsvModal.tsx src/types/nutrition.ts
git commit -m "feat: wire unit dropdowns and CSV import to editable units"
```

---

## Deploy step (manual, after merge)

Run `migrations/2026-07-07-nutrition-units.sql` in the Supabase SQL editor. It creates the table, seeds the four original units, grants `authenticated`, and adds its own RLS policy — so no separate re-run of the dynamic auth-rls migration is needed for this table. Until this runs, unit dropdowns will be empty in production.
