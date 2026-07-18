# Lab Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the screenshot stash on `/tests` with a structured lab-results tracker: paste-import from the Estonian health portal, persisted in Supabase, shown as a per-analyte trend graph and a comparison table.

**Architecture:** Pure logic modules (`labParse`, `labChart`, `labDescriptionsCsv`) with unit tests + thin Supabase data layers (`lab`, `labDescriptions`, `labEvents`) following the existing `units.ts`/`useUnits.ts` patterns. The `/tests` page is rebuilt as a shell (view toggle) composing focused sub-components (`ImportModal`, `TableView`, `GraphView`). Charts are hand-rolled inline SVG driven by pure geometry helpers — no charting library. Two new `/settings` sections manage analyte descriptions (with CSV round-trip) and events.

**Tech Stack:** React 18 + TypeScript + Vite, `@supabase/supabase-js` v2 (schema `health`, singleton `src/lib/supabase.ts`), CSS Modules, Vitest (node env, `src/**/*.test.ts` only). Full design: `docs/superpowers/specs/2026-07-18-lab-tracker-design.md`.

## Global Constraints

- **No new runtime dependencies.** Charts are hand-rolled SVG. (Design decision — do not add Recharts/Chart.js.)
- **Pure logic lives in `src/lib/*.ts` with a colocated `*.test.ts`;** data-layer/UI is verified by `npm run build` (tsc + vite) — there is no React component test infra.
- **RLS-only single-user model.** Every new table gets `authenticated` grants + an RLS policy `using (auth.role() = 'authenticated')`. Any table edited in place also needs an explicit `grant update` (Postgres checks grants before RLS) — omitting it causes "permission denied".
- **All Supabase table access goes through the health-pinned singleton** `import { supabase } from './supabase'` (already defaults to schema `health`).
- **Data fetches on the page are best-effort:** a failure logs `console.warn` and renders empty, never throws to the user.
- **Unique-violation Postgres error code is `23505`** (used to detect duplicate `sample_id`).
- Commit after every task with a `feat:`/`refactor:`/`chore:` message. Co-author trailer is added by the harness.

---

### Task 1: Database migration

**Files:**
- Create: `migrations/2026-07-18-lab-tracker.sql`

**Interfaces:**
- Produces: the `health.lab_sessions`, `health.lab_results`, `health.lab_analyte_descriptions`, `health.lab_events` tables that every data-layer task queries.

- [ ] **Step 1: Write the migration SQL**

Create `migrations/2026-07-18-lab-tracker.sql`:

```sql
-- Lab tracker: structured lab-results tracker for /tests.
-- Run once in the Supabase SQL editor. Idempotent (IF NOT EXISTS).

create table if not exists health.lab_sessions (
  id         uuid primary key default gen_random_uuid(),
  sample_id  text unique not null,
  material   text,
  taken_at   timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists health.lab_results (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references health.lab_sessions(id) on delete cascade,
  analyte    text not null,
  result_raw text not null,
  result_num double precision,
  unit       text,
  ref        text,
  ref_min    double precision,
  ref_max    double precision,
  verdict    text
);
create index if not exists lab_results_session_id_idx on health.lab_results(session_id);

create table if not exists health.lab_analyte_descriptions (
  analyte     text primary key,
  description text
);

create table if not exists health.lab_events (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  event_date date not null,
  color      text
);

-- Grants. select/insert/delete on all; UPDATE only on the two edited-in-place tables.
grant select, insert, delete on health.lab_sessions             to authenticated;
grant select, insert, delete on health.lab_results              to authenticated;
grant select, insert, delete, update on health.lab_analyte_descriptions to authenticated;
grant select, insert, delete, update on health.lab_events       to authenticated;

-- RLS: authenticated-only, matching the rest of the health schema.
alter table health.lab_sessions             enable row level security;
alter table health.lab_results              enable row level security;
alter table health.lab_analyte_descriptions enable row level security;
alter table health.lab_events               enable row level security;

create policy lab_sessions_auth on health.lab_sessions
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy lab_results_auth on health.lab_results
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy lab_analyte_descriptions_auth on health.lab_analyte_descriptions
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy lab_events_auth on health.lab_events
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
```

- [ ] **Step 2: Verify SQL is well-formed**

Read the file back and confirm: 4 tables, `sample_id` unique, `on delete cascade` on `lab_results.session_id`, `update` grant present on descriptions + events and absent on sessions + results, one RLS policy per table. (This migration is applied manually in the Supabase SQL editor at deploy time — it is not run by the app or tests.)

- [ ] **Step 3: Commit**

```bash
git add migrations/2026-07-18-lab-tracker.sql
git commit -m "feat: lab tracker DB migration (sessions, results, descriptions, events)"
```

---

### Task 2: Paste parser (`labParse.ts`)

**Files:**
- Create: `src/lib/labParse.ts`
- Test: `src/lib/labParse.test.ts`

**Interfaces:**
- Consumes: `parseLocalDateTime` from `./nutritionCsv`.
- Produces:
  - `parseResultNum(raw: string): number | null`
  - `parseRefBounds(ref: string): { min: number | null; max: number | null }`
  - `interface ParsedResult { analyte: string; result_raw: string; result_num: number | null; unit: string | null; ref: string | null; ref_min: number | null; ref_max: number | null; verdict: string | null }`
  - `interface ParsedSession { sample_id: string; material: string | null; taken_at: string; results: ParsedResult[] }`
  - `parseSession(text: string): ParsedSession` — throws `Error` when `sample_id` or `taken_at` is missing/unparseable.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/labParse.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseResultNum, parseRefBounds, parseSession } from './labParse'

describe('parseResultNum', () => {
  it('parses a plain decimal', () => {
    expect(parseResultNum('5.2')).toBe(5.2)
  })
  it('accepts comma decimals', () => {
    expect(parseResultNum('5,2')).toBe(5.2)
  })
  it('returns null for censored (</>) values', () => {
    expect(parseResultNum('<0.10')).toBeNull()
    expect(parseResultNum('> 100')).toBeNull()
  })
  it('returns null for non-numeric text', () => {
    expect(parseResultNum('Negatiivne')).toBeNull()
    expect(parseResultNum('')).toBeNull()
  })
})

describe('parseRefBounds', () => {
  it('parses a two-sided range', () => {
    expect(parseRefBounds('2.0-4.5')).toEqual({ min: 2.0, max: 4.5 })
  })
  it('parses comma-decimal ranges with spaces', () => {
    expect(parseRefBounds('2,0 - 4,5')).toEqual({ min: 2.0, max: 4.5 })
  })
  it('parses a less-than bound', () => {
    expect(parseRefBounds('<5')).toEqual({ min: null, max: 5 })
  })
  it('parses a greater-than bound', () => {
    expect(parseRefBounds('>1')).toEqual({ min: 1, max: null })
  })
  it('returns nulls for qualitative/empty refs', () => {
    expect(parseRefBounds('Negatiivne')).toEqual({ min: null, max: null })
    expect(parseRefBounds('')).toEqual({ min: null, max: null })
  })
})

const SAMPLE = [
  'Proovimaterjal: SEERUM, Proovinõu ID: L26070702301, Võetud: 07.07.2026 15:13',
  'Seerum - 07.07.2026 15:13',
  'Analüüs\tTulemus\tÜhik\tRef.väärtus',
  'd1 Dermatophagoides pteronyssinus\t<0.10\tkU/L\t<0.35',
  'Tulemuse tõlgendus: Negatiivne',
  'Kolesterool\t5,2\tmmol/L\t2.0-5.0',
  'Tulemuse tõlgendus: Kõrge',
].join('\n')

describe('parseSession', () => {
  it('extracts session metadata', () => {
    const s = parseSession(SAMPLE)
    expect(s.sample_id).toBe('L26070702301')
    expect(s.material).toBe('SEERUM')
    expect(s.taken_at).toBe(new Date(2026, 6, 7, 15, 13).toISOString())
  })
  it('parses each analyte row and skips the header + restated material line', () => {
    const s = parseSession(SAMPLE)
    expect(s.results).toHaveLength(2)
    expect(s.results[0]).toEqual({
      analyte: 'd1 Dermatophagoides pteronyssinus',
      result_raw: '<0.10', result_num: null, unit: 'kU/L',
      ref: '<0.35', ref_min: null, ref_max: 0.35, verdict: 'Negatiivne',
    })
    expect(s.results[1]).toEqual({
      analyte: 'Kolesterool',
      result_raw: '5,2', result_num: 5.2, unit: 'mmol/L',
      ref: '2.0-5.0', ref_min: 2.0, ref_max: 5.0, verdict: 'Kõrge',
    })
  })
  it('throws when the sample id is missing', () => {
    expect(() => parseSession('Analüüs\tTulemus\nKolesterool\t5\tmmol/L\t2-5')).toThrow(/sample/i)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- labParse`
Expected: FAIL — `labParse` module / exports not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/labParse.ts`:

```ts
import { parseLocalDateTime } from './nutritionCsv'

export interface ParsedResult {
  analyte: string
  result_raw: string
  result_num: number | null
  unit: string | null
  ref: string | null
  ref_min: number | null
  ref_max: number | null
  verdict: string | null
}

export interface ParsedSession {
  sample_id: string
  material: string | null
  taken_at: string // ISO
  results: ParsedResult[]
}

// A bare number, comma- or dot-decimal. Censored (< / >) and text → null,
// so only plottable values get a result_num (censored values still keep
// their verbatim result_raw for the table).
export function parseResultNum(raw: string): number | null {
  const t = raw.trim()
  if (!t || /^[<>]/.test(t)) return null
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

const NUM = String.raw`-?\d+(?:[.,]\d+)?`
function toNum(s: string): number { return Number(s.replace(',', '.')) }

export function parseRefBounds(ref: string): { min: number | null; max: number | null } {
  const t = ref.trim()
  let m: RegExpExecArray | null
  if ((m = new RegExp(`^(${NUM})\\s*-\\s*(${NUM})$`).exec(t)))
    return { min: toNum(m[1]), max: toNum(m[2]) }
  if ((m = new RegExp(`^<\\s*(${NUM})$`).exec(t)))
    return { min: null, max: toNum(m[1]) }
  if ((m = new RegExp(`^>\\s*(${NUM})$`).exec(t)))
    return { min: toNum(m[1]), max: null }
  return { min: null, max: null }
}

const META_RE = /Proovinõu\s*ID:\s*(\S+)/i
const MATERIAL_RE = /Proovimaterjal:\s*([^,]+)/i
const TAKEN_RE = /Võetud:\s*([\d.]+\s+[\d:]+)/i
const VERDICT_RE = /^Tulemuse\s*tõlgendus:\s*(.+)$/i

export function parseSession(text: string): ParsedSession {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const meta = lines.find(l => META_RE.test(l))
  const sampleId = meta ? META_RE.exec(meta)![1] : null
  if (!sampleId) throw new Error('Could not find a sample id (Proovinõu ID) in the pasted text.')
  const material = meta && MATERIAL_RE.test(meta) ? MATERIAL_RE.exec(meta)![1].trim() : null
  const takenRaw = meta && TAKEN_RE.test(meta) ? TAKEN_RE.exec(meta)![1] : null
  const takenDate = takenRaw ? parseLocalDateTime(takenRaw) : null
  if (!takenDate) throw new Error('Could not find a sample date (Võetud) in the pasted text.')

  const results: ParsedResult[] = []
  for (const line of lines) {
    const verdict = VERDICT_RE.exec(line)
    if (verdict) {
      if (results.length) results[results.length - 1].verdict = verdict[1].trim()
      continue
    }
    if (!line.includes('\t')) continue // restated material line, metadata, etc.
    const cols = line.split('\t').map(c => c.trim())
    if (cols[0] === 'Analüüs') continue // column header row
    const [analyte, resultRaw = '', unit = '', ref = ''] = cols
    if (!analyte) continue
    const bounds = parseRefBounds(ref)
    results.push({
      analyte,
      result_raw: resultRaw,
      result_num: parseResultNum(resultRaw),
      unit: unit || null,
      ref: ref || null,
      ref_min: bounds.min,
      ref_max: bounds.max,
      verdict: null,
    })
  }

  return { sample_id: sampleId, material, taken_at: takenDate.toISOString(), results }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- labParse`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/labParse.ts src/lib/labParse.test.ts
git commit -m "feat: lab paste parser (labParse)"
```

---

### Task 3: Chart geometry (`labChart.ts`)

**Files:**
- Create: `src/lib/labChart.ts`
- Test: `src/lib/labChart.test.ts`

**Interfaces:**
- Produces:
  - `interface ChartDims { width: number; height: number; padL: number; padR: number; padT: number; padB: number }`
  - `interface ChartPoint { t: number; v: number }` (t = epoch ms, v = numeric result)
  - `computeYDomain(values: number[], refMin: number | null, refMax: number | null): { yMin: number; yMax: number }`
  - `scalePoints(pts: ChartPoint[], dims: ChartDims, tMin: number, tMax: number, yMin: number, yMax: number): { x: number; y: number }[]`
  - `refBandRect(refMin: number | null, refMax: number | null, dims: ChartDims, yMin: number, yMax: number): { x: number; y: number; width: number; height: number } | null`
  - `eventLinesX(dates: number[], dims: ChartDims, tMin: number, tMax: number): number[]` (returns x for each in-range date; out-of-range dropped)
  - `niceTicks(yMin: number, yMax: number, count?: number): number[]`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/labChart.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeYDomain, scalePoints, refBandRect, eventLinesX, niceTicks } from './labChart'

const DIMS = { width: 100, height: 100, padL: 10, padR: 10, padT: 10, padB: 10 }
// plot area: x in [10, 90] (width 80), y in [10, 90] (height 80)

describe('computeYDomain', () => {
  it('spans data and ref bounds with padding', () => {
    const d = computeYDomain([3, 5], 2, 6)
    expect(d.yMin).toBeLessThanOrEqual(2)
    expect(d.yMax).toBeGreaterThanOrEqual(6)
  })
  it('handles a single value with no ref', () => {
    const d = computeYDomain([5], null, null)
    expect(d.yMin).toBeLessThan(5)
    expect(d.yMax).toBeGreaterThan(5)
  })
})

describe('scalePoints', () => {
  it('maps time to x and value to inverted y within the plot area', () => {
    const pts = scalePoints([{ t: 0, v: 0 }, { t: 100, v: 100 }], DIMS, 0, 100, 0, 100)
    expect(pts[0]).toEqual({ x: 10, y: 90 }) // earliest, lowest → left, bottom
    expect(pts[1]).toEqual({ x: 90, y: 10 }) // latest, highest → right, top
  })
})

describe('refBandRect', () => {
  it('spans the full plot width and the ref range', () => {
    const r = refBandRect(0, 50, DIMS, 0, 100)!
    expect(r.x).toBe(10)
    expect(r.width).toBe(80)
    expect(r.y).toBe(50)     // top of band = y for value 50
    expect(r.height).toBe(40) // down to value 0 (y=90)
  })
  it('clips a one-sided <max band to the plot bottom', () => {
    const r = refBandRect(null, 50, DIMS, 0, 100)!
    expect(r.y).toBe(50)
    expect(r.height).toBe(40) // 50 down to plot bottom (y=90)
  })
  it('returns null when both bounds are null', () => {
    expect(refBandRect(null, null, DIMS, 0, 100)).toBeNull()
  })
})

describe('eventLinesX', () => {
  it('keeps in-range dates and drops out-of-range', () => {
    expect(eventLinesX([50, 150], DIMS, 0, 100, )).toEqual([50])
  })
})

describe('niceTicks', () => {
  it('returns ascending ticks covering the domain', () => {
    const ticks = niceTicks(0, 10, 5)
    expect(ticks[0]).toBeLessThanOrEqual(0)
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(10)
    for (let i = 1; i < ticks.length; i++) expect(ticks[i]).toBeGreaterThan(ticks[i - 1])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- labChart`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/labChart.ts`:

```ts
export interface ChartDims {
  width: number; height: number
  padL: number; padR: number; padT: number; padB: number
}
export interface ChartPoint { t: number; v: number }

const plotLeft = (d: ChartDims) => d.padL
const plotRight = (d: ChartDims) => d.width - d.padR
const plotTop = (d: ChartDims) => d.padT
const plotBottom = (d: ChartDims) => d.height - d.padB

function yFor(v: number, d: ChartDims, yMin: number, yMax: number): number {
  const span = yMax - yMin || 1
  return plotBottom(d) - ((v - yMin) / span) * (plotBottom(d) - plotTop(d))
}
function xFor(t: number, d: ChartDims, tMin: number, tMax: number): number {
  const span = tMax - tMin || 1
  return plotLeft(d) + ((t - tMin) / span) * (plotRight(d) - plotLeft(d))
}

export function computeYDomain(values: number[], refMin: number | null, refMax: number | null) {
  const all = [...values]
  if (refMin != null) all.push(refMin)
  if (refMax != null) all.push(refMax)
  let lo = Math.min(...all)
  let hi = Math.max(...all)
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = 0; hi = 1 }
  if (lo === hi) { lo -= 1; hi += 1 }
  const pad = (hi - lo) * 0.1
  return { yMin: lo - pad, yMax: hi + pad }
}

export function scalePoints(
  pts: ChartPoint[], d: ChartDims, tMin: number, tMax: number, yMin: number, yMax: number,
): { x: number; y: number }[] {
  return pts.map(p => ({ x: xFor(p.t, d, tMin, tMax), y: yFor(p.v, d, yMin, yMax) }))
}

export function refBandRect(
  refMin: number | null, refMax: number | null, d: ChartDims, yMin: number, yMax: number,
): { x: number; y: number; width: number; height: number } | null {
  if (refMin == null && refMax == null) return null
  const yHi = refMax != null ? yFor(refMax, d, yMin, yMax) : plotTop(d)
  const yLo = refMin != null ? yFor(refMin, d, yMin, yMax) : plotBottom(d)
  return {
    x: plotLeft(d),
    y: yHi,
    width: plotRight(d) - plotLeft(d),
    height: yLo - yHi,
  }
}

export function eventLinesX(dates: number[], d: ChartDims, tMin: number, tMax: number): number[] {
  return dates.filter(t => t >= tMin && t <= tMax).map(t => xFor(t, d, tMin, tMax))
}

export function niceTicks(yMin: number, yMax: number, count = 5): number[] {
  const span = yMax - yMin || 1
  const rawStep = span / Math.max(1, count)
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const norm = rawStep / mag
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag
  const start = Math.floor(yMin / step) * step
  const ticks: number[] = []
  for (let v = start; v <= yMax + step * 0.5; v += step) ticks.push(Number(v.toFixed(6)))
  return ticks
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- labChart`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/labChart.ts src/lib/labChart.test.ts
git commit -m "feat: lab chart geometry helpers (labChart)"
```

---

### Task 4: Sessions/results data layer (`lab.ts`)

**Files:**
- Create: `src/lib/lab.ts`

**Interfaces:**
- Consumes: `supabase` from `./supabase`; `ParsedSession` from `./labParse`.
- Produces:
  - `interface LabResult { id: string; session_id: string; analyte: string; result_raw: string; result_num: number | null; unit: string | null; ref: string | null; ref_min: number | null; ref_max: number | null; verdict: string | null }`
  - `interface LabSession { id: string; sample_id: string; material: string | null; taken_at: string; created_at: string; results: LabResult[] }`
  - `fetchSessions(): Promise<LabSession[]>` — newest `taken_at` first, each with nested `results`.
  - `fetchSampleIds(): Promise<string[]>` — existing sample ids (for dedup).
  - `saveSession(s: ParsedSession): Promise<void>` — insert session + its results; throws on duplicate `sample_id` (code `23505`) with a friendly message.
  - `deleteSession(id: string): Promise<void>`.

- [ ] **Step 1: Write the implementation**

Create `src/lib/lab.ts`:

```ts
import { supabase } from './supabase'
import type { ParsedSession } from './labParse'

export interface LabResult {
  id: string
  session_id: string
  analyte: string
  result_raw: string
  result_num: number | null
  unit: string | null
  ref: string | null
  ref_min: number | null
  ref_max: number | null
  verdict: string | null
}

export interface LabSession {
  id: string
  sample_id: string
  material: string | null
  taken_at: string
  created_at: string
  results: LabResult[]
}

export async function fetchSessions(): Promise<LabSession[]> {
  const { data, error } = await supabase
    .from('lab_sessions')
    .select('*, results:lab_results(*)')
    .order('taken_at', { ascending: false })
  if (error) throw error
  return (data as LabSession[]).map(s => ({ ...s, results: s.results ?? [] }))
}

export async function fetchSampleIds(): Promise<string[]> {
  const { data, error } = await supabase.from('lab_sessions').select('sample_id')
  if (error) throw error
  return (data as { sample_id: string }[]).map(r => r.sample_id)
}

export async function saveSession(s: ParsedSession): Promise<void> {
  const { data, error } = await supabase
    .from('lab_sessions')
    .insert({ sample_id: s.sample_id, material: s.material, taken_at: s.taken_at })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') throw new Error(`Sample ${s.sample_id} is already saved.`)
    throw error
  }
  const sessionId = (data as { id: string }).id
  if (s.results.length) {
    const rows = s.results.map(r => ({ ...r, session_id: sessionId }))
    const { error: rErr } = await supabase.from('lab_results').insert(rows)
    if (rErr) {
      // Roll back the orphan session so a retry can re-insert cleanly.
      await supabase.from('lab_sessions').delete().eq('id', sessionId)
      throw rErr
    }
  }
}

export async function deleteSession(id: string): Promise<void> {
  const { error } = await supabase.from('lab_sessions').delete().eq('id', id)
  if (error) throw error
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: PASS (tsc + vite, no type errors).

- [ ] **Step 3: Commit**

```bash
git add src/lib/lab.ts
git commit -m "feat: lab sessions/results data layer (lab.ts)"
```

---

### Task 5: Description CSV round-trip (`labDescriptionsCsv.ts`)

**Files:**
- Create: `src/lib/labDescriptionsCsv.ts`
- Test: `src/lib/labDescriptionsCsv.test.ts`

**Interfaces:**
- Consumes: `toCsv` from `./nutritionCsv`; a minimal CSV row parser (implemented locally to avoid coupling to nutrition internals).
- Produces:
  - `interface DescRow { analyte: string; description: string }`
  - `descriptionsToCsv(rows: DescRow[]): string` — headers `analyte,description`.
  - `parseDescRows(cells: string[][]): DescRow[]` — drops a header row whose first cell is `analyte`.
  - `interface DescSyncPlan { upserts: DescRow[]; deletes: string[] }`
  - `computeDescPlan(fileRows: DescRow[], dbAnalytes: string[], mode: 'sync' | 'add'): DescSyncPlan` — keyed on `analyte`. `add` mode never deletes; `sync` mode deletes DB analytes absent from the file.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/labDescriptionsCsv.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { descriptionsToCsv, parseDescRows, computeDescPlan } from './labDescriptionsCsv'

describe('descriptionsToCsv', () => {
  it('writes a header then rows, quoting commas', () => {
    const csv = descriptionsToCsv([{ analyte: 'IgE', description: 'total, serum' }])
    expect(csv).toBe('analyte,description\r\n"IgE","total, serum"\r\n'.replace('"IgE"', 'IgE'))
  })
})

describe('parseDescRows', () => {
  it('drops the header and trims', () => {
    const rows = parseDescRows([['analyte', 'description'], [' IgE ', ' total ']])
    expect(rows).toEqual([{ analyte: 'IgE', description: 'total' }])
  })
})

describe('computeDescPlan', () => {
  it('sync mode: upserts file rows, deletes DB analytes absent from file', () => {
    const plan = computeDescPlan(
      [{ analyte: 'IgE', description: 'a' }],
      ['IgE', 'CRP'],
      'sync',
    )
    expect(plan.upserts).toEqual([{ analyte: 'IgE', description: 'a' }])
    expect(plan.deletes).toEqual(['CRP'])
  })
  it('add mode: never deletes', () => {
    const plan = computeDescPlan([{ analyte: 'IgE', description: 'a' }], ['CRP'], 'add')
    expect(plan.upserts).toEqual([{ analyte: 'IgE', description: 'a' }])
    expect(plan.deletes).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- labDescriptionsCsv`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/labDescriptionsCsv.ts`:

```ts
import { toCsv } from './nutritionCsv'

export interface DescRow { analyte: string; description: string }

export function descriptionsToCsv(rows: DescRow[]): string {
  return toCsv(['analyte', 'description'], rows.map(r => [r.analyte, r.description ?? '']))
}

export function parseDescRows(cells: string[][]): DescRow[] {
  const rows = cells.length && cells[0][0]?.trim().toLowerCase() === 'analyte'
    ? cells.slice(1) : cells
  return rows
    .map(r => ({ analyte: (r[0] ?? '').trim(), description: (r[1] ?? '').trim() }))
    .filter(r => r.analyte)
}

export interface DescSyncPlan { upserts: DescRow[]; deletes: string[] }

export function computeDescPlan(
  fileRows: DescRow[], dbAnalytes: string[], mode: 'sync' | 'add',
): DescSyncPlan {
  const upserts = fileRows
  if (mode === 'add') return { upserts, deletes: [] }
  const fileSet = new Set(fileRows.map(r => r.analyte))
  const deletes = dbAnalytes.filter(a => !fileSet.has(a))
  return { upserts, deletes }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- labDescriptionsCsv`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/labDescriptionsCsv.ts src/lib/labDescriptionsCsv.test.ts
git commit -m "feat: analyte description CSV round-trip (labDescriptionsCsv)"
```

---

### Task 6: Descriptions data layer + hook

**Files:**
- Create: `src/lib/labDescriptions.ts`
- Create: `src/lib/useLabDescriptions.ts`

**Interfaces:**
- Consumes: `supabase`; `DescRow`, `DescSyncPlan` from `./labDescriptionsCsv`.
- Produces:
  - `interface AnalyteDescription { analyte: string; description: string | null }`
  - `fetchDescriptions(): Promise<AnalyteDescription[]>`
  - `upsertDescription(analyte: string, description: string): Promise<void>` (uses `.upsert(..., { onConflict: 'analyte' })` — relies on the `update` grant)
  - `deleteDescription(analyte: string): Promise<void>`
  - `applyDescPlan(plan: DescSyncPlan): Promise<void>` (upserts all rows, deletes listed analytes)
  - `useLabDescriptions(): { descriptions: AnalyteDescription[]; loading: boolean; reload: () => Promise<void> }`

- [ ] **Step 1: Write the data layer**

Create `src/lib/labDescriptions.ts`:

```ts
import { supabase } from './supabase'
import type { DescRow, DescSyncPlan } from './labDescriptionsCsv'

export interface AnalyteDescription { analyte: string; description: string | null }

export async function fetchDescriptions(): Promise<AnalyteDescription[]> {
  const { data, error } = await supabase
    .from('lab_analyte_descriptions')
    .select('*')
    .order('analyte')
  if (error) throw error
  return data as AnalyteDescription[]
}

export async function upsertDescription(analyte: string, description: string): Promise<void> {
  const a = analyte.trim()
  if (!a) throw new Error('Analyte name cannot be empty')
  const { error } = await supabase
    .from('lab_analyte_descriptions')
    .upsert({ analyte: a, description }, { onConflict: 'analyte' })
  if (error) throw error
}

export async function deleteDescription(analyte: string): Promise<void> {
  const { error } = await supabase.from('lab_analyte_descriptions').delete().eq('analyte', analyte)
  if (error) throw error
}

export async function applyDescPlan(plan: DescSyncPlan): Promise<void> {
  if (plan.upserts.length) {
    const rows: DescRow[] = plan.upserts
    const { error } = await supabase
      .from('lab_analyte_descriptions')
      .upsert(rows, { onConflict: 'analyte' })
    if (error) throw error
  }
  for (const analyte of plan.deletes) await deleteDescription(analyte)
}
```

- [ ] **Step 2: Write the hook**

Create `src/lib/useLabDescriptions.ts` (mirrors `useUnits.ts`):

```ts
import { useEffect, useState } from 'react'
import { fetchDescriptions, type AnalyteDescription } from './labDescriptions'

let cache: AnalyteDescription[] | null = null
let inflight: Promise<AnalyteDescription[]> | null = null
const listeners = new Set<(d: AnalyteDescription[]) => void>()

async function load(force = false): Promise<AnalyteDescription[]> {
  if (cache && !force) return cache
  if (!inflight || force) {
    inflight = fetchDescriptions().then(d => {
      cache = d
      inflight = null
      listeners.forEach(fn => fn(d))
      return d
    }).catch(err => { inflight = null; throw err })
  }
  return inflight
}

export function useLabDescriptions(): {
  descriptions: AnalyteDescription[]; loading: boolean; reload: () => Promise<void>
} {
  const [descriptions, setDescriptions] = useState<AnalyteDescription[]>(cache ?? [])
  const [loading, setLoading] = useState(cache === null)

  useEffect(() => {
    const listener = (d: AnalyteDescription[]) => setDescriptions(d)
    listeners.add(listener)
    load().then(() => setLoading(false)).catch(() => setLoading(false))
    return () => { listeners.delete(listener) }
  }, [])

  async function reload() { await load(true) }
  return { descriptions, loading, reload }
}
```

- [ ] **Step 3: Verify it builds**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/labDescriptions.ts src/lib/useLabDescriptions.ts
git commit -m "feat: analyte descriptions data layer + hook"
```

---

### Task 7: Events data layer

**Files:**
- Create: `src/lib/labEvents.ts`

**Interfaces:**
- Consumes: `supabase`.
- Produces:
  - `interface LabEvent { id: string; name: string; event_date: string; color: string | null }`
  - `fetchEvents(): Promise<LabEvent[]>` (ordered by `event_date`)
  - `addEvent(name: string, eventDate: string, color: string | null): Promise<LabEvent>`
  - `updateEvent(id: string, patch: { name?: string; event_date?: string; color?: string | null }): Promise<void>` (relies on `update` grant)
  - `deleteEvent(id: string): Promise<void>`

- [ ] **Step 1: Write the implementation**

Create `src/lib/labEvents.ts`:

```ts
import { supabase } from './supabase'

export interface LabEvent {
  id: string
  name: string
  event_date: string // YYYY-MM-DD
  color: string | null
}

export async function fetchEvents(): Promise<LabEvent[]> {
  const { data, error } = await supabase
    .from('lab_events')
    .select('*')
    .order('event_date')
  if (error) throw error
  return data as LabEvent[]
}

export async function addEvent(name: string, eventDate: string, color: string | null): Promise<LabEvent> {
  const clean = name.trim()
  if (!clean) throw new Error('Event name cannot be empty')
  const { data, error } = await supabase
    .from('lab_events')
    .insert({ name: clean, event_date: eventDate, color })
    .select()
    .single()
  if (error) throw error
  return data as LabEvent
}

export async function updateEvent(
  id: string, patch: { name?: string; event_date?: string; color?: string | null },
): Promise<void> {
  const { error } = await supabase.from('lab_events').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteEvent(id: string): Promise<void> {
  const { error } = await supabase.from('lab_events').delete().eq('id', id)
  if (error) throw error
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/labEvents.ts
git commit -m "feat: lab events data layer (labEvents)"
```

---

### Task 8: Import modal component

**Files:**
- Create: `src/pages/tests/ImportModal.tsx`
- Create: `src/pages/tests/ImportModal.module.css`

**Interfaces:**
- Consumes: `parseSession`, `ParsedSession` from `../../lib/labParse`; `saveSession`, `fetchSampleIds` from `../../lib/lab`.
- Produces: `export default function ImportModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void })`. Called by `Tests.tsx`. On **Done** it saves all queued non-duplicate sessions, calls `onSaved()` (which reloads + closes).

- [ ] **Step 1: Write the component**

Create `src/pages/tests/ImportModal.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { parseSession, type ParsedSession } from '../../lib/labParse'
import { saveSession, fetchSampleIds } from '../../lib/lab'
import styles from './ImportModal.module.css'

interface Entry {
  session?: ParsedSession
  label: string
  status: 'ok' | 'dup' | 'error'
}

export default function ImportModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState('')
  const [entries, setEntries] = useState<Entry[]>([])
  const [knownIds, setKnownIds] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchSampleIds().then(ids => setKnownIds(new Set(ids))).catch(() => setKnownIds(new Set()))
  }, [])

  function queued(): Set<string> {
    return new Set(entries.filter(e => e.session).map(e => e.session!.sample_id))
  }

  function addPaste() {
    if (!text.trim()) return
    try {
      const session = parseSession(text)
      const date = new Date(session.taken_at).toLocaleString()
      const isDup = knownIds.has(session.sample_id) || queued().has(session.sample_id)
      setEntries(prev => [
        ...prev,
        {
          session: isDup ? undefined : session,
          label: `${date} · ${session.material ?? '—'} · ${session.results.length} analytes${isDup ? ' (already saved — skipped)' : ''}`,
          status: isDup ? 'dup' : 'ok',
        },
      ])
    } catch (e: any) {
      setEntries(prev => [...prev, { label: e?.message ?? 'Could not parse paste', status: 'error' }])
    }
    setText('')
  }

  async function done() {
    const toSave = entries.filter(e => e.session).map(e => e.session!)
    if (!toSave.length) { onClose(); return }
    setSaving(true)
    setError(null)
    const failures: string[] = []
    for (const s of toSave) {
      try { await saveSession(s) } catch (e: any) { failures.push(`${s.sample_id}: ${e?.message ?? 'save failed'}`) }
    }
    setSaving(false)
    if (failures.length) { setError(failures.join('; ')); return }
    onSaved()
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Import lab results</h2>
          <button className={styles.close} onClick={onClose} aria-label="Close">×</button>
        </div>
        <p className={styles.hint}>Paste one sample's results from the portal, then Add. Repeat for more samples.</p>
        <textarea
          className={styles.paste}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Paste here…"
          rows={8}
        />
        <div className={styles.actions}>
          <button className={styles.add} onClick={addPaste} disabled={!text.trim()}>Add paste</button>
        </div>
        <ul className={styles.log}>
          {entries.map((e, i) => (
            <li key={i} className={styles[e.status]}>{e.label}</li>
          ))}
        </ul>
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.footer}>
          <button className={styles.doneBtn} onClick={done} disabled={saving}>
            {saving ? 'Saving…' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write the styles**

Create `src/pages/tests/ImportModal.module.css`:

```css
.backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center; z-index: 50; padding: 16px;
}
.modal {
  background: var(--card); color: var(--ink); border: 1px solid var(--border);
  border-radius: 12px; padding: 16px; width: min(100%, 640px); max-height: 90vh;
  overflow-y: auto; display: flex; flex-direction: column; gap: 10px;
}
.header { display: flex; align-items: center; justify-content: space-between; }
.close { background: none; border: none; color: var(--ink2); font-size: 22px; cursor: pointer; }
.hint { color: var(--ink2); font-size: 13px; margin: 0; }
.paste { width: 100%; box-sizing: border-box; font-family: monospace; font-size: 12px;
  background: var(--bg); color: var(--ink); border: 1px solid var(--border); border-radius: 8px; padding: 8px; }
.actions { display: flex; justify-content: flex-end; }
.add, .doneBtn { background: var(--accent); color: #fff; border: none; border-radius: 8px;
  padding: 8px 14px; cursor: pointer; }
.add:disabled, .doneBtn:disabled { opacity: 0.5; cursor: default; }
.log { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px;
  font-size: 13px; max-height: 200px; overflow-y: auto; }
.log li { padding: 6px 8px; border-radius: 6px; border: 1px solid var(--border); }
.ok { border-left: 3px solid var(--accent); }
.dup { color: var(--ink2); }
.error { color: var(--red); }
.footer { display: flex; justify-content: flex-end; }
```

- [ ] **Step 3: Verify it builds**

Run: `npm run build`
Expected: PASS. (`ImportModal` is not yet mounted; Task 10 wires it into `Tests.tsx`.)

- [ ] **Step 4: Commit**

```bash
git add src/pages/tests/ImportModal.tsx src/pages/tests/ImportModal.module.css
git commit -m "feat: lab import modal (paste + feedback log)"
```

---

### Task 9: Table & Graph view components

**Files:**
- Create: `src/pages/tests/TableView.tsx`
- Create: `src/pages/tests/GraphView.tsx`
- Create: `src/pages/tests/views.module.css`

**Interfaces:**
- Consumes: `LabSession`, `LabResult` from `../../lib/lab`; `LabEvent` from `../../lib/labEvents`; `AnalyteDescription` from `../../lib/labDescriptions`; `computeYDomain`, `scalePoints`, `refBandRect`, `eventLinesX` from `../../lib/labChart`.
- Produces:
  - `export function TableView({ sessions, descriptions }: { sessions: LabSession[]; descriptions: AnalyteDescription[] })`
  - `export function GraphView({ sessions, events, descriptions }: { sessions: LabSession[]; events: LabEvent[]; descriptions: AnalyteDescription[] })`

- [ ] **Step 1: Write the shared helper + TableView**

Create `src/pages/tests/TableView.tsx`:

```tsx
import type { LabSession } from '../../lib/lab'
import type { AnalyteDescription } from '../../lib/labDescriptions'
import styles from './views.module.css'

function outOfRange(num: number | null, min: number | null, max: number | null): boolean {
  if (num == null) return false
  if (min != null && num < min) return true
  if (max != null && num > max) return true
  return false
}

export function TableView(
  { sessions, descriptions }: { sessions: LabSession[]; descriptions: AnalyteDescription[] },
) {
  // Analyte rows in first-seen order across all sessions (newest-first).
  const analytes: string[] = []
  const seen = new Set<string>()
  for (const s of sessions) for (const r of s.results) {
    if (!seen.has(r.analyte)) { seen.add(r.analyte); analytes.push(r.analyte) }
  }
  const descOf = (a: string) => descriptions.find(d => d.analyte === a)?.description ?? ''

  if (!sessions.length) return <p className={styles.empty}>No lab results yet.</p>

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.analyteCol}>Analyte</th>
            {sessions.map(s => (
              <th key={s.id}>{new Date(s.taken_at).toLocaleDateString()}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {analytes.map(a => (
            <tr key={a}>
              <td className={styles.analyteCol} title={descOf(a)}>{a}</td>
              {sessions.map(s => {
                const r = s.results.find(x => x.analyte === a)
                if (!r) return <td key={s.id} className={styles.blank}>—</td>
                const bad = outOfRange(r.result_num, r.ref_min, r.ref_max)
                return (
                  <td key={s.id} className={bad ? styles.bad : ''} title={`${r.ref ?? ''}${r.verdict ? ` · ${r.verdict}` : ''}`}>
                    {r.result_raw}{r.unit ? ` ${r.unit}` : ''}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Write GraphView**

Create `src/pages/tests/GraphView.tsx`:

```tsx
import type { LabSession } from '../../lib/lab'
import type { LabEvent } from '../../lib/labEvents'
import type { AnalyteDescription } from '../../lib/labDescriptions'
import { computeYDomain, scalePoints, refBandRect, eventLinesX, type ChartDims } from '../../lib/labChart'
import styles from './views.module.css'

const DIMS: ChartDims = { width: 320, height: 180, padL: 34, padR: 12, padT: 12, padB: 24 }

interface AnalyteSeries {
  analyte: string
  numeric: { t: number; v: number; raw: string; bad: boolean }[]
  qualitative: { t: number; verdict: string | null; raw: string }[]
  refMin: number | null
  refMax: number | null
}

function buildSeries(sessions: LabSession[]): AnalyteSeries[] {
  const map = new Map<string, AnalyteSeries>()
  // Oldest-first so the line reads left→right in time.
  const ordered = [...sessions].sort((a, b) => a.taken_at.localeCompare(b.taken_at))
  for (const s of ordered) {
    const t = new Date(s.taken_at).getTime()
    for (const r of s.results) {
      let ser = map.get(r.analyte)
      if (!ser) {
        ser = { analyte: r.analyte, numeric: [], qualitative: [], refMin: r.ref_min, refMax: r.ref_max }
        map.set(r.analyte, ser)
      }
      if (ser.refMin == null) ser.refMin = r.ref_min
      if (ser.refMax == null) ser.refMax = r.ref_max
      if (r.result_num != null) {
        const bad = (r.ref_min != null && r.result_num < r.ref_min) || (r.ref_max != null && r.result_num > r.ref_max)
        ser.numeric.push({ t, v: r.result_num, raw: r.result_raw, bad })
      } else {
        ser.qualitative.push({ t, verdict: r.verdict, raw: r.result_raw })
      }
    }
  }
  return [...map.values()]
}

export function GraphView(
  { sessions, events, descriptions }: { sessions: LabSession[]; events: LabEvent[]; descriptions: AnalyteDescription[] },
) {
  const series = buildSeries(sessions)
  if (!series.length) return <p className={styles.empty}>No lab results yet.</p>
  const descOf = (a: string) => descriptions.find(d => d.analyte === a)?.description ?? ''
  const eventTimes = events.map(e => new Date(`${e.event_date}T00:00:00`).getTime())

  return (
    <div className={styles.charts}>
      {series.map(ser => {
        const numeric = ser.numeric
        if (numeric.length === 0) {
          // Purely qualitative → verdict-dot strip.
          return (
            <div key={ser.analyte} className={styles.chartCard}>
              <div className={styles.chartTitle} title={descOf(ser.analyte)}>{ser.analyte}</div>
              <div className={styles.strip}>
                {ser.qualitative.map((q, i) => (
                  <span key={i} className={styles.verdictDot} title={`${new Date(q.t).toLocaleDateString()} · ${q.raw}${q.verdict ? ` · ${q.verdict}` : ''}`}>
                    {q.verdict ?? q.raw}
                  </span>
                ))}
              </div>
            </div>
          )
        }
        const times = numeric.map(p => p.t)
        const tMin = Math.min(...times), tMax = Math.max(...times)
        const { yMin, yMax } = computeYDomain(numeric.map(p => p.v), ser.refMin, ser.refMax)
        const pts = scalePoints(numeric.map(p => ({ t: p.t, v: p.v })), DIMS, tMin, tMax, yMin, yMax)
        const band = refBandRect(ser.refMin, ser.refMax, DIMS, yMin, yMax)
        const evX = eventLinesX(eventTimes, DIMS, tMin, tMax)
        const polyline = pts.map(p => `${p.x},${p.y}`).join(' ')
        return (
          <div key={ser.analyte} className={styles.chartCard}>
            <div className={styles.chartTitle} title={descOf(ser.analyte)}>{ser.analyte}</div>
            <svg viewBox={`0 0 ${DIMS.width} ${DIMS.height}`} className={styles.svg} role="img" aria-label={`${ser.analyte} trend`}>
              {band && <rect x={band.x} y={band.y} width={band.width} height={band.height} className={styles.band} />}
              {evX.map((x, i) => <line key={i} x1={x} y1={DIMS.padT} x2={x} y2={DIMS.height - DIMS.padB} className={styles.eventLine} />)}
              {pts.length > 1 && <polyline points={polyline} className={styles.line} />}
              {pts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={3} className={numeric[i].bad ? styles.dotBad : styles.dot}>
                  <title>{`${new Date(numeric[i].t).toLocaleDateString()} · ${numeric[i].raw}`}</title>
                </circle>
              ))}
            </svg>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Write the styles**

Create `src/pages/tests/views.module.css`:

```css
.empty { color: var(--ink2); text-align: center; padding: 32px 0; }

.tableWrap { overflow-x: auto; }
.table { border-collapse: collapse; font-size: 13px; width: 100%; }
.table th, .table td { border: 1px solid var(--border); padding: 6px 10px; text-align: center; white-space: nowrap; }
.table th { background: var(--bg); position: sticky; top: 0; }
.analyteCol { text-align: left !important; position: sticky; left: 0; background: var(--card); z-index: 1; }
.blank { color: var(--ink2); }
.bad { background: color-mix(in srgb, var(--red) 22%, transparent); color: var(--ink); font-weight: 600; }

.charts { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
.chartCard { border: 1px solid var(--border); border-radius: 10px; padding: 10px; background: var(--card); }
.chartTitle { font-size: 13px; font-weight: 600; margin-bottom: 6px; }
.svg { width: 100%; height: auto; display: block; }
.band { fill: color-mix(in srgb, var(--accent) 12%, transparent); }
.eventLine { stroke: var(--ink2); stroke-width: 1; stroke-dasharray: 3 3; }
.line { fill: none; stroke: var(--accent); stroke-width: 1.5; }
.dot { fill: var(--accent); stroke: var(--card); stroke-width: 1; }
.dotBad { fill: var(--red); stroke: var(--card); stroke-width: 1; }
.strip { display: flex; flex-wrap: wrap; gap: 6px; }
.verdictDot { font-size: 12px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--border); color: var(--ink2); }
```

- [ ] **Step 4: Verify it builds**

Run: `npm run build`
Expected: PASS. (Views not yet mounted; Task 10 wires them in.)

- [ ] **Step 5: Commit**

```bash
git add src/pages/tests/TableView.tsx src/pages/tests/GraphView.tsx src/pages/tests/views.module.css
git commit -m "feat: lab table + graph view components"
```

---

### Task 10: Rebuild `Tests.tsx` shell (toggle + wiring)

**Files:**
- Modify (full rewrite): `src/pages/Tests.tsx`
- Modify (full rewrite): `src/pages/Tests.module.css`

**Interfaces:**
- Consumes: `fetchSessions`, `LabSession` from `../lib/lab`; `fetchEvents`, `LabEvent` from `../lib/labEvents`; `useLabDescriptions` from `../lib/useLabDescriptions`; `ImportModal` from `./tests/ImportModal`; `TableView`, `GraphView` from `./tests/TableView` / `./tests/GraphView`.
- Produces: default-export `Tests` page. Route `/tests` already exists in `App.tsx` (no change).

- [ ] **Step 1: Rewrite the page**

Replace the entire contents of `src/pages/Tests.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react'
import { fetchSessions, type LabSession } from '../lib/lab'
import { fetchEvents, type LabEvent } from '../lib/labEvents'
import { useLabDescriptions } from '../lib/useLabDescriptions'
import ImportModal from './tests/ImportModal'
import { TableView } from './tests/TableView'
import { GraphView } from './tests/GraphView'
import styles from './Tests.module.css'

type View = 'graph' | 'table'

export default function Tests() {
  const [sessions, setSessions] = useState<LabSession[]>([])
  const [events, setEvents] = useState<LabEvent[]>([])
  const [view, setView] = useState<View>('graph')
  const [importing, setImporting] = useState(false)
  const { descriptions } = useLabDescriptions()

  const reload = useCallback(async () => {
    try { setSessions(await fetchSessions()) } catch (e) { console.warn('fetchSessions failed', e); setSessions([]) }
    try { setEvents(await fetchEvents()) } catch (e) { console.warn('fetchEvents failed', e); setEvents([]) }
  }, [])

  useEffect(() => { reload() }, [reload])

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <h1 className={styles.title}>Tests</h1>
        <div className={styles.toggle}>
          <button className={view === 'graph' ? styles.toggleActive : ''} onClick={() => setView('graph')}>Graph</button>
          <button className={view === 'table' ? styles.toggleActive : ''} onClick={() => setView('table')}>Table</button>
        </div>
        <button className={styles.importBtn} onClick={() => setImporting(true)}>Import</button>
      </div>

      {view === 'graph'
        ? <GraphView sessions={sessions} events={events} descriptions={descriptions} />
        : <TableView sessions={sessions} descriptions={descriptions} />}

      {importing && (
        <ImportModal
          onClose={() => setImporting(false)}
          onSaved={() => { setImporting(false); reload() }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Rewrite the page styles**

Replace the entire contents of `src/pages/Tests.module.css` (keeps the Nutrition wide-breakout pattern):

```css
.page {
  position: fixed;
  left: 0; right: 0;
  top: var(--header-h); bottom: var(--nav-h);
  width: min(100vw, 1290px);
  margin: 0 auto;
  padding: 12px 16px;
  overflow-y: auto;
  box-sizing: border-box;
}
.topbar { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.title { font-size: 20px; margin: 0; }
.toggle { display: flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.toggle button { background: var(--card); color: var(--ink2); border: none; padding: 6px 14px; cursor: pointer; }
.toggleActive { background: var(--accent) !important; color: #fff !important; }
.importBtn { margin-left: auto; background: var(--accent); color: #fff; border: none; border-radius: 8px; padding: 6px 16px; cursor: pointer; }
```

> **Note:** `--header-h` / `--nav-h` are the existing CSS vars the current `Tests.module.css` (and Nutrition) use for the fixed breakout — keep using them so the page aligns with Header/BottomNav.

- [ ] **Step 3: Verify it builds**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Manual smoke check**

Run: `npm run dev`, open `/tests`. With the migration applied and a real paste, confirm: Import modal opens, a paste appends a log row, Done saves, Graph/Table toggle renders. (Best-effort fetch means empty views before any data — not an error.)

- [ ] **Step 5: Commit**

```bash
git add src/pages/Tests.tsx src/pages/Tests.module.css
git commit -m "feat: rebuild /tests as lab tracker (toggle + import + views)"
```

---

### Task 11: Settings — descriptions & events sections

**Files:**
- Modify: `src/pages/Settings.tsx`
- Modify: `src/pages/Settings.module.css` (add styles for the new controls if missing)

**Interfaces:**
- Consumes: `useLabDescriptions` + `upsertDescription`/`deleteDescription`/`applyDescPlan` from labDescriptions; `descriptionsToCsv`/`parseDescRows`/`computeDescPlan` from labDescriptionsCsv; descriptions DB analytes come from the hook; `fetchEvents`/`addEvent`/`updateEvent`/`deleteEvent` from labEvents; `PALETTE` from `../lib/foodTypeColors`; `parseCsv` from `../lib/nutrition` (already exported — `nutrition.ts:34` — the delimiter-sniffing, BOM-stripping CSV cell parser).
- Produces: two new sections mounted in the `Settings` component.

- [ ] **Step 1: Add the descriptions section**

In `src/pages/Settings.tsx`, add imports at the top:

```tsx
import { useEffect, useRef } from 'react'
import { useLabDescriptions } from '../lib/useLabDescriptions'
import { upsertDescription, deleteDescription, applyDescPlan } from '../lib/labDescriptions'
import { descriptionsToCsv, parseDescRows, computeDescPlan } from '../lib/labDescriptionsCsv'
import { fetchEvents, addEvent, updateEvent, deleteEvent, type LabEvent } from '../lib/labEvents'
import { parseCsv } from '../lib/nutrition'
```

> `parseCsv` is already exported from `src/lib/nutrition.ts` (line 34) — no change to that file needed.

Mount both sections in the `Settings` component's returned JSX (after `FoodTypesSection`):

```tsx
      <LabDescriptionsSection />
      <LabEventsSection />
```

Add the section component (bottom of file):

```tsx
function LabDescriptionsSection() {
  const { descriptions, reload } = useLabDescriptions()
  const [analyte, setAnalyte] = useState('')
  const [desc, setDesc] = useState('')
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try { await upsertDescription(analyte, desc); setAnalyte(''); setDesc(''); await reload() }
    catch (err: any) { setError(err?.message ?? 'Could not save description.') }
  }
  async function handleDelete(a: string) {
    setError(null)
    try { await deleteDescription(a); await reload() }
    catch (err: any) { setError(err?.message ?? 'Could not delete.') }
  }
  function handleExport() {
    const csv = descriptionsToCsv(descriptions.map(d => ({ analyte: d.analyte, description: d.description ?? '' })))
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = 'analyte-descriptions.csv'; a.click()
    URL.revokeObjectURL(url)
  }
  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setError(null)
    try {
      const cells = parseCsv(await file.text())
      const plan = computeDescPlan(parseDescRows(cells), descriptions.map(d => d.analyte), 'sync')
      await applyDescPlan(plan)
      await reload()
    } catch (err: any) { setError(err?.message ?? 'Import failed.') }
  }

  return (
    <>
      <h2 className={styles.heading}>Analyte descriptions</h2>
      <p className={styles.hint}>What each analyte means. Shown in the Tests table &amp; charts. Edit here or via CSV.</p>
      <div className={styles.addRow}>
        <button className={styles.add} type="button" onClick={handleExport}>⬇ Export CSV</button>
        <button className={styles.add} type="button" onClick={() => fileRef.current?.click()}>⬆ Import CSV (sync)</button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={handleImport} />
      </div>
      <ul className={styles.list}>
        {descriptions.map(d => (
          <li key={d.analyte} className={styles.item}>
            <span><strong>{d.analyte}</strong> — {d.description}</span>
            <button className={styles.remove} onClick={() => handleDelete(d.analyte)} aria-label={`Delete ${d.analyte}`}>×</button>
          </li>
        ))}
      </ul>
      <form className={styles.addRow} onSubmit={handleAdd}>
        <input className={styles.input} value={analyte} onChange={e => setAnalyte(e.target.value)} placeholder="Analyte" />
        <input className={styles.input} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description" />
        <button className={styles.add} type="submit">Save</button>
      </form>
      {error && <p className={styles.error}>{error}</p>}
    </>
  )
}
```

- [ ] **Step 2: Add the events section**

Add at the bottom of `src/pages/Settings.tsx`:

```tsx
function LabEventsSection() {
  const [events, setEvents] = useState<LabEvent[]>([])
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [error, setError] = useState<string | null>(null)

  const reload = async () => {
    try { setEvents(await fetchEvents()) } catch { setEvents([]) }
  }
  useEffect(() => { reload() }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try { await addEvent(name, date, PALETTE[0]); setName(''); setDate(''); await reload() }
    catch (err: any) { setError(err?.message ?? 'Could not add event.') }
  }
  async function handleColor(id: string, color: string) {
    setError(null)
    try { await updateEvent(id, { color }); await reload() }
    catch (err: any) { setError(err?.message ?? 'Could not set color.') }
  }
  async function handleDelete(id: string) {
    setError(null)
    try { await deleteEvent(id); await reload() }
    catch (err: any) { setError(err?.message ?? 'Could not delete.') }
  }

  return (
    <>
      <h2 className={styles.heading}>Events</h2>
      <p className={styles.hint}>Drawn as vertical lines across the Tests trend charts.</p>
      <ul className={styles.list}>
        {events.map(ev => (
          <li key={ev.id} className={styles.item}>
            <span>{ev.event_date} — {ev.name}</span>
            <span className={styles.swatches}>
              {PALETTE.map(c => (
                <button key={c} type="button"
                  className={`${styles.swatch} ${ev.color === c ? styles.swatchActive : ''}`}
                  style={{ background: c }} onClick={() => handleColor(ev.id, c)}
                  aria-label={`Set ${ev.name} color ${c}`} />
              ))}
            </span>
            <button className={styles.remove} onClick={() => handleDelete(ev.id)} aria-label={`Delete ${ev.name}`}>×</button>
          </li>
        ))}
      </ul>
      <form className={styles.addRow} onSubmit={handleAdd}>
        <input className={styles.input} value={name} onChange={e => setName(e.target.value)} placeholder="Event name" />
        <input className={styles.input} type="date" value={date} onChange={e => setDate(e.target.value)} required />
        <button className={styles.add} type="submit">Add</button>
      </form>
      {error && <p className={styles.error}>{error}</p>}
    </>
  )
}
```

- [ ] **Step 3: Verify it builds**

Run: `npm run build`
Expected: PASS. If `parseCsv` wasn't exported, export it and rebuild.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Settings.tsx src/pages/Settings.module.css
git commit -m "feat: settings sections for analyte descriptions + events"
```

---

### Task 12: Remove the screenshot feature

**Files:**
- Delete: `src/lib/testScreenshots.ts`
- Delete: `src/lib/testScreenshots.test.ts`

**Interfaces:**
- Consumes: nothing. Verifies no remaining imports of `testScreenshots` exist.

- [ ] **Step 1: Confirm no remaining references**

Run: `grep -rn "testScreenshots" src/` (or ripgrep). Expected: no matches other than the two files being deleted. (`Tests.tsx` no longer imports it after Task 10.)

- [ ] **Step 2: Delete the files**

```bash
git rm src/lib/testScreenshots.ts src/lib/testScreenshots.test.ts
```

- [ ] **Step 3: Verify build + full test suite**

Run: `npm run build && npm test`
Expected: build PASS; all tests PASS (previous suite minus the removed `testScreenshots` tests, plus the new `labParse` / `labChart` / `labDescriptionsCsv` tests).

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: remove screenshot stash from /tests (superseded by lab tracker)"
```

---

## Deploy (after all tasks merged)

1. Run `migrations/2026-07-18-lab-tracker.sql` in the Supabase SQL editor.
2. Redeploy the app.
3. *(Optional)* Drop the now-unused `test-screenshots` Storage bucket once old screenshots are no longer wanted (not force-deleted by the migration).

Until step 1, `/tests` renders but reads/writes fail best-effort (empty views, `console.warn`).

---

## Self-Review

**Spec coverage:**
- Data model (4 tables, ref_min/max, grants incl. update) → Task 1. ✓
- Paste parsing (metadata, tab rows, verdict lines, ref/result parsing) → Task 2. ✓
- Import modal (paste box + feedback log + dedup + Done-saves-all) → Task 8 + wiring Task 10. ✓
- Save path (session + results, 23505 dedup backstop, collect failures) → Task 4 (`saveSession`) + Task 8 (`done()` collects failures). ✓
- Table view (matrix, out-of-range tint, ref/verdict tooltip, description) → Task 9 `TableView`. ✓
- Graph view (per-analyte SVG, ref band, event lines, point color, verdict strip for qualitative) → Task 9 `GraphView` + Task 3 geometry. ✓
- Settings: descriptions (manual + CSV round-trip keyed on analyte) → Task 5/6 + Task 11. ✓
- Settings: events (name/date/color, swatch picker) → Task 7 + Task 11. ✓
- Remove screenshots → Task 12. ✓
- Deploy steps, best-effort fetch, RLS/grant constraints → Global Constraints + Task 1 + deploy section. ✓

**Placeholder scan:** No TBD/TODO; every code step has full code. The only conditional instruction (export `parseCsv` if not already exported) is explicit and bounded.

**Type consistency:** `ParsedSession`/`ParsedResult` (Task 2) consumed by `saveSession` (Task 4) and `ImportModal` (Task 8). `LabSession`/`LabResult` (Task 4) consumed by both views (Task 9) and the page (Task 10). `LabEvent` (Task 7) consumed by `GraphView` (Task 9), page (Task 10), Settings (Task 11). `AnalyteDescription` (Task 6) consumed by views (Task 9) + page (Task 10). `DescRow`/`DescSyncPlan` (Task 5) consumed by `applyDescPlan` (Task 6) + Settings (Task 11). `ChartDims`/`ChartPoint` and the geometry fns (Task 3) consumed by `GraphView` (Task 9). Names align across tasks. ✓
