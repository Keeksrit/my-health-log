# Sleep Bands on the Nutrition Timeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw a translucent nightly-sleep band across each day's track on the Nutrition Log → Timeline view, read live from the `sports.oura_sleep` table.

**Architecture:** A new `src/lib/sleep.ts` reads `sports.oura_sleep` through the existing Supabase singleton retargeted with `.schema('sports')`, and exposes pure, unit-tested helpers that turn nightly `[bedtime_start, bedtime_end]` intervals into per-day, midnight-clipped segments in minutes-from-midnight. `Nutrition.tsx` loads sleep best-effort (a failure never blanks the food timeline) and renders segment `<div>`s behind the existing food dots, styled via `Nutrition.module.css`.

**Tech Stack:** React 18 + TypeScript, Vite, `@supabase/supabase-js` 2.106.2, CSS Modules + CSS variables, Vitest (node env).

**Spec:** `docs/superpowers/specs/2026-07-11-nutrition-sleep-bands-design.md`

## Global Constraints

- Styling is **CSS Modules + CSS variables** (`--accent`, `--accent-l`, `--ink`, `--ink2`, `--border`, …). **No Tailwind.**
- Reuse the existing Supabase singleton exported from `src/lib/supabase.ts` (pinned to the `health` schema). Read the sports table with the runtime selector `supabase.schema('sports').from('oura_sleep')` — do **not** create a second client and do **not** change the singleton's default schema.
- **No database migration** is added in this repo. Grants/RLS on `sports.oura_sleep` are a post-deploy verify step (see spec).
- Automated tests are **Vitest, node env, pure logic only** (`src/**/*.test.ts`); there is no React component test infra. UI changes are verified with `npm run build` (runs `tsc` then Vite build).
- Scope is **Timeline view only**: main nightly sleep, no naps, no awake periods, no Table-view changes, no sleep editing.
- Frequent commits. End every commit message with the trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## File Structure

- **Create** `src/lib/sleep.ts` — data fetch (`fetchSleep`) + pure helpers (`sleepSegmentsForDay`, `sleepTooltip`) + types (`SleepNight`, `SleepSegment`).
- **Create** `src/lib/sleep.test.ts` — Vitest coverage for the pure helpers.
- **Modify** `src/pages/Nutrition.tsx` — load sleep best-effort, render bands in each day track.
- **Modify** `src/pages/Nutrition.module.css` — `.sleepBand` styling + band-hover tooltip rule.

---

### Task 1: Sleep data layer and pure helpers (`src/lib/sleep.ts`)

**Files:**
- Create: `src/lib/sleep.ts`
- Test: `src/lib/sleep.test.ts`

**Interfaces:**
- Consumes: the `supabase` singleton from `src/lib/supabase.ts`.
- Produces (later tasks rely on these exact names/types):
  - `interface SleepNight { date: string; bedtime_start: string; bedtime_end: string }`
  - `interface SleepSegment { startMin: number; endMin: number; night: SleepNight }`
  - `function sleepSegmentsForDay(nights: SleepNight[], dayKey: string): SleepSegment[]` — `dayKey` is the local `YYYY-MM-DD` string produced by `groupByDay` in `Nutrition.tsx`. Returns each night's overlap with that local calendar day, in minutes from that day's midnight (`0..1440`).
  - `function sleepTooltip(night: SleepNight): string` — e.g. `"23:15 → 07:02 · 7h47m"` (bedtime → wake · time in bed).
  - `async function fetchSleep(): Promise<SleepNight[]>` — reads `sports.oura_sleep`, drops rows missing either bedtime.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/sleep.test.ts`. Timestamps use **local** ISO strings (no `Z`) so the assertions are timezone-independent — both the day window and the night are interpreted in the same local zone.

```ts
import { describe, it, expect } from 'vitest'
import { sleepSegmentsForDay, sleepTooltip, type SleepNight } from './sleep'

const night = (date: string, start: string, end: string): SleepNight => ({
  date, bedtime_start: start, bedtime_end: end,
})

describe('sleepSegmentsForDay', () => {
  const crossMidnight = night('2026-07-11', '2026-07-10T23:00:00', '2026-07-11T07:00:00')

  it('returns the late-evening segment on the prior day', () => {
    const segs = sleepSegmentsForDay([crossMidnight], '2026-07-10')
    expect(segs).toHaveLength(1)
    expect(segs[0].startMin).toBe(23 * 60) // 1380
    expect(segs[0].endMin).toBe(1440)
    expect(segs[0].night).toBe(crossMidnight)
  })

  it('returns the early-morning segment on the wake day', () => {
    const segs = sleepSegmentsForDay([crossMidnight], '2026-07-11')
    expect(segs).toHaveLength(1)
    expect(segs[0].startMin).toBe(0)
    expect(segs[0].endMin).toBe(7 * 60) // 420
  })

  it('returns nothing for a day the night does not touch', () => {
    expect(sleepSegmentsForDay([crossMidnight], '2026-07-09')).toEqual([])
  })

  it('handles a night fully within one day', () => {
    const nap = night('2026-07-10', '2026-07-10T13:00:00', '2026-07-10T14:30:00')
    const segs = sleepSegmentsForDay([nap], '2026-07-10')
    expect(segs).toHaveLength(1)
    expect(segs[0].startMin).toBe(13 * 60)      // 780
    expect(segs[0].endMin).toBe(14 * 60 + 30)   // 870
  })

  it('skips zero-length or inverted intervals', () => {
    const bad = night('2026-07-10', '2026-07-10T07:00:00', '2026-07-10T07:00:00')
    expect(sleepSegmentsForDay([bad], '2026-07-10')).toEqual([])
  })
})

describe('sleepTooltip', () => {
  it('formats bedtime, wake, and time in bed', () => {
    const n = night('2026-07-11', '2026-07-10T23:15:00', '2026-07-11T07:02:00')
    expect(sleepTooltip(n)).toBe('23:15 → 07:02 · 7h47m')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/sleep.test.ts`
Expected: FAIL — cannot resolve `./sleep` / functions not defined.

- [ ] **Step 3: Implement `src/lib/sleep.ts`**

```ts
import { supabase } from './supabase'

export interface SleepNight {
  date: string          // YYYY-MM-DD, the wake day (per Oura)
  bedtime_start: string // ISO timestamptz
  bedtime_end: string   // ISO timestamptz
}

export interface SleepSegment {
  startMin: number      // minutes from the day's midnight, 0..1440
  endMin: number
  night: SleepNight
}

const DAY_MS = 24 * 60 * 60 * 1000

// All asleep intervals that fall within one local calendar day, clipped to
// [0, 1440] minutes. A night crossing midnight yields a late-evening segment
// on the prior day and an early-morning segment on the wake day.
export function sleepSegmentsForDay(nights: SleepNight[], dayKey: string): SleepSegment[] {
  const dayStart = new Date(`${dayKey}T00:00:00`).getTime()
  const dayEnd = dayStart + DAY_MS
  const segs: SleepSegment[] = []
  for (const night of nights) {
    const start = new Date(night.bedtime_start).getTime()
    const end = new Date(night.bedtime_end).getTime()
    if (!(end > start)) continue
    const s = Math.max(start, dayStart)
    const e = Math.min(end, dayEnd)
    if (e <= s) continue
    segs.push({ startMin: (s - dayStart) / 60000, endMin: (e - dayStart) / 60000, night })
  }
  return segs
}

export function sleepTooltip(night: SleepNight): string {
  const opts = { hour: '2-digit', minute: '2-digit', hour12: false } as const
  const bed = new Date(night.bedtime_start).toLocaleTimeString(undefined, opts)
  const wake = new Date(night.bedtime_end).toLocaleTimeString(undefined, opts)
  const mins = Math.round(
    (new Date(night.bedtime_end).getTime() - new Date(night.bedtime_start).getTime()) / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${bed} → ${wake} · ${h}h${String(m).padStart(2, '0')}m`
}

// Reads the sports schema via the shared health-pinned singleton, retargeting
// just this query. Rows missing either bedtime can't be drawn, so drop them.
export async function fetchSleep(): Promise<SleepNight[]> {
  const { data, error } = await supabase
    .schema('sports')
    .from('oura_sleep')
    .select('date, bedtime_start, bedtime_end')
    .order('date', { ascending: false })
  if (error) throw error
  return (data as SleepNight[]).filter(n => n.bedtime_start && n.bedtime_end)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/sleep.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sleep.ts src/lib/sleep.test.ts
git commit -m "$(cat <<'EOF'
feat: sleep data layer for nutrition timeline

Read main nightly sleep from sports.oura_sleep and clip each night into
per-day, midnight-crossing segments. Pure helpers unit-tested.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Render sleep bands on the timeline (`Nutrition.tsx` + `Nutrition.module.css`)

**Files:**
- Modify: `src/pages/Nutrition.tsx`
- Modify: `src/pages/Nutrition.module.css`

**Interfaces:**
- Consumes from Task 1: `fetchSleep`, `sleepSegmentsForDay`, `sleepTooltip`, type `SleepNight`.
- Produces: no new exports; a visible band per day and a `.sleepBand` CSS class.

- [ ] **Step 1: Import the sleep module**

In `src/pages/Nutrition.tsx`, add to the import block near the top (after the `nutrition` import on line 8):

```ts
import { fetchSleep, sleepSegmentsForDay, sleepTooltip } from '../lib/sleep'
import type { SleepNight } from '../lib/sleep'
```

- [ ] **Step 2: Add sleep state**

In the `Nutrition` component, alongside the other `useState` hooks (after `const [log, setLog] = useState<LogEntry[]>([])`, line 104):

```ts
const [sleep, setSleep] = useState<SleepNight[]>([])
```

- [ ] **Step 3: Load sleep best-effort in `load()`**

Replace the existing `load` function body so sleep is fetched **after** the main load and its failure only warns (never sets the page error, never blocks the timeline). Replace lines 112–127:

```ts
  async function load() {
    try {
      const [f, i, l] = await Promise.all([
        fetchFoodsWithIngredients(),
        fetchIngredients(),
        fetchLog(),
      ])
      setFoods(f)
      setIngredients(i)
      setLog(l)
    } catch (e: any) {
      setError(e?.message ?? 'Could not load nutrition data.')
    } finally {
      setLoading(false)
    }
    // Sleep is best-effort: a missing grant/RLS on sports.oura_sleep must
    // never blank the food timeline.
    try {
      setSleep(await fetchSleep())
    } catch (e) {
      console.warn('Sleep data unavailable:', e)
    }
  }
```

- [ ] **Step 4: Render the bands inside each day track**

In the timeline JSX, the `.track` div currently renders two `.fast` divs then the `day.dots.map(...)`. Insert the sleep bands **between the two `.fast` divs and the `day.dots.map`** (i.e. immediately after the second `<div className={styles.fast} .../>` that closes at line 196, before `{day.dots.map(...)}`):

```tsx
                    {sleepSegmentsForDay(sleep, day.key).map((seg, i) => (
                      <div
                        key={`sleep-${i}`}
                        className={styles.sleepBand}
                        style={{
                          left: `${(seg.startMin / 1440) * 100}%`,
                          width: `${((seg.endMin - seg.startMin) / 1440) * 100}%`,
                        }}
                      >
                        <span className={styles.tooltip}>{sleepTooltip(seg.night)}</span>
                      </div>
                    ))}
```

- [ ] **Step 5: Add the CSS**

In `src/pages/Nutrition.module.css`, add after the `.fast { … }` rule (ends line 210). The fill uses an **rgba literal, not `opacity`**, because the band has a tooltip child — element `opacity` would fade the tooltip too. The colour is a muted slate so it reads as "night" and stays distinct from the accent-tinted `.fast` bars in both themes.

```css
/* Nightly sleep, drawn behind the food dots. rgba fill (not `opacity`) so the
   tooltip child renders fully opaque. */
.sleepBand {
  position: absolute;
  top: 0;
  bottom: 0;
  background: rgba(99, 102, 168, 0.22);
  border-radius: 3px;
  z-index: 0;
}
.sleepBand:hover .tooltip { display: block; }
```

- [ ] **Step 6: Type-check and build**

Run: `npm run build`
Expected: PASS — `tsc` reports no errors and Vite writes `dist/`. If `tsc` complains that `.schema` does not exist, confirm the installed `@supabase/supabase-js` is 2.106.2 (`npm ls @supabase/supabase-js`); it supports `.schema()`.

- [ ] **Step 7: Manual verification (no component test infra)**

Run: `npm run dev`, open the app, sign in, go to Nutrition → Log → Timeline.
Expected: on days that have both logged food and Oura sleep, a slate band sits behind the dots — a strip in the early-morning hours and another in the late-evening hours for a normal night. Hovering the band shows `HH:MM → HH:MM · Hh MMm`. Foodless days and days without sleep data render exactly as before. Temporarily forcing `fetchSleep` to throw leaves the food timeline fully working (bands just absent, a `console.warn` appears).

- [ ] **Step 8: Commit**

```bash
git add src/pages/Nutrition.tsx src/pages/Nutrition.module.css
git commit -m "$(cat <<'EOF'
feat: show nightly sleep bands on nutrition timeline

Render sports.oura_sleep intervals as translucent bands behind the food
dots on the Log timeline. Best-effort load: a sleep fetch failure warns
and leaves the food timeline intact.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Notes for the implementer

- **Do not** run any SQL / add a migration. If bands never appear even though sleep exists, that's the post-deploy grant/RLS step in the spec, not a code bug.
- **Do not** widen scope to naps, awake periods, or the Table view.
- The line numbers above refer to `Nutrition.tsx` / `Nutrition.module.css` as they stand today; if they've drifted, anchor on the described code (the `.track` div, the two `.fast` divs, the `.fast { }` CSS rule) rather than the numbers.
