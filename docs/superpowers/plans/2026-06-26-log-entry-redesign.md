# Nutrition Log-Entry Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken log-entry food picker with a type-ahead multi-food picker, make amount/unit optional, and use ±day/±15-min nudge buttons for the "eaten at" time.

**Architecture:** Make `amount`/`unit` nullable in the consumption-log table and types; add a batch `insertLogEntries`; rebuild `LogEntryModal` to use the type-ahead + chip pattern from `AddFoodFlow` (one row per food, each with optional amount/unit) saving one log row per food sharing a timestamp; update the Log list and CSV importer to tolerate a null amount.

**Tech Stack:** React 18 + TypeScript, react-router-dom v6, Supabase JS (`health` schema), Vite, CSS modules.

## Global Constraints

- Target the Supabase `health` schema via the existing `db` client in `src/lib/nutrition.ts`. Functions `throw` on Supabase error.
- `amount` is optional; when provided it must be a positive number. `unit` is stored **only when `amount` is provided** — a blank amount stores `amount = null` AND `unit = null`. `unit` is constrained to `LOG_UNITS` (`g, ml, serving, piece`).
- `eaten_at` is always set and always aligned to a 15-minute boundary; it is never a free-text field.
- Create mode logs **multiple** foods → one `nutrition_consumption_log` row per food, all sharing one `eaten_at`. At least one food is required; nothing else is mandatory.
- Edit mode stays **single-food** (operates on the one existing entry).
- A typed food name that matches no existing food can be created inline as a **stub** (name only, no type/ingredients) via `getOrCreateFoodByName`.
- Style: two-space indent, NO semicolons. Reuse `Modal.module.css` (`modalStyles`) and `AddMedicationFlow.module.css` (`formStyles`); the modal gets its own `LogEntryModal.module.css` (`styles`).
- No new runtime dependencies. No new automated tests (UI + nullable columns only; the existing three helper tests must keep passing).

---

## File Structure

| File | Change |
|------|--------|
| `db/nutrition_schema.sql` | Make `nutrition_consumption_log.amount` / `unit` nullable in the CREATE definition (+ the live-DB `ALTER` is a manual human step). |
| `src/types/nutrition.ts` | `LogEntry.amount: number \| null`, `unit: string \| null`. |
| `src/lib/nutrition.ts` | `insertLogEntry` / `updateLogEntry` input types → nullable amount/unit; add `insertLogEntries` batch. |
| `src/pages/LogEntryModal.tsx` | Full rewrite: type-ahead picker, per-food optional amount/unit chips, nudge-button eaten-at, multi-insert. |
| `src/pages/LogEntryModal.module.css` | New: rows, suggestions, nudge buttons. |
| `src/pages/Nutrition.tsx` | Log list: show amount/unit only when `amount != null`. |
| `src/pages/ImportCsvModal.tsx` | Log-format import: blank amount → null (don't reject). |

---

## Task 1: Make amount/unit optional (schema, types, data layer)

**Files:**
- Modify: `db/nutrition_schema.sql`
- Modify: `src/types/nutrition.ts`
- Modify: `src/lib/nutrition.ts`

**Interfaces:**
- Produces:
  - `LogEntry.amount: number | null`, `LogEntry.unit: string | null`.
  - `insertLogEntry(input: { food_id: string; amount: number | null; unit: string | null; eaten_at: string }): Promise<void>`
  - `updateLogEntry(id: string, input: { food_id: string; amount: number | null; unit: string | null; eaten_at: string }): Promise<void>`
  - `insertLogEntries(entries: { food_id: string; amount: number | null; unit: string | null; eaten_at: string }[]): Promise<void>` — early-returns on empty; throws on error.

- [ ] **Step 1: Make the schema columns nullable**

In `db/nutrition_schema.sql`, in the `create table if not exists health.nutrition_consumption_log (...)` block, change:
```sql
  amount      numeric not null,
  unit        text not null,
```
to:
```sql
  amount      numeric,
  unit        text,
```

- [ ] **Step 2: Apply the migration to the live DB (manual human step)**

This cannot be done by an automated agent. The human runs, in the Supabase SQL editor:
```sql
alter table health.nutrition_consumption_log alter column amount drop not null;
alter table health.nutrition_consumption_log alter column unit   drop not null;
```
Note this in the task report as a remaining manual step. The code changes below do not depend on it to typecheck/build.

- [ ] **Step 3: Make the LogEntry type fields nullable**

In `src/types/nutrition.ts`, in the `LogEntry` interface, change:
```ts
  amount: number
  unit: string
```
to:
```ts
  amount: number | null
  unit: string | null
```

- [ ] **Step 4: Update the data-layer signatures and add the batch insert**

In `src/lib/nutrition.ts`, replace the existing `insertLogEntry` and `updateLogEntry` functions with the versions below, and add `insertLogEntries` immediately after `insertLogEntry`:

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
```

- [ ] **Step 5: Verify typecheck and tests**

Run: `npx tsc --noEmit && npm test`
Expected: tsc clean; 10/10 helper tests still pass. (Type widening to `| null` is backward-compatible with existing callers.)

- [ ] **Step 6: Commit**

```bash
git add db/nutrition_schema.sql src/types/nutrition.ts src/lib/nutrition.ts
git commit -m "feat(nutrition): make log amount/unit optional; add batch insertLogEntries"
```

---

## Task 2: Rebuild LogEntryModal (type-ahead multi-food picker + nudge time)

**Files:**
- Create: `src/pages/LogEntryModal.module.css`
- Modify (full rewrite): `src/pages/LogEntryModal.tsx`

**Interfaces:**
- Consumes: `Food`, `LogEntry`, `LOG_UNITS` (types); `insertLogEntries`, `updateLogEntry`, `getOrCreateFoodByName` (Task 1 + existing lib); `Modal.module.css`, `AddMedicationFlow.module.css`, `LogEntryModal.module.css`.
- Produces: `export default function LogEntryModal(props: { foods: Food[]; entry?: LogEntry | null; onClose: () => void; onSaved: () => void })`. Same props as today — the parent (`Nutrition.tsx`) needs no change to call it.

- [ ] **Step 1: Write the styles**

Create `src/pages/LogEntryModal.module.css`:

```css
.rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 8px;
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rowName {
  flex: 1;
  font-size: 14px;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.amountInput {
  width: 64px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
  background: var(--bg);
  color: var(--ink);
  outline: none;
}

.unitSelect {
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
  background: var(--bg);
  color: var(--ink);
  outline: none;
}

.rowRemove {
  background: none;
  border: none;
  color: var(--ink2);
  font-size: 18px;
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
.createRow { color: var(--accent); font-weight: 600; }

.eatenAt {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.eatenAtDisplay {
  font-size: 16px;
  font-weight: 600;
  color: var(--ink);
  font-family: 'Lora', serif;
}

.nudges {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.nudgeBtn {
  border: 1px solid var(--border);
  background: var(--bg);
  border-radius: 16px;
  padding: 6px 12px;
  font-size: 13px;
  color: var(--ink);
  cursor: pointer;
  transition: all 0.15s;
}

.nudgeBtn:hover {
  background: var(--accent-l);
  border-color: var(--accent);
  color: var(--accent);
}
```

- [ ] **Step 2: Rewrite the modal**

Replace the entire contents of `src/pages/LogEntryModal.tsx` with:

```tsx
import { useMemo, useState } from 'react'
import type { Food, LogEntry } from '../types/nutrition'
import { LOG_UNITS } from '../types/nutrition'
import { insertLogEntries, updateLogEntry, getOrCreateFoodByName } from '../lib/nutrition'
import modalStyles from './Modal.module.css'
import formStyles from './AddMedicationFlow.module.css'
import styles from './LogEntryModal.module.css'

interface Props {
  foods: Food[]
  entry?: LogEntry | null
  onClose: () => void
  onSaved: () => void
}

interface Row {
  food: Food
  amount: string
  unit: string
}

// Now, snapped down to the nearest 15-minute boundary.
function startOfNow(): Date {
  const d = new Date()
  d.setSeconds(0, 0)
  d.setMinutes(Math.floor(d.getMinutes() / 15) * 15)
  return d
}

function formatEatenAt(d: Date): string {
  const date = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${date} · ${time}`
}

export default function LogEntryModal({ foods, entry, onClose, onSaved }: Props) {
  const editing = !!entry

  const [foodList, setFoodList] = useState<Food[]>(foods)
  const [picked, setPicked] = useState<Row[]>(() => {
    if (entry) {
      const f = foods.find(x => x.id === entry.food_id)
      if (f) return [{ food: f, amount: entry.amount != null ? String(entry.amount) : '', unit: entry.unit ?? 'serving' }]
    }
    return []
  })
  const [query, setQuery] = useState('')
  const [eatenAt, setEatenAt] = useState<Date>(() => (entry ? new Date(entry.eaten_at) : startOfNow()))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const pickedIds = picked.map(r => r.food.id)

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return foodList.filter(f => f.name.toLowerCase().includes(q) && !pickedIds.includes(f.id)).slice(0, 8)
  }, [query, foodList, picked])

  const exactExists = foodList.some(f => f.name.toLowerCase() === query.trim().toLowerCase())

  function selectFood(food: Food) {
    setQuery('')
    if (editing) {
      setPicked([{ food, amount: picked[0]?.amount ?? '', unit: picked[0]?.unit ?? 'serving' }])
    } else if (!pickedIds.includes(food.id)) {
      setPicked([...picked, { food, amount: '', unit: 'serving' }])
    }
  }

  async function createAndSelect() {
    const name = query.trim()
    if (!name) return
    try {
      const food = await getOrCreateFoodByName(name)
      setFoodList(prev => (prev.some(f => f.id === food.id) ? prev : [...prev, food]))
      selectFood(food)
    } catch (e: any) {
      setError(e?.message ?? 'Could not create food.')
    }
  }

  function removeRow(id: string) {
    setPicked(picked.filter(r => r.food.id !== id))
  }
  function setRowAmount(id: string, amount: string) {
    setPicked(picked.map(r => (r.food.id === id ? { ...r, amount } : r)))
  }
  function setRowUnit(id: string, unit: string) {
    setPicked(picked.map(r => (r.food.id === id ? { ...r, unit } : r)))
  }

  function nudge(deltaMin: number) {
    setEatenAt(prev => {
      const d = new Date(prev)
      d.setMinutes(d.getMinutes() + deltaMin)
      return d
    })
  }

  async function handleSave() {
    if (picked.length === 0) { setError('Pick at least one food.'); return }
    for (const r of picked) {
      if (r.amount.trim() && !(Number(r.amount) > 0)) {
        setError(`Amount for ${r.food.name} must be a positive number.`)
        return
      }
    }
    setSaving(true)
    setError('')
    const eaten_at = eatenAt.toISOString()
    const rows = picked.map(r => {
      const amt = r.amount.trim() ? Number(r.amount) : null
      return { food_id: r.food.id, amount: amt, unit: amt != null ? r.unit : null, eaten_at }
    })
    try {
      if (entry) await updateLogEntry(entry.id, rows[0])
      else await insertLogEntries(rows)
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
          <h2 className={modalStyles.title}>{editing ? 'Edit entry' : 'Log entry'}</h2>
          <button className={formStyles.cancelBtn} onClick={onClose}>Cancel</button>
        </div>

        <label className={formStyles.label}>{editing ? 'FOOD' : 'FOODS'} *</label>

        {picked.length > 0 && (
          <div className={styles.rows}>
            {picked.map(r => (
              <div key={r.food.id} className={styles.row}>
                <span className={styles.rowName}>{r.food.name}</span>
                <input
                  className={styles.amountInput}
                  type="number"
                  min="0"
                  step="any"
                  value={r.amount}
                  onChange={e => setRowAmount(r.food.id, e.target.value)}
                  placeholder="amt"
                />
                <select
                  className={styles.unitSelect}
                  value={r.unit}
                  onChange={e => setRowUnit(r.food.id, e.target.value)}
                >
                  {LOG_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                {!editing && (
                  <button className={styles.rowRemove} onClick={() => removeRow(r.food.id)}>×</button>
                )}
              </div>
            ))}
          </div>
        )}

        <input
          className={formStyles.input}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={editing ? 'Change food…' : 'Type to add a food…'}
        />
        {query.trim() && (
          <div className={styles.suggestions}>
            {suggestions.map(f => (
              <button key={f.id} className={styles.suggestion} onClick={() => selectFood(f)}>
                {f.name}{f.type ? ` · ${f.type}` : ''}
              </button>
            ))}
            {!exactExists && (
              <button className={`${styles.suggestion} ${styles.createRow}`} onClick={createAndSelect}>
                + Create “{query.trim()}”
              </button>
            )}
          </div>
        )}

        <label className={formStyles.label}>EATEN AT</label>
        <div className={styles.eatenAt}>
          <span className={styles.eatenAtDisplay}>{formatEatenAt(eatenAt)}</span>
          <div className={styles.nudges}>
            <button className={styles.nudgeBtn} onClick={() => nudge(-1440)}>− day</button>
            <button className={styles.nudgeBtn} onClick={() => nudge(1440)}>+ day</button>
            <button className={styles.nudgeBtn} onClick={() => nudge(-15)}>− 15m</button>
            <button className={styles.nudgeBtn} onClick={() => nudge(15)}>+ 15m</button>
          </div>
        </div>

        {error && <p className={modalStyles.desc} style={{ color: 'var(--danger, #B83A3A)' }}>{error}</p>}

        <button className={formStyles.nextBtn} disabled={saving} onClick={handleSave}>
          {saving ? 'Saving…' : editing ? 'Save changes' : picked.length > 1 ? `Log ${picked.length} foods` : 'Log it'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: tsc clean; vite build succeeds.

- [ ] **Step 4: Manual smoke (note in report; requires the live DB migration from Task 1, Step 2)**

`npm run dev` → 🥗 → Log → + Log entry. Verify: typing shows a dropdown; selecting adds a chip row; typing a new name offers "+ Create '…'" and creates a stub; multiple foods can be added each with their own optional amount/unit; the − day/+ day/− 15m/+ 15m buttons move the displayed time; Save with no amount works; editing an existing entry shows it single-food and saves. Errors appear inline.

- [ ] **Step 5: Commit**

```bash
git add src/pages/LogEntryModal.tsx src/pages/LogEntryModal.module.css
git commit -m "feat(nutrition): type-ahead multi-food log entry with optional amount and nudge time"
```

---

## Task 3: Log list shows amount/unit only when present

**Files:**
- Modify: `src/pages/Nutrition.tsx`

**Interfaces:**
- Consumes: `LogEntry` with nullable `amount`/`unit` (Task 1).

- [ ] **Step 1: Render the amount/unit conditionally**

In `src/pages/Nutrition.tsx`, in the Log-tab entry card, find:
```tsx
                  <span className={styles.foodName}>{e.food?.name ?? 'Unknown food'}</span>
                  <span className={styles.meta}>{e.amount} {e.unit}</span>
```
and change the second line so it only renders when an amount exists:
```tsx
                  <span className={styles.foodName}>{e.food?.name ?? 'Unknown food'}</span>
                  {e.amount != null && <span className={styles.meta}>{e.amount} {e.unit}</span>}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Nutrition.tsx
git commit -m "feat(nutrition): hide amount/unit in log list when not set"
```

---

## Task 4: CSV log import tolerates a blank amount

**Files:**
- Modify: `src/pages/ImportCsvModal.tsx`

**Interfaces:**
- Consumes: `insertLogEntry` with nullable amount/unit (Task 1).

- [ ] **Step 1: Treat a blank amount as null in the log branch**

In `src/pages/ImportCsvModal.tsx`, in the `else` (log-format) branch of `runImport`, replace this block:
```tsx
          const amt = Number(amount)
          if (!(amt > 0)) { sum.errors.push(`Bad amount "${amount}" for ${foodName}`); continue }
          const u = (unit ?? '').trim()
          if (!LOG_UNITS.includes(u as any)) { sum.errors.push(`Bad unit "${unit}" for ${foodName}`); continue }
```
with:
```tsx
          const amountRaw = (amount ?? '').trim()
          let amt: number | null = null
          let u: string | null = null
          if (amountRaw) {
            amt = Number(amountRaw)
            if (!(amt > 0)) { sum.errors.push(`Bad amount "${amount}" for ${foodName}`); continue }
            u = (unit ?? '').trim()
            if (!LOG_UNITS.includes(u as any)) { sum.errors.push(`Bad unit "${unit}" for ${foodName}`); continue }
          }
```
The existing `insertLogEntry({ food_id: food.id, amount: amt, unit: u, eaten_at: when.toISOString() })` call a few lines below now receives `amt`/`u` that may be null — no change needed there (the `food` lookup, stub flag, and insert stay as they are).

- [ ] **Step 2: Verify typecheck and tests**

Run: `npx tsc --noEmit && npm test`
Expected: tsc clean; 10/10 helper tests still pass.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ImportCsvModal.tsx
git commit -m "feat(nutrition): accept blank amount in CSV log import (stored as null)"
```

---

## Self-Review Notes

**Spec coverage:**
- Nullable amount/unit (DB + types + lib) → Task 1.
- Type-ahead picker replacing the list-box, inline stub create, multi-food one-row-per-food, per-food optional amount/unit, nudge-button eaten-at, edit stays single-food, ≥1 food required → Task 2.
- Log list hides amount/unit when null → Task 3.
- CSV log import: blank amount → null; present-but-invalid amount/unit still reported → Task 4.
- Testing: no new pure helpers → no new unit tests; tsc/build/manual verification per task. Matches spec.

**Type consistency:** the log input shape `{ food_id: string; amount: number | null; unit: string | null; eaten_at: string }` is identical across `insertLogEntry`, `insertLogEntries`, `updateLogEntry` (Task 1) and the `rows` built in Task 2's `handleSave`. `LogEntry.amount`/`unit` nullability (Task 1) is what Tasks 2–4 rely on.

**Note on the manual migration:** Task 1 Step 2 (the live-DB `ALTER`) is a human action; until it runs, inserting a row with a null amount will fail at runtime against the old `not null` columns, but all code typechecks and builds. The implementer must flag this so the human runs it before manual smoke testing.
