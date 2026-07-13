# Nutrition Incomplete-Day Flag + View Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user manually flag Nutrition log days as incomplete (accuracy indicator) and add two independent view filters — hide incomplete days, and show/hide food dots by food type.

**Architecture:** A new `health.nutrition_incomplete_days` table (presence-of-row = flagged) with a small data-layer module and best-effort fetch. Pure, unit-tested filter helpers in a new `nutritionFilters.ts`. UI changes live in `Nutrition.tsx` / `Nutrition.module.css`: a filter bar above the content (both views), colored type chips (replacing the sidebar legend), and a per-day flag toggle on the timeline.

**Tech Stack:** React 18 + TypeScript + Vite, Supabase (`health` schema, RLS-only), CSS Modules, vitest (node env, pure `.test.ts` only).

## Global Constraints

- Supabase client is the singleton at `src/lib/supabase.ts`, pinned to the `health` schema. Never create a new client.
- RLS-only security: any new table needs both an `authenticated` RLS policy AND explicit table grants. Grant only the verbs used — this feature uses `select, insert, delete` (never `update`).
- No React component test infra. Only pure functions get vitest tests (`src/**/*.test.ts`). UI is verified with `npm run build` (tsc + vite).
- Best-effort external/optional reads must never blank the timeline — wrap in try/catch with `console.warn`, matching `fetchSleep` / `fetchTraining` in `Nutrition.tsx`.
- Day key format is `YYYY-MM-DD` from **local** date parts, matching `groupByDay` in `Nutrition.tsx`.
- Food type dot colors come from `colorForType(typeName, foodTypes)` in `src/lib/foodTypeColors.ts`; untyped/uncolored → `FALLBACK_COLOR` (`#9CA3AF`).
- CSS uses existing vars: `--accent`, `--accent-l`, `--border`, `--ink`, `--ink2`, `--ink3`, `--card`, `--danger`.

---

### Task 1: Database migration

**Files:**
- Create: `migrations/2026-07-13-incomplete-days.sql`

**Interfaces:**
- Produces: table `health.nutrition_incomplete_days (day date primary key, created_at timestamptz)`, readable/insertable/deletable by `authenticated`.

- [ ] **Step 1: Write the migration file**

Create `migrations/2026-07-13-incomplete-days.sql` with exactly:

```sql
-- Per-day "incomplete / not fully accurate" flag for the nutrition log.
-- Presence of a row for a given local calendar day = that day is flagged
-- incomplete (the user forgot to log some foods). Toggling on inserts a row,
-- toggling off deletes it; the flag is never updated in place.
--
-- Run in the Supabase SQL editor. Idempotent: safe to re-run.

create table if not exists health.nutrition_incomplete_days (
  day        date primary key,
  created_at timestamptz not null default now()
);

-- RLS-only security model: authenticated needs explicit table grants
-- (RLS filters rows only AFTER grant checks pass), plus an authenticated-only
-- policy so the anon key is blocked. Only select/insert/delete are used — the
-- flag is never updated in place — so no update grant.
grant select, insert, delete on health.nutrition_incomplete_days to authenticated;

alter table health.nutrition_incomplete_days enable row level security;

drop policy if exists nutrition_incomplete_days_authenticated on health.nutrition_incomplete_days;
create policy nutrition_incomplete_days_authenticated
  on health.nutrition_incomplete_days
  for all
  to authenticated
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
```

- [ ] **Step 2: Commit**

```bash
git add migrations/2026-07-13-incomplete-days.sql
git commit -m "feat(nutrition): migration for incomplete-days flag table"
```

> Note: This SQL must be run manually in the Supabase SQL editor at deploy time. The rest of the feature is inert-but-safe until then (best-effort fetch yields an empty set).

---

### Task 2: Pure filter helpers

**Files:**
- Create: `src/lib/nutritionFilters.ts`
- Test: `src/lib/nutritionFilters.test.ts`

**Interfaces:**
- Consumes: `LogEntry` from `../types/nutrition`.
- Produces:
  - `dayKeyOf(d: Date): string` — local `YYYY-MM-DD`.
  - `entryVisibleByType(entry: LogEntry, hiddenTypes: Set<string>, hideNoType: boolean): boolean`
  - `filterLog(log: LogEntry[], opts: { hideIncomplete: boolean; incompleteDays: Set<string>; hiddenTypes: Set<string>; hideNoType: boolean }): LogEntry[]`

> Design note: filters use a **hidden-types** set (empty = everything shown) rather than a selected-types set, so "all on by default" needs no knowledge of the full type list up front. Behavior matches the spec (deselecting a type hides its dots).

- [ ] **Step 1: Write the failing test**

Create `src/lib/nutritionFilters.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { LogEntry } from '../types/nutrition'
import { dayKeyOf, entryVisibleByType, filterLog } from './nutritionFilters'

function entry(id: string, eaten_at: string, type: string | null): LogEntry {
  return {
    id, food_id: 'f-' + id, amount: null, unit: null,
    eaten_at, created_at: eaten_at,
    food: { id: 'f-' + id, name: 'Food ' + id, type, created_at: eaten_at },
  }
}

describe('dayKeyOf', () => {
  it('formats local date parts as YYYY-MM-DD zero-padded', () => {
    expect(dayKeyOf(new Date(2026, 6, 3, 9, 5))).toBe('2026-07-03')
    expect(dayKeyOf(new Date(2026, 11, 25, 0, 0))).toBe('2026-12-25')
  })
})

describe('entryVisibleByType', () => {
  const salty = entry('1', '2026-07-03T10:00', 'Salty snack')
  const untyped = entry('2', '2026-07-03T11:00', null)

  it('shows a typed entry when its type is not hidden', () => {
    expect(entryVisibleByType(salty, new Set(), false)).toBe(true)
  })
  it('hides a typed entry when its type is hidden', () => {
    expect(entryVisibleByType(salty, new Set(['Salty snack']), false)).toBe(false)
  })
  it('shows an untyped entry unless No-type is hidden', () => {
    expect(entryVisibleByType(untyped, new Set(), false)).toBe(true)
    expect(entryVisibleByType(untyped, new Set(), true)).toBe(false)
  })
  it('does not hide an untyped entry just because some type is hidden', () => {
    expect(entryVisibleByType(untyped, new Set(['Salty snack']), false)).toBe(true)
  })
})

describe('filterLog', () => {
  const incompleteDay = entry('1', '2026-07-01T10:00', 'Main')
  const goodDaySalty = entry('2', '2026-07-02T10:00', 'Salty snack')
  const goodDayMain = entry('3', '2026-07-02T12:00', 'Main')
  const log = [incompleteDay, goodDaySalty, goodDayMain]
  const incompleteDays = new Set(['2026-07-01'])

  it('drops entries on incomplete days when hideIncomplete is on', () => {
    const out = filterLog(log, { hideIncomplete: true, incompleteDays, hiddenTypes: new Set(), hideNoType: false })
    expect(out.map(e => e.id)).toEqual(['2', '3'])
  })
  it('keeps incomplete-day entries when hideIncomplete is off', () => {
    const out = filterLog(log, { hideIncomplete: false, incompleteDays, hiddenTypes: new Set(), hideNoType: false })
    expect(out.map(e => e.id)).toEqual(['1', '2', '3'])
  })
  it('drops entries whose type is hidden', () => {
    const out = filterLog(log, { hideIncomplete: false, incompleteDays, hiddenTypes: new Set(['Salty snack']), hideNoType: false })
    expect(out.map(e => e.id)).toEqual(['1', '3'])
  })
  it('applies both filters together', () => {
    const out = filterLog(log, { hideIncomplete: true, incompleteDays, hiddenTypes: new Set(['Salty snack']), hideNoType: false })
    expect(out.map(e => e.id)).toEqual(['3'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd health-log && npx vitest run src/lib/nutritionFilters.test.ts`
Expected: FAIL — cannot resolve `./nutritionFilters` / functions not defined.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/nutritionFilters.ts`:

```ts
import type { LogEntry } from '../types/nutrition'

// Local calendar day key, matching groupByDay() in Nutrition.tsx.
export function dayKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// A dot/entry is visible under the type filter unless its food type is in
// hiddenTypes, or it has no type and No-type is hidden. hiddenTypes empty +
// hideNoType false = everything shown (the default).
export function entryVisibleByType(
  entry: LogEntry,
  hiddenTypes: Set<string>,
  hideNoType: boolean,
): boolean {
  const type = entry.food?.type
  if (!type) return !hideNoType
  return !hiddenTypes.has(type)
}

export interface LogFilterOpts {
  hideIncomplete: boolean
  incompleteDays: Set<string>
  hiddenTypes: Set<string>
  hideNoType: boolean
}

// Row-level filter for the Table view: drops entries on incomplete days (when
// hideIncomplete) and entries hidden by the type filter.
export function filterLog(log: LogEntry[], opts: LogFilterOpts): LogEntry[] {
  return log.filter(e => {
    if (opts.hideIncomplete && opts.incompleteDays.has(dayKeyOf(new Date(e.eaten_at)))) return false
    return entryVisibleByType(e, opts.hiddenTypes, opts.hideNoType)
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd health-log && npx vitest run src/lib/nutritionFilters.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/nutritionFilters.ts src/lib/nutritionFilters.test.ts
git commit -m "feat(nutrition): pure filter helpers for incomplete days + types"
```

---

### Task 3: Incomplete-days data layer

**Files:**
- Create: `src/lib/incompleteDays.ts`

**Interfaces:**
- Consumes: `supabase` singleton from `./supabase`.
- Produces:
  - `fetchIncompleteDays(): Promise<Set<string>>` — set of `YYYY-MM-DD` day keys.
  - `setDayIncomplete(day: string, flagged: boolean): Promise<void>` — insert when true, delete when false.

> No unit test: this module only wraps Supabase I/O (mirrors the untested `foodTypes.ts` data layer). Verified via `npm run build` and, at deploy, end-to-end.

- [ ] **Step 1: Write the implementation**

Create `src/lib/incompleteDays.ts`:

```ts
import { supabase } from './supabase'

// Days flagged "incomplete / not fully accurate" by the user. A row's presence
// = flagged; `day` is a local YYYY-MM-DD key (see dayKeyOf in nutritionFilters).
export async function fetchIncompleteDays(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('nutrition_incomplete_days')
    .select('day')
  if (error) throw error
  return new Set((data ?? []).map((r: { day: string }) => r.day))
}

// Toggle a day's flag. Insert when flagging, delete when clearing. Insert is
// idempotent (primary key on day) — a duplicate flag is ignored, not an error.
export async function setDayIncomplete(day: string, flagged: boolean): Promise<void> {
  if (flagged) {
    const { error } = await supabase
      .from('nutrition_incomplete_days')
      .upsert({ day }, { onConflict: 'day' })
    if (error) throw error
  } else {
    const { error } = await supabase
      .from('nutrition_incomplete_days')
      .delete()
      .eq('day', day)
    if (error) throw error
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd health-log && npm run build`
Expected: build succeeds (tsc + vite), no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/incompleteDays.ts
git commit -m "feat(nutrition): incomplete-days data layer"
```

---

### Task 4: Filter bar + type-chip filtering on the timeline

**Files:**
- Modify: `src/pages/Nutrition.tsx`
- Modify: `src/pages/Nutrition.module.css`

**Interfaces:**
- Consumes: `entryVisibleByType` from `../lib/nutritionFilters`; `colorForType`, `FALLBACK_COLOR` from `../lib/foodTypeColors`; `useFoodTypes`.
- Produces: `hiddenTypes` / `hideNoType` state driving both this task's timeline chips and Task 5's table filter.

- [ ] **Step 1: Add imports and filter state**

In `src/pages/Nutrition.tsx`, add to the imports near the other `../lib` imports:

```tsx
import { entryVisibleByType } from '../lib/nutritionFilters'
```

Inside `Nutrition()`, add state alongside the existing `useState` hooks (near `logView`):

```tsx
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set())
  const [hideNoType, setHideNoType] = useState(false)

  function toggleType(name: string) {
    setHiddenTypes(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      return next
    })
  }
```

- [ ] **Step 2: Build the chip list and render the filter bar**

Still in `Nutrition.tsx`, add a helper above the component (near `legendItems`) that lists which types + "No type" are present in the log, for chips:

```tsx
// Food types present in the log (for filter chips), each with its dot color,
// plus whether any untyped entries exist (the "No type" chip).
function chipItems(
  entries: LogEntry[],
  foodTypes: Array<{ name: string; color: string | null }>,
): { items: { name: string; color: string }[]; hasUntyped: boolean } {
  const present = new Set<string>()
  let hasUntyped = false
  for (const e of entries) {
    const t = e.food?.type
    if (t) present.add(t); else hasUntyped = true
  }
  const items = foodTypes
    .filter(t => present.has(t.name))
    .map(t => ({ name: t.name, color: colorForType(t.name, foodTypes) }))
  return { items, hasUntyped }
}
```

In the `tab === 'log'` branch, immediately after the `</div>` that closes `styles.subToggle` (the Timeline/Table toggle) and BEFORE the `logView === 'table' ? ...` expression, insert the filter bar:

```tsx
          {(() => {
            const { items, hasUntyped } = chipItems(log, foodTypes)
            return (
              <div className={styles.filterBar}>
                <label className={styles.filterToggle}>
                  <input
                    type="checkbox"
                    checked={hideIncomplete}
                    onChange={e => setHideIncomplete(e.target.checked)}
                  />
                  Hide incomplete days
                </label>
                <div className={styles.chips}>
                  {items.map(item => {
                    const off = hiddenTypes.has(item.name)
                    return (
                      <button
                        key={item.name}
                        className={`${styles.chip} ${off ? styles.chipOff : ''}`}
                        onClick={() => toggleType(item.name)}
                      >
                        <span className={styles.chipSwatch} style={{ background: item.color }} />
                        {item.name}
                      </button>
                    )
                  })}
                  {hasUntyped && (
                    <button
                      className={`${styles.chip} ${hideNoType ? styles.chipOff : ''}`}
                      onClick={() => setHideNoType(v => !v)}
                    >
                      <span className={styles.chipSwatch} style={{ background: FALLBACK_COLOR }} />
                      No type
                    </button>
                  )}
                </div>
              </div>
            )
          })()}
```

> `hideIncomplete` / `setHideIncomplete` are added in Task 5. To keep this task self-contained and buildable, add the state line now too:
> ```tsx
>   const [hideIncomplete, setHideIncomplete] = useState(false)
> ```
> (Task 5 uses it; declaring it here is harmless and keeps the checkbox wired.)

- [ ] **Step 3: Hide non-selected dots on the timeline**

In the timeline dot render (`day.dots.map(({ entry, min, level }) => {`), add an early return so hidden-type dots aren't drawn. Right after the line `const name = entry.food?.name ?? 'Unknown food'`, insert:

```tsx
                      if (!entryVisibleByType(entry, hiddenTypes, hideNoType)) return null
```

- [ ] **Step 4: Remove the redundant sidebar "Types" legend**

In the sidebar (`<aside className={styles.sidebar}>`), delete the entire legend block:

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

Then remove the now-unused `legendItems` function definition and, if `FALLBACK_COLOR` / `colorForType` become unused anywhere, keep them — they're still used by dots and chips. Delete the `legendItems` helper (Step 2's `chipItems` replaces it).

- [ ] **Step 5: Add filter-bar and chip CSS**

In `src/pages/Nutrition.module.css`, append:

```css
/* ── Filter bar (both log views) ── */
.filterBar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 14px;
  margin-bottom: 12px;
}
.filterToggle {
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; color: var(--ink); cursor: pointer;
}
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px; border: 1px solid var(--border); border-radius: 16px;
  background: none; font-size: 13px; color: var(--ink); cursor: pointer;
}
.chipSwatch {
  width: 10px; height: 10px; border-radius: 50%;
  box-shadow: 0 0 0 1px var(--border); flex: none;
}
.chipOff { opacity: 0.4; text-decoration: line-through; }
```

Remove the now-unused `.legend`, `.legendItem`, `.legendSwatch` rules (they were only used by the deleted sidebar legend).

- [ ] **Step 6: Verify build passes**

Run: `cd health-log && npm run build`
Expected: build succeeds, no unused-variable type errors (confirm `legendItems` fully removed).

- [ ] **Step 7: Commit**

```bash
git add src/pages/Nutrition.tsx src/pages/Nutrition.module.css
git commit -m "feat(nutrition): food-type filter chips + timeline dot filtering"
```

---

### Task 5: Incomplete-day marking + hide filter (timeline & table)

**Files:**
- Modify: `src/pages/Nutrition.tsx`
- Modify: `src/pages/Nutrition.module.css`

**Interfaces:**
- Consumes: `fetchIncompleteDays`, `setDayIncomplete` from `../lib/incompleteDays`; `filterLog` from `../lib/nutritionFilters`; `hideIncomplete` state from Task 4.
- Produces: user-visible flagging + hiding, completing the feature.

- [ ] **Step 1: Add imports and incomplete-days state**

In `src/pages/Nutrition.tsx` imports:

```tsx
import { fetchIncompleteDays, setDayIncomplete } from '../lib/incompleteDays'
import { entryVisibleByType, filterLog } from '../lib/nutritionFilters'
```

(Merge the `nutritionFilters` import with Task 4's — a single line importing both `entryVisibleByType` and `filterLog`.)

Add state near the other hooks:

```tsx
  const [incompleteDays, setIncompleteDays] = useState<Set<string>>(new Set())
```

- [ ] **Step 2: Fetch incomplete days best-effort in load()**

In `load()`, after the training best-effort block, add:

```tsx
    // Incomplete-day flags are best-effort: a missing table (migration not yet
    // run) must never blank the timeline — the feature is simply inert.
    try {
      setIncompleteDays(await fetchIncompleteDays())
    } catch (e) {
      console.warn('Incomplete-day flags unavailable:', e)
    }
```

- [ ] **Step 3: Add the day-flag toggle handler**

Inside `Nutrition()`, add:

```tsx
  async function toggleDayIncomplete(dayKey: string) {
    const flagged = !incompleteDays.has(dayKey)
    // Optimistic update.
    setIncompleteDays(prev => {
      const next = new Set(prev)
      if (flagged) next.add(dayKey); else next.delete(dayKey)
      return next
    })
    try {
      await setDayIncomplete(dayKey, flagged)
    } catch (e: any) {
      // Roll back on failure.
      setIncompleteDays(prev => {
        const next = new Set(prev)
        if (flagged) next.delete(dayKey); else next.add(dayKey)
        return next
      })
      setError(e?.message ?? 'Could not update the incomplete flag.')
    }
  }
```

- [ ] **Step 4: Drop incomplete days from the timeline + add per-day flag button**

Replace the timeline day loop opening:

```tsx
              {groupByDay(log).map(day => (
                <div key={day.key} className={styles.dayRow}>
                  <div className={styles.dayLabel}>{day.label}</div>
```

with (filters out hidden days, and renders a flag toggle + marker in the label):

```tsx
              {groupByDay(log)
                .filter(day => !(hideIncomplete && incompleteDays.has(day.key)))
                .map(day => {
                const flagged = incompleteDays.has(day.key)
                return (
                <div key={day.key} className={styles.dayRow}>
                  <div className={`${styles.dayLabel} ${flagged ? styles.dayLabelFlagged : ''}`}>
                    <button
                      className={styles.flagBtn}
                      title={flagged ? 'Marked incomplete — click to clear' : 'Mark day incomplete'}
                      onClick={() => toggleDayIncomplete(day.key)}
                    >
                      {flagged ? '⚠' : '⚑'}
                    </button>
                    {day.label}
                  </div>
```

Then find the matching close of that `.map(day => (` — the `))}` after the day row's closing `</div>` — and change the `))}` to `)})}` to match the new `return (` / arrow-with-body form.

> Locate it: the day loop ends with
> ```tsx
>                   </div>
>                 </div>
>               ))}
> ```
> Change the final `))}` to:
> ```tsx
>                   </div>
>                 </div>
>                 )
>               })}
> ```

- [ ] **Step 5: Apply both filters to the Table view**

Change the table render from:

```tsx
          {logView === 'table' ? (
            <LogTable log={log} foods={foods} onSaved={load} />
```

to:

```tsx
          {logView === 'table' ? (
            <LogTable
              log={filterLog(log, { hideIncomplete, incompleteDays, hiddenTypes, hideNoType })}
              foods={foods}
              onSaved={load}
            />
```

- [ ] **Step 6: Add flag-button and flagged-label CSS**

In `src/pages/Nutrition.module.css`, the `.dayLabel` currently is `white-space: nowrap; text-align: right`. Add rules (append):

```css
.dayLabel { display: inline-flex; align-items: center; justify-content: flex-end; gap: 4px; }
.flagBtn {
  background: none; border: none; cursor: pointer; padding: 0;
  font-size: 12px; line-height: 1; color: var(--ink3);
}
.flagBtn:hover { color: var(--accent); }
.dayLabelFlagged { color: var(--danger, #B83A3A); }
.dayLabelFlagged .flagBtn { color: var(--danger, #B83A3A); }
```

> Note: `.dayLabel` already sets `flex: 0 0 88px`, `text-align: right`, etc. Adding `display: inline-flex` overrides the block layout so the flag button and label sit inline. Keep the existing `.dayLabel` rule; this appended rule augments it (later declaration wins for `display`). The `.axisRow` empty `.dayLabel` spacer still works (it just renders an empty inline-flex box of the same width).

- [ ] **Step 7: Verify build passes**

Run: `cd health-log && npm run build`
Expected: build succeeds, no type errors.

- [ ] **Step 8: Run the full test suite**

Run: `cd health-log && npx vitest run`
Expected: all tests pass (including `nutritionFilters.test.ts`).

- [ ] **Step 9: Commit**

```bash
git add src/pages/Nutrition.tsx src/pages/Nutrition.module.css
git commit -m "feat(nutrition): mark days incomplete + hide-incomplete filter"
```

---

## Deploy

After all tasks merge, run `migrations/2026-07-13-incomplete-days.sql` in the Supabase SQL editor. Until then the flag toggle will surface a permission/relation error only when clicked; the timeline, chips, and type filter all work regardless (fetch is best-effort → empty set).

## Self-Review notes

- **Spec coverage:** table + persistence (Task 1, 3), best-effort fetch (Task 5 Step 2), pure filter helpers + tests (Task 2), incomplete toggle drops whole days on timeline (Task 5 Step 4) and rows in table (Task 5 Step 5), type filter hides dots keeps days (Task 4 Step 3), filter bar in both views (Task 4 Step 2 — bar sits above the `logView` branch so both Timeline and Table show it), chips replace sidebar legend (Task 4 Steps 4–5), per-day flag marker (Task 5 Steps 4, 6). All covered.
- **Type consistency:** `hiddenTypes: Set<string>` / `hideNoType: boolean` / `incompleteDays: Set<string>` / `hideIncomplete: boolean` used identically across Tasks 4–5 and match `LogFilterOpts` in Task 2. `dayKeyOf` format matches `groupByDay`'s inline key and `day.key`.
- **Filter bar placement:** inserted after `subToggle` and before the `logView === 'table' ? ...` conditional, so it renders in both views (it is outside the ternary). Confirmed against current `Nutrition.tsx` structure.
