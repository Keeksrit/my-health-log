# Sleep bands on the Nutrition timeline

**Date:** 2026-07-11
**Status:** Approved (pending spec review)

## Goal

Show nightly sleep alongside food on the Nutrition **Log → Timeline** view: a
translucent "asleep" band drawn across each day's 24h track, behind the food
dots. Sleep data is read from the existing `sports.oura_sleep` table — no data
copy, no new table.

## Context

- The Nutrition page (`src/pages/Nutrition.tsx`) has two Log views: **Timeline**
  (each day = a 0–24h horizontal track, one dot per logged food, "fast" bars
  before the first / after the last meal) and **Table** (per-entry rows).
- The health-log app's Supabase client (`src/lib/supabase.ts`,
  `src/lib/nutrition.ts`) is pinned to the `health` schema.
- The `sports.oura_sleep` table lives in the **same Supabase project**
  (`rmfililcqufcskhushue`) — `health` and `sports` are two schemas in one
  database. Installed `@supabase/supabase-js` is 2.106.2, which supports the
  runtime `.schema('sports')` selector, so the existing client can read it.
- `sports.oura_sleep` is populated by the sync in the sibling repo
  (`sports-hub/src/lib/oura.ts`). Relevant facts:
  - One row per day (`upsert … onConflict: 'date'`).
  - **Main nightly sleep only** — naps are filtered out
    (`if (!['long_sleep','sleep'].includes(session.type)) continue`).
  - Columns: `date`, `bedtime_start` (timestamptz), `bedtime_end` (timestamptz),
    `sleep_latency_seconds`, `awake_periods` (jsonb), `awake_seconds`.

## Scope decisions

- **Timeline only.** No changes to the Table view.
- **Main sleep only.** Naps are not in the table and are out of scope. Adding
  them would require changing the sports-hub sync + `oura_sleep` schema
  (multiple sessions per day) + a backfill — explicitly deferred.
- **No awake periods.** `awake_periods` / `awake_seconds` are ignored. The band
  is a single continuous interval `bedtime_start → bedtime_end`.
- **Tooltip shows time in bed** (`bedtime_end − bedtime_start`), since awake data
  is not used, e.g. `23:15 → 07:02 · 7h47m`.
- **No sleep editing, no sleep_score/readiness, no date-range filtering.**

## Architecture

### Data layer — new `src/lib/sleep.ts`

```ts
export interface SleepNight {
  date: string            // YYYY-MM-DD (wake day, per Oura)
  bedtime_start: string   // ISO timestamptz
  bedtime_end: string     // ISO timestamptz
}

// Reads the sports schema via the shared singleton, retargeted for this query.
export async function fetchSleep(): Promise<SleepNight[]>
//   supabase.schema('sports').from('oura_sleep')
//     .select('date, bedtime_start, bedtime_end')
//     .order('date', { ascending: false })
```

Only the three columns the band needs are selected. Rows with a null
`bedtime_start` or `bedtime_end` are dropped (can't draw a band).

### Pure, unit-tested helper — also in `src/lib/sleep.ts`

```ts
export interface SleepSegment { startMin: number; endMin: number } // minutes 0..1440

// All asleep intervals that fall within one local calendar day, clipped to
// [0, 1440]. A night crossing midnight yields a late-evening segment on the
// prior day and an early-morning segment on the wake day.
export function sleepSegmentsForDay(nights: SleepNight[], dayKey: string): SleepSegment[]
```

Logic: for each night, take `[bedtime_start, bedtime_end]` as absolute instants;
compute the local-day window `[dayKey 00:00, dayKey+1 00:00)`; the segment is the
overlap expressed as minutes from that day's midnight. Empty overlap → skipped.
`dayKey` uses the same local-day format as `groupByDay` in `Nutrition.tsx`.

### Timeline rendering — `src/pages/Nutrition.tsx` + `Nutrition.module.css`

- `load()` gains a parallel `fetchSleep()` (added to the existing
  `Promise.all`). Result stored in state and grouped once into a
  `Map<dayKey, SleepNight[]>` (or passed whole to the helper per day).
- Inside each `day.track`, before the food dots, render one `.sleepBand` div per
  segment positioned by `left: startMin/1440`, `width: (endMin-startMin)/1440`.
- Bands sit **behind** the dots (z-index below `.dot`) and behind/around the
  existing `.fast` bars; translucent fill built from existing CSS vars.
- Hover tooltip on a band: `HH:MM → HH:MM · <Hh Mm>` (bedtime, wake, time in
  bed). Reuse the tooltip pattern already used by `.dot`.

### Failure isolation

`fetchSleep()` must never blank the page. It is awaited in a way that a failure
(e.g. the `authenticated` role lacks SELECT/RLS on `sports.oura_sleep`) resolves
to `[]` with a `console.warn`, and the food timeline renders normally. Options:
wrap the call in its own try/catch returning `[]`, or use
`Promise.allSettled` for the sleep slice. The food/foods/ingredients loads keep
their existing error handling.

## Prerequisite to verify (no repo migration)

`sports.oura_sleep` must be readable by the `authenticated` role (SELECT grant +
an RLS policy allowing authenticated, mirroring the health tables). sports-hub
already reads this table as the same authenticated user in the same project, so
this is expected to already hold. **No migration is added to this repo.** If
bands don't appear after deploy, the fix is run once in the Supabase SQL editor:

```sql
grant select on sports.oura_sleep to authenticated;
-- plus an RLS policy `auth.role() = 'authenticated'` if RLS is enabled on it
```

## Edge cases

- Day with no sleep row → no band (normal).
- Night crossing midnight → two segments on two adjacent day rows (falls out of
  clipping).
- Missing/null `bedtime_end` → row dropped in `fetchSleep` (no band).
- Timeline only renders days that have log entries, so bands appear only where a
  day already has food. No layout change for foodless days.

## Testing

- `src/lib/sleep.test.ts` (vitest, node env — matches existing `*.test.ts`):
  - segment for a night fully within one day,
  - split of a midnight-crossing night into evening + morning segments on the
    correct day keys,
  - clipping at day boundaries,
  - null bedtime handling / empty overlap → no segment.
- UI verified with `npm run build` (no React test infra in this repo).

## Out of scope (YAGNI)

Table-view sleep, naps, awake periods, sleep score / readiness / HRV, editing
sleep, date-range filtering, any change to the sports-hub sync or DB schema.
