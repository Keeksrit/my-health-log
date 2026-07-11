# Training Bands on Nutrition Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw training sessions from `sports.sessions` as orange bands on the Nutrition → Log → Timeline view, alongside the existing sleep bands, with a hover tooltip showing session type and average HR.

**Architecture:** Mirror the existing sleep-band feature one-for-one. A new pure/data module `src/lib/training.ts` reads `sports.sessions` cross-schema via `supabase.schema('sports')` on the existing health-pinned singleton (no migration). `Nutrition.tsx` fetches it best-effort and renders translucent bands behind the food dots; estimated bands (missing `start_time`/`duration_seconds`) render as diagonal stripes. Styles live in `Nutrition.module.css`.

**Tech Stack:** React 18 + TypeScript, Vite, `@supabase/supabase-js` v2, CSS Modules, Vitest (node env).

## Global Constraints

- No new npm dependencies.
- No database migration; `sports.sessions` is read-only, cross-schema, best-effort — a fetch failure must `console.warn` and never blank the food timeline.
- Styling via CSS Modules + existing CSS vars only (no Tailwind). Bands use `rgba` fills (not `opacity`) so their tooltip child stays fully opaque, matching `.sleepBand`.
- No React component test infra — pure logic is unit-tested with Vitest; UI is verified with `npm run build`.
- Date/time strings are treated as **local** time (consistent with the food dots and day grouping in `Nutrition.tsx`).
- Fallbacks when data is missing: `start_time` → `20:00:00`, `duration_seconds` → `3600` (60 min). Any fallback used ⇒ `estimated = true`.

---

### Task 1: `src/lib/training.ts` data module

**Files:**
- Create: `src/lib/training.ts`
- Test: `src/lib/training.test.ts`

**Interfaces:**
- Consumes: `supabase` from `./supabase` (existing singleton).
- Produces:
  - `interface TrainingSession { date: string; start_time?: string; type: string; duration_seconds?: number; avg_hr?: number | null }`
  - `interface TrainingSegment { startMin: number; endMin: number; session: TrainingSession; estimated: boolean }`
  - `const DEFAULT_START_TIME = '20:00:00'`
  - `const DEFAULT_DURATION_S = 3600`
  - `function trainingSegmentsForDay(sessions: TrainingSession[], dayKey: string): TrainingSegment[]`
  - `function trainingTooltip(s: TrainingSession): string`
  - `async function fetchTraining(): Promise<TrainingSession[]>`

- [ ] **Step 1: Write the failing test**

Create `src/lib/training.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { trainingSegmentsForDay, trainingTooltip, type TrainingSession } from './training'

const session = (over: Partial<TrainingSession> = {}): TrainingSession => ({
  date: '2026-07-10', type: 'run', ...over,
})

describe('trainingSegmentsForDay', () => {
  it('places a real session by start_time and duration, estimated=false', () => {
    const s = session({ start_time: '13:00:00', duration_seconds: 90 * 60 })
    const segs = trainingSegmentsForDay([s], '2026-07-10')
    expect(segs).toHaveLength(1)
    expect(segs[0].startMin).toBe(13 * 60)       // 780
    expect(segs[0].endMin).toBe(14 * 60 + 30)    // 870
    expect(segs[0].estimated).toBe(false)
    expect(segs[0].session).toBe(s)
  })

  it('falls back to 20:00 when start_time is missing, estimated=true', () => {
    const s = session({ duration_seconds: 60 * 60 })
    const segs = trainingSegmentsForDay([s], '2026-07-10')
    expect(segs[0].startMin).toBe(20 * 60)       // 1200
    expect(segs[0].endMin).toBe(21 * 60)         // 1260
    expect(segs[0].estimated).toBe(true)
  })

  it('falls back to 60 min when duration is missing, estimated=true', () => {
    const s = session({ start_time: '08:00:00' })
    const segs = trainingSegmentsForDay([s], '2026-07-10')
    expect(segs[0].startMin).toBe(8 * 60)        // 480
    expect(segs[0].endMin).toBe(9 * 60)          // 540
    expect(segs[0].estimated).toBe(true)
  })

  it('uses both fallbacks when start_time and duration are missing', () => {
    const segs = trainingSegmentsForDay([session()], '2026-07-10')
    expect(segs[0].startMin).toBe(20 * 60)       // 1200
    expect(segs[0].endMin).toBe(21 * 60)         // 1260
    expect(segs[0].estimated).toBe(true)
  })

  it('splits a cross-midnight session across two days (tail on start day)', () => {
    const s = session({ start_time: '23:00:00', duration_seconds: 180 * 60 })
    const segs = trainingSegmentsForDay([s], '2026-07-10')
    expect(segs).toHaveLength(1)
    expect(segs[0].startMin).toBe(23 * 60)       // 1380
    expect(segs[0].endMin).toBe(1440)
    expect(segs[0].estimated).toBe(false)
  })

  it('splits a cross-midnight session across two days (head on next day)', () => {
    const s = session({ start_time: '23:00:00', duration_seconds: 180 * 60 })
    const segs = trainingSegmentsForDay([s], '2026-07-11')
    expect(segs).toHaveLength(1)
    expect(segs[0].startMin).toBe(0)
    expect(segs[0].endMin).toBe(2 * 60)          // 120
  })

  it('returns nothing for a day the session does not touch', () => {
    const s = session({ start_time: '13:00:00', duration_seconds: 60 * 60 })
    expect(trainingSegmentsForDay([s], '2026-07-11')).toEqual([])
  })

  it('skips zero-length or unparseable sessions', () => {
    expect(trainingSegmentsForDay([session({ start_time: '10:00:00', duration_seconds: 0 })], '2026-07-10')).toEqual([])
  })
})

describe('trainingTooltip', () => {
  it('includes type, avg_hr, start and duration', () => {
    const s = session({ type: 'run', start_time: '13:00:00', duration_seconds: 90 * 60, avg_hr: 142 })
    expect(trainingTooltip(s)).toBe('run · avg 142 bpm · 13:00 · 1h30m')
  })

  it('omits avg_hr when null and uses fallbacks for time/duration', () => {
    const s = session({ type: 'gym', avg_hr: null })
    expect(trainingTooltip(s)).toBe('gym · 20:00 · 1h00m')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/training.test.ts`
Expected: FAIL — cannot resolve `./training` / functions not defined.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/training.ts`:

```ts
import { supabase } from './supabase'

export interface TrainingSession {
  date: string             // YYYY-MM-DD
  start_time?: string      // HH:MM:SS (local)
  type: string             // SessionType from sports app, kept loose here
  duration_seconds?: number
  avg_hr?: number | null
}

export interface TrainingSegment {
  startMin: number         // minutes from the day's midnight, 0..1440
  endMin: number
  session: TrainingSession
  estimated: boolean       // true when start_time and/or duration was defaulted
}

const DAY_MS = 24 * 60 * 60 * 1000
export const DEFAULT_START_TIME = '20:00:00'
export const DEFAULT_DURATION_S = 3600

// All portions of each session that fall within one local calendar day, clipped
// to [0, 1440] minutes. A session crossing midnight yields a late-evening segment
// on its own day and an early-morning segment on the next day. Missing start_time
// or duration is filled from the defaults and flags the segment as estimated.
export function trainingSegmentsForDay(sessions: TrainingSession[], dayKey: string): TrainingSegment[] {
  const dayStart = new Date(`${dayKey}T00:00:00`).getTime()
  const dayEnd = dayStart + DAY_MS
  const segs: TrainingSegment[] = []
  for (const s of sessions) {
    const estimated = !s.start_time || s.duration_seconds == null
    const start = new Date(`${s.date}T${s.start_time ?? DEFAULT_START_TIME}`).getTime()
    const durS = s.duration_seconds ?? DEFAULT_DURATION_S
    const end = start + durS * 1000
    if (!(end > start)) continue                 // drops zero-length + NaN (unparseable) rows
    const clipS = Math.max(start, dayStart)
    const clipE = Math.min(end, dayEnd)
    if (clipE <= clipS) continue
    segs.push({
      startMin: (clipS - dayStart) / 60000,
      endMin: (clipE - dayStart) / 60000,
      session: s,
      estimated,
    })
  }
  return segs
}

export function trainingTooltip(s: TrainingSession): string {
  const hhmm = (s.start_time ?? DEFAULT_START_TIME).slice(0, 5)
  const mins = Math.round((s.duration_seconds ?? DEFAULT_DURATION_S) / 60)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const parts = [s.type]
  if (s.avg_hr != null) parts.push(`avg ${s.avg_hr} bpm`)
  parts.push(hhmm, `${h}h${String(m).padStart(2, '0')}m`)
  return parts.join(' · ')
}

// Reads the sports schema via the shared health-pinned singleton, retargeting
// just this query. Rows without a date can't be placed, so drop them.
export async function fetchTraining(): Promise<TrainingSession[]> {
  const { data, error } = await supabase
    .schema('sports')
    .from('sessions')
    .select('date, start_time, type, duration_seconds, avg_hr')
    .order('date', { ascending: false })
  if (error) throw error
  return (data as TrainingSession[]).filter(s => s.date)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/training.test.ts`
Expected: PASS — all 10 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/training.ts src/lib/training.test.ts
git commit -m "feat: training session timeline segments + tooltip (sports.sessions)"
```

---

### Task 2: Render training bands in the timeline

**Files:**
- Modify: `src/pages/Nutrition.tsx`
- Modify: `src/pages/Nutrition.module.css`

**Interfaces:**
- Consumes from Task 1: `fetchTraining`, `trainingSegmentsForDay`, `trainingTooltip`, type `TrainingSession`.
- Produces: no exports (page component); adds `.trainingBand` / `.trainingBandEstimated` CSS classes.

- [ ] **Step 1: Add the imports**

In `src/pages/Nutrition.tsx`, below the existing sleep imports (after line 10):

```tsx
import { fetchTraining, trainingSegmentsForDay, trainingTooltip } from '../lib/training'
import type { TrainingSession } from '../lib/training'
```

- [ ] **Step 2: Add training state**

In `src/pages/Nutrition.tsx`, immediately after the `sleep` state declaration
(`const [sleep, setSleep] = useState<SleepNight[]>([])`):

```tsx
const [training, setTraining] = useState<TrainingSession[]>([])
```

- [ ] **Step 3: Fetch training best-effort in `load()`**

In `src/pages/Nutrition.tsx`, in `load()`, directly after the existing sleep
`try/catch` block (the one that logs `'Sleep data unavailable:'`), add a sibling block:

```tsx
    // Training is best-effort too: a missing grant/RLS on sports.sessions must
    // never blank the food timeline.
    try {
      setTraining(await fetchTraining())
    } catch (e) {
      console.warn('Training data unavailable:', e)
    }
```

- [ ] **Step 4: Render training bands behind the dots**

In `src/pages/Nutrition.tsx`, inside the `.track` div, directly after the sleep-band
`.map(...)` block (the block whose items have `key={`sleep-${i}`}`) and before the
`{day.dots.map(...)}` block, add:

```tsx
                    {trainingSegmentsForDay(training, day.key).map((seg, i) => (
                      <div
                        key={`training-${i}`}
                        className={`${styles.trainingBand} ${seg.estimated ? styles.trainingBandEstimated : ''}`}
                        style={{
                          left: `${(seg.startMin / 1440) * 100}%`,
                          width: `${((seg.endMin - seg.startMin) / 1440) * 100}%`,
                        }}
                      >
                        <span className={styles.tooltip}>{trainingTooltip(seg.session)}</span>
                      </div>
                    ))}
```

- [ ] **Step 5: Add the band styles**

In `src/pages/Nutrition.module.css`, directly after the `.sleepBand:hover .tooltip`
rule (the block ending `.sleepBand:hover .tooltip { display: block; }`), add:

```css
/* Training sessions, drawn behind the food dots. rgba fill (not `opacity`) so the
   tooltip child renders fully opaque. Estimated bands (missing start_time/duration)
   are striped to signal the position/width is a placeholder, not measured. */
.trainingBand {
  position: absolute;
  top: 0;
  bottom: 0;
  background: rgba(230, 145, 50, 0.24);
  border-radius: 3px;
  z-index: 0;
}
.trainingBand:hover .tooltip { display: block; }
.trainingBandEstimated {
  background: repeating-linear-gradient(
    45deg,
    rgba(230, 145, 50, 0.30) 0 6px,
    rgba(230, 145, 50, 0.10) 6px 12px);
}
```

- [ ] **Step 6: Verify the build type-checks and bundles**

Run: `npm run build`
Expected: PASS — `tsc` reports no errors and Vite writes `dist/` with no errors.

- [ ] **Step 7: Verify unit tests still pass**

Run: `npm run test`
Expected: PASS — all suites green, including `training.test.ts`.

- [ ] **Step 8: Commit**

```bash
git add src/pages/Nutrition.tsx src/pages/Nutrition.module.css
git commit -m "feat: draw training bands on nutrition timeline (orange; striped when estimated)"
```

---

## Deploy Notes (post-implementation, out of the code path)

Likely zero-step, same as the sleep-band feature: `authenticated` already had `select`
on `sports.*` and `sports` was already an Exposed schema in Supabase (inherited from
sports-hub). If training bands are silently absent after deploy, recheck exactly two
things: (1) `authenticated` has `select` on `sports.sessions`, and (2) `sports` is in
Supabase → Settings → API → Exposed schemas. A failed `fetchTraining` is swallowed by
design (`console.warn`) and never blanks the food timeline.

## Self-Review

- **Spec coverage:** data source (`sports.sessions` cross-schema) → Task 1 Step 3
  `fetchTraining`. Positioning + 20:00/60-min fallbacks + `estimated` flag → Task 1
  `trainingSegmentsForDay`. Cross-midnight splitting → Task 1 Steps 1/3 (two cross-midnight
  tests). Solid vs striped visual → Task 2 Steps 4–5. Tooltip (type + avg_hr, avg_hr
  omitted when null) → Task 1 `trainingTooltip`. Best-effort fetch → Task 2 Step 3.
  Tests + build verification → Task 1 Step 4, Task 2 Steps 6–7. All covered.
- **Placeholder scan:** none — every code/command step contains literal content.
- **Type consistency:** `TrainingSession` / `TrainingSegment` field names and
  `trainingSegmentsForDay` / `trainingTooltip` / `fetchTraining` signatures are
  identical across the interfaces block, Task 1 implementation, and Task 2 usage.
