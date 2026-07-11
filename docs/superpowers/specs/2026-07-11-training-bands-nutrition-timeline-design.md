# Training bands on the nutrition timeline

**Date:** 2026-07-11
**Status:** Approved, ready for implementation plan

## Goal

On the Nutrition → Log → Timeline view, draw training sessions as orange bands
behind the food dots, alongside the existing sleep bands. Each band is positioned
by the session's `start_time` and sized by its `duration_seconds`. Hovering a band
shows a tooltip with the session **type** and **avg_hr**.

This mirrors the existing **sleep-band** feature (`src/lib/sleep.ts` +
`Nutrition.tsx`) one-for-one: a cross-schema, best-effort read from the `sports`
schema, rendered as translucent bands on the same 24h timeline track.

## Data source

`sports.sessions` — read cross-schema via `supabase.schema('sports')` on the
existing health-pinned singleton. Same mechanism already proven working for
`sports.oura_sleep`. No new table, no migration.

Relevant columns (`sports/src/types/index.ts` → `Session`):

| column | type | notes |
|---|---|---|
| `date` | `YYYY-MM-DD` | groups the band onto a timeline day |
| `start_time` | `HH:MM:SS`, optional | horizontal position; anchors the band on the axis |
| `type` | `SessionType` | shown in tooltip (e.g. `run`, `bike`, `gym`) |
| `duration_seconds` | number, optional | band width |
| `avg_hr` | number, optional | shown in tooltip |

## Behaviour

### Positioning and the "estimated" rule

Following `sleepSegmentsForDay`, each session is converted to an **absolute**
start/end and then clipped to the requested day's window — this handles day-filtering,
midnight-clipping, and cross-midnight splitting uniformly:

- Absolute `start` = `new Date(\`${date}T${start_time}\`)`; **`start_time` fallback
  20:00** when missing (local time, consistent with the food dots and day boundaries).
- Absolute `end` = `start + duration_seconds`; **duration fallback 60 min (3600 s)**
  when missing.
- For a requested `dayKey`, clip `[start, end]` to `[dayStart, dayEnd]` and convert the
  clipped range to `startMin`/`endMin` (minutes 0..1440 from that day's midnight). Drop
  the segment if the clipped range is empty.
- `estimated = true` when **either** `start_time` **or** `duration_seconds` was
  missing (i.e. any fallback value was used). `duration_seconds` is confirmed nullable
  (`int`, no `NOT NULL`; Strava sync writes `null` when `moving_time` is absent), so
  this branch is live, not defensive-only.

**Cross-midnight:** a session dated D that starts late and runs past 24:00 renders as
two segments — the tail on day D (`start→24:00`) and the head on day D+1
(`00:00→overflow`) — because `trainingSegmentsForDay` iterates **all** sessions per
requested day, not just those whose `date === dayKey`. Exactly the mechanism
`sleepSegmentsForDay` uses for a night crossing midnight. The `estimated` flag applies
to both segments.

Bands are drawn behind the food dots (`z-index: 0`, like sleep bands) and are **not
clickable** — hover-tooltip only.

### Visual distinction

- **Real** bands (both `start_time` and `duration_seconds` present): solid orange
  translucent fill.
- **Estimated** bands (any fallback used): diagonal orange stripes — an honest signal
  that the position/width is a placeholder, not measured.

### Tooltip

Leads with type and avg_hr, then time + duration for consistency with the sleep
tooltip. avg_hr omitted from the string when null.

- With HR: `run · avg 142 bpm · 20:00 · 1h00m`
- Without HR: `run · 20:00 · 1h00m`

## Components

### `src/lib/training.ts` (new, unit-tested)

Structured to match `sleep.ts`:

```ts
export interface TrainingSession {
  date: string            // YYYY-MM-DD
  start_time?: string     // HH:MM:SS
  type: string            // SessionType, kept as string here (no import from sports app)
  duration_seconds?: number
  avg_hr?: number | null
}

export interface TrainingSegment {
  startMin: number        // 0..1440
  endMin: number
  session: TrainingSession
  estimated: boolean      // true when start_time and/or duration was defaulted
}

export function trainingSegmentsForDay(
  sessions: TrainingSession[], dayKey: string): TrainingSegment[]

export function trainingTooltip(s: TrainingSession): string

export async function fetchTraining(): Promise<TrainingSession[]>
```

- `fetchTraining()` — `.schema('sports').from('sessions').select('date, start_time,
  type, duration_seconds, avg_hr')`. Best-effort at the call site: failure →
  `console.warn`, never blanks the food timeline. (Throws here; caught in `Nutrition.tsx`,
  same as `fetchSleep`.)
- `trainingSegmentsForDay` and `trainingTooltip` are pure and cover the fallback +
  `estimated` + cross-midnight logic above. `trainingSegmentsForDay` iterates all
  sessions and clips each to the requested day (mirrors `sleepSegmentsForDay`).

Constants: `DEFAULT_START_TIME = '20:00:00'`, `DEFAULT_DURATION_S = 3600` (60 min).

### `Nutrition.tsx` (edit)

- One `useState<TrainingSession[]>([])`.
- In the existing `load()`, add a best-effort `try/catch` that sets training state —
  parallel in structure to the existing sleep fetch block.
- In the `.track`, add a `trainingSegmentsForDay(training, day.key).map(...)` block
  rendering `.trainingBand` (+ `.trainingBandEstimated` when `estimated`), each with a
  `.tooltip` child showing `trainingTooltip(seg.session)`. Placed alongside the sleep
  bands, before the dots.

### `Nutrition.module.css` (edit)

```css
.trainingBand {
  position: absolute; top: 0; bottom: 0;
  background: rgba(230, 145, 50, 0.24);   /* orange, rgba fill so tooltip stays opaque */
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

## Testing

`src/lib/training.test.ts` (vitest, node env — matches `sleep.test.ts`):

- `trainingSegmentsForDay`: real start/duration; 20:00 fallback when no start_time;
  60-min fallback when no duration; `estimated` flag true when either missing, false
  when both present; filters to the requested day (session on another day → no
  segment); **cross-midnight** — a session dated D at 23:00 for 180 min yields
  `[1380, 1440]` when queried for D and `[0, 120]` when queried for D+1, both with the
  same `estimated` value.
- `trainingTooltip`: with avg_hr, without avg_hr (null/undefined omitted).

Verification: `npm run build` (tsc + Vite) + `npx vitest run`. No React component test
infra in this repo, per `[[health-log-repo]]`.

## Deploy notes

Likely **zero-step** — the sleep-band feature needed no deploy because `authenticated`
already had `select` on `sports.*` and `sports` was already an Exposed schema in
Supabase (both inherited from sports-hub). Confirm `authenticated` has `select` on
`sports.sessions`; if bands are silently absent, that grant/RLS and the exposed-schema
setting are the two things to recheck. A failed `fetchTraining` is swallowed by design.

## Out of scope (YAGNI)

- No table-view representation (timeline only, like sleep bands).
- No click/edit interaction on bands.
- No filtering by session type or aggregation.
