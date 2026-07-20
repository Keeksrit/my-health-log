# Lab Classification & Smarter Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the shipped `/tests` lab tracker so real portal exports parse cleanly (multi-session pastes, panels, notes, raw-text preservation), every analyte is auto-classified into one of seven categories, and charts are chosen from that classification — with censored (`>`/`<`) values plotted as literal glyphs on a time-series whose adjacent segments are dashed.

**Architecture:** Grow the existing pure-logic libs (`labParse`, `labChart`) and add two new pure libs (`labClassify`, `labAllergyScale`), each with colocated Vitest tests. Thin Supabase data layers (`lab`, `labDescriptions`) gain the new columns. The `/tests` `GraphView` becomes a classifier-driven renderer (allergy-scale / time-series / strip) and `ImportModal` handles multi-session pastes + dictionary seeding. A single additive, idempotent SQL migration adds the columns. Full design: `docs/superpowers/specs/2026-07-20-lab-classification-charts-design.md`.

**Tech Stack:** React 18 + TypeScript + Vite, `@supabase/supabase-js` v2 (schema `health`, singleton `src/lib/supabase.ts`), CSS Modules, Vitest (`vitest run`, node env, `src/**/*.test.ts`). Charts are hand-rolled inline SVG — no charting library.

## Global Constraints

- **No new runtime dependencies.** Charts stay hand-rolled SVG (design decision — do not add Recharts/Chart.js).
- **Pure logic lives in `src/lib/*.ts` with a colocated `*.test.ts`;** data-layer/UI is verified by `npm run build` (tsc + vite) — there is no React component test infra.
- **RLS-only single-user model.** New columns on insert-only tables (`lab_sessions`, `lab_results`) need no grant change. `lab_analyte_descriptions` already has `update` granted. No new tables, so no new policies.
- **Migrations are additive and idempotent** (`add column if not exists`), applied manually in the Supabase SQL editor at deploy time — never run by the app or tests.
- **All Supabase table access goes through the health-pinned singleton** `import { supabase } from './supabase'` (already defaults to schema `health`).
- **Data fetches on the page are best-effort:** a failure logs `console.warn` and renders empty, never throws to the user. New columns absent (migration not yet run) must degrade gracefully.
- **Unique-violation Postgres error code is `23505`** (duplicate `sample_id`).
- **`value_type`** is the string `'number' | 'binary'` (nullable = unclassified). No CHECK constraint; UI constrains via dropdowns.
- **Category slugs** (lowercase, exact): `allergy`, `hematology`, `infection`, `chemistry`, `liver-kidney`, `inflammation`, `vitamins`.
- **CAP-RAST allergy bands** are a code constant, never stored: `[0.35, 0.70, 3.5, 17.5, 50, 100]` → 7 classes (0–6).
- **Color-coded signals need a second, non-color cue** (DESIGN.md): the censored glyph shape and the allergy class-number label are those cues. Reserve Lora for headings; keep the cream canvas + single forest-green accent. CSS tokens in use: `--accent`, `--red`, `--ink`, `--ink2`, `--border`, `--card`, `--bg`.
- Commit after every task with a `feat:`/`refactor:`/`chore:` message. Co-author trailer is added by the harness.

---

### Task 1: Database migration

**Files:**
- Create: `migrations/2026-07-20-lab-classification.sql`

**Interfaces:**
- Produces: `raw_text` on `health.lab_sessions`; `panel`, `note` on `health.lab_results`; `category`, `value_type`, `material` on `health.lab_analyte_descriptions`. Every later data-layer task reads/writes these.

- [ ] **Step 1: Write the migration SQL**

Create `migrations/2026-07-20-lab-classification.sql`:

```sql
-- Lab classification & smarter charts: additive columns for the /tests tracker.
-- Run once in the Supabase SQL editor. Idempotent (ADD COLUMN IF NOT EXISTS).
-- Builds on migrations/2026-07-18-lab-tracker.sql.

-- Full pasted block per sample, so a bad parse never loses the original.
alter table health.lab_sessions
  add column if not exists raw_text text;

-- Group header above a row (e.g. "Hemogramm 5-osalise leukogrammiga") and the
-- lab caveat line "Tulemuse märkus:". "verdict" keeps "Tulemuse tõlgendus:".
alter table health.lab_results
  add column if not exists panel text;
alter table health.lab_results
  add column if not exists note text;

-- Analyte dictionary grows into a classification table. value_type is
-- 'number' | 'binary' (nullable = unclassified); kept free-text (no CHECK) to
-- avoid migration churn — the UI constrains input via dropdowns.
alter table health.lab_analyte_descriptions
  add column if not exists category text;
alter table health.lab_analyte_descriptions
  add column if not exists value_type text;
alter table health.lab_analyte_descriptions
  add column if not exists material text;

-- No grant/RLS change: lab_sessions & lab_results are insert-only (existing
-- grants cover the new columns); lab_analyte_descriptions already has UPDATE.
```

- [ ] **Step 2: Verify the SQL is well-formed**

Read the file back and confirm: every statement uses `add column if not exists`; one column on `lab_sessions` (`raw_text`), two on `lab_results` (`panel`, `note`), three on `lab_analyte_descriptions` (`category`, `value_type`, `material`); no `create table`, no grant, no policy. (Applied manually in the Supabase SQL editor — not run by app or tests.)

- [ ] **Step 3: Commit**

```bash
git add migrations/2026-07-20-lab-classification.sql
git commit -m "feat: lab classification migration (raw_text, panel, note, analyte meta)"
```

---

### Task 2: Parser — censored values become numeric bounds

**Files:**
- Modify: `src/lib/labParse.ts:24-29` (`parseResultNum`) and add `censoredDir`
- Modify: `src/lib/labParse.test.ts`

**Interfaces:**
- Produces:
  - `parseResultNum(raw: string): number | null` — now returns the numeric **bound** for censored values (`>100` → `100`, `<0.6` → `0.6`); non-censored text (`negatiivne`) and empty still return `null`.
  - `censoredDir(raw: string): '<' | '>' | null` — the censoring direction from the verbatim string; `null` when not censored.

- [ ] **Step 1: Update the failing tests**

In `src/lib/labParse.test.ts`, replace the `parseResultNum` censored case and add `censoredDir`. Change the block at lines 11-14 to:

```ts
  it('returns the numeric bound for censored (</>) values', () => {
    expect(parseResultNum('<0.10')).toBe(0.10)
    expect(parseResultNum('> 100')).toBe(100)
  })
```

Add a new describe block after the `parseResultNum` describe:

```ts
describe('censoredDir', () => {
  it('reads the censoring direction from the raw string', () => {
    expect(censoredDir('<0.6')).toBe('<')
    expect(censoredDir('> 100')).toBe('>')
  })
  it('returns null for plain numbers and words', () => {
    expect(censoredDir('5.2')).toBeNull()
    expect(censoredDir('Negatiivne')).toBeNull()
    expect(censoredDir('')).toBeNull()
  })
})
```

Update the import line at the top to include `censoredDir`:

```ts
import { parseResultNum, parseRefBounds, parseSession, censoredDir } from './labParse'
```

Update the existing `parseSession` fixture assertion for the censored analyte (the `d1 Dermatophagoides pteronyssinus` row) so `result_num` is the bound, not null. Change **only** the `result_num` value on line ~62 from `null` to `0.10` — leave the object shape otherwise unchanged (the `panel`/`note` fields arrive in Task 3):

```ts
    expect(s.results[0]).toEqual({
      analyte: 'd1 Dermatophagoides pteronyssinus',
      result_raw: '<0.10', result_num: 0.10, unit: 'kU/L',
      ref: '<0.35', ref_min: null, ref_max: 0.35, verdict: 'Negatiivne',
    })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- labParse`
Expected: FAIL — `censoredDir` is not exported; `parseResultNum('<0.10')` still returns `null`.

- [ ] **Step 3: Update the implementation**

In `src/lib/labParse.ts`, replace `parseResultNum` (lines 21-29) with:

```ts
// A bare number, comma- or dot-decimal. Censored (< / >) values return their
// numeric BOUND (>100 → 100, <0.6 → 0.6) so they stay plottable; the direction
// is recovered separately via censoredDir. Non-censored text (negatiivne) and
// empty strings return null.
export function parseResultNum(raw: string): number | null {
  const t = raw.trim().replace(/^[<>]\s*/, '')
  if (!t) return null
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

// The censoring direction from the verbatim result string, or null if the value
// is not censored. Derived at render time so no schema column is needed.
export function censoredDir(raw: string): '<' | '>' | null {
  const t = raw.trim()
  if (t.startsWith('<')) return '<'
  if (t.startsWith('>')) return '>'
  return null
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- labParse`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/labParse.ts src/lib/labParse.test.ts
git commit -m "feat: censored lab values parse to their numeric bound + censoredDir"
```

---

### Task 3: Parser — multi-session split, panels, notes, raw text

**Files:**
- Modify: `src/lib/labParse.ts` (interfaces + `parseSession` + new `splitSessions`, `parseText`)
- Modify: `src/lib/labParse.test.ts`

**Interfaces:**
- Consumes: `parseLocalDateTime` from `./nutritionCsv`.
- Produces:
  - `interface ParsedResult` gains `panel: string | null` and `note: string | null`.
  - `interface ParsedSession` gains `raw_text: string`.
  - `parseSession(text: string): ParsedSession` — now records the current `panel` on each result, attaches `Tulemuse märkus:` lines as `note`, and sets `raw_text` to the passed text.
  - `splitSessions(text: string): string[]` — splits a multi-sample paste into one block string per `Proovinõu ID` (text before the first meta line is dropped). Returns `[text]` when no meta line is found.
  - `parseText(text: string): ParsedSession[]` — `splitSessions` then `parseSession` on each block (throws if any block is unparseable; callers wanting per-block errors use `splitSessions` + `parseSession`).

- [ ] **Step 1: Write the failing tests**

In `src/lib/labParse.test.ts`, first update the **existing** `parseSession` fixture assertions (from Task 2) so both result objects carry the new `panel: null, note: null` fields (the `SAMPLE` fixture has no panel header, so both are null):

```ts
    expect(s.results[0]).toEqual({
      analyte: 'd1 Dermatophagoides pteronyssinus',
      result_raw: '<0.10', result_num: 0.10, unit: 'kU/L',
      ref: '<0.35', ref_min: null, ref_max: 0.35, verdict: 'Negatiivne',
      panel: null, note: null,
    })
    expect(s.results[1]).toEqual({
      analyte: 'Kolesterool',
      result_raw: '5,2', result_num: 5.2, unit: 'mmol/L',
      ref: '2.0-5.0', ref_min: 2.0, ref_max: 5.0, verdict: 'Kõrge',
      panel: null, note: null,
    })
```

Then update the import line and add the new describe blocks (keep the existing ones):

```ts
import { parseResultNum, parseRefBounds, parseSession, censoredDir, splitSessions, parseText } from './labParse'

const MULTI = [
  'Laboratoorsed uuringud',
  'Proovimaterjal: VERI, Proovinõu ID: L001, Võetud: 01.02.2026 09:00',
  'Veri - 01.02.2026 09:00',
  'Hemogramm 5-osalise leukogrammiga',
  'Analüüs\tTulemus\tÜhik\tRef.väärtus',
  'Hemoglobiin\t145\tg/L\t134 - 170',
  'Tulemuse märkus: Proovimaterjal lipeemiline, tulemus võib olla mõjutatud',
  'Proovimaterjal: PLASMA, Proovinõu ID: L002, Võetud: 03.02.2026 10:30',
  'Plasma - 03.02.2026 10:30',
  'Analüüs\tTulemus\tÜhik\tRef.väärtus',
  'CRP\t<0.6\tmg/L\t<5',
  'Tulemuse tõlgendus: optimaalne',
].join('\n')

describe('splitSessions', () => {
  it('splits a paste into one block per Proovinõu ID and drops the preamble', () => {
    const blocks = splitSessions(MULTI)
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toContain('L001')
    expect(blocks[0]).not.toContain('L002')
    expect(blocks[1]).toContain('L002')
  })
  it('returns the whole text as one block when no meta line is present', () => {
    expect(splitSessions('just some text')).toEqual(['just some text'])
  })
})

describe('parseSession panels & notes', () => {
  it('stamps the panel header on results and attaches Tulemuse märkus as note', () => {
    const s = parseSession(splitSessions(MULTI)[0])
    expect(s.results).toHaveLength(1)
    expect(s.results[0].analyte).toBe('Hemoglobiin')
    expect(s.results[0].panel).toBe('Hemogramm 5-osalise leukogrammiga')
    expect(s.results[0].note).toBe('Proovimaterjal lipeemiline, tulemus võib olla mõjutatud')
    expect(s.results[0].verdict).toBeNull()
  })
  it('preserves the raw block text', () => {
    const block = splitSessions(MULTI)[0]
    expect(parseSession(block).raw_text).toBe(block)
  })
})

describe('parseText', () => {
  it('parses every session in a multi-sample paste', () => {
    const sessions = parseText(MULTI)
    expect(sessions.map(s => s.sample_id)).toEqual(['L001', 'L002'])
    expect(sessions[1].results[0]).toMatchObject({
      analyte: 'CRP', result_num: 0.6, verdict: 'optimaalne', note: null, panel: null,
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- labParse`
Expected: FAIL — `splitSessions`/`parseText` not exported; `panel`/`note` undefined on results.

- [ ] **Step 3: Update the implementation**

In `src/lib/labParse.ts`, extend the interfaces:

```ts
export interface ParsedResult {
  analyte: string
  result_raw: string
  result_num: number | null
  unit: string | null
  ref: string | null
  ref_min: number | null
  ref_max: number | null
  verdict: string | null
  panel: string | null
  note: string | null
}

export interface ParsedSession {
  sample_id: string
  material: string | null
  taken_at: string // ISO
  raw_text: string
  results: ParsedResult[]
}
```

Add the new regexes/constants beside the existing ones (after `VERDICT_RE`):

```ts
const NOTE_RE = /^Tulemuse\s*märkus:\s*(.+)$/i
// A date like 07.07.2026 marks the restated material line ("Seerum - dd.mm.yyyy").
const DATE_RE = /\d{1,2}\.\d{1,2}\.\d{4}/
// Section/heading noise that is neither a panel nor a result.
const NOISE = new Set(['laboratoorsed uuringud'])
```

Replace the `parseSession` body (the loop + return) so it tracks panels, notes, and raw text. Full replacement of `parseSession`:

```ts
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
  let panel: string | null = null
  for (const line of lines) {
    const verdict = VERDICT_RE.exec(line)
    if (verdict) {
      if (results.length) results[results.length - 1].verdict = verdict[1].trim()
      continue
    }
    const note = NOTE_RE.exec(line)
    if (note) {
      if (results.length) results[results.length - 1].note = note[1].trim()
      continue
    }
    if (!line.includes('\t')) {
      // No result columns: meta line, restated material line (has a date),
      // recognised noise, or a panel/group header. Only the last sets the panel.
      if (META_RE.test(line) || DATE_RE.test(line) || NOISE.has(line.toLowerCase())) continue
      panel = line
      continue
    }
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
      panel,
      note: null,
    })
  }

  return { sample_id: sampleId, material, taken_at: takenDate.toISOString(), raw_text: text, results }
}
```

Add `splitSessions` and `parseText` at the end of the file:

```ts
// Split a multi-sample paste into one block string per "Proovinõu ID" line.
// Any text before the first meta line (portal preamble) is dropped. When no
// meta line exists the whole text is returned as a single block so parseSession
// can raise its normal "missing sample id" error.
export function splitSessions(text: string): string[] {
  const lines = text.split(/\r?\n/)
  const starts: number[] = []
  lines.forEach((l, i) => { if (META_RE.test(l)) starts.push(i) })
  if (!starts.length) return [text]
  return starts.map((from, k) => {
    const to = k + 1 < starts.length ? starts[k + 1] : lines.length
    return lines.slice(from, to).join('\n')
  })
}

// Parse every sample in a paste. Throws on the first unparseable block; callers
// that want per-block error reporting should iterate splitSessions themselves.
export function parseText(text: string): ParsedSession[] {
  return splitSessions(text).map(parseSession)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- labParse`
Expected: PASS (all existing + new cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/labParse.ts src/lib/labParse.test.ts
git commit -m "feat: multi-session paste parsing with panels, notes, raw text"
```

---

### Task 4: Auto-classify (`labClassify.ts`)

**Files:**
- Create: `src/lib/labClassify.ts`
- Create: `src/lib/labClassify.test.ts`

**Interfaces:**
- Consumes: `parseResultNum`, `censoredDir` from `./labParse`.
- Produces:
  - `interface AnalyteMeta { material: string | null; category: string | null; value_type: 'number' | 'binary' }`
  - `guessMeta(input: { analyte: string; panel: string | null; material: string | null; resultRaw: string }): AnalyteMeta`
    - `value_type`: `'binary'` when `parseResultNum(resultRaw)` is `null`, the value is not censored, and the raw is non-empty; otherwise `'number'` (censored counts as number).
    - `category`: first-match-wins keyword map over `${panel} ${analyte}` (case-insensitive); `null` if nothing matches.
    - `material`: passed through unchanged.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/labClassify.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { guessMeta } from './labClassify'

const base = { panel: null, material: 'VERI', resultRaw: '5' }

describe('guessMeta value_type', () => {
  it('numbers are number', () => {
    expect(guessMeta({ ...base, analyte: 'Hemoglobiin', resultRaw: '145' }).value_type).toBe('number')
  })
  it('censored values are number', () => {
    expect(guessMeta({ ...base, analyte: 'CRP', resultRaw: '<0.6' }).value_type).toBe('number')
  })
  it('non-censored words are binary', () => {
    expect(guessMeta({ ...base, analyte: 'Giardia lamblia DNA', resultRaw: 'negatiivne' }).value_type).toBe('binary')
  })
})

describe('guessMeta category', () => {
  const cases: [string, string | null, string | null][] = [
    // analyte, panel, expected category
    ['t1 Timothy IgE', null, 'allergy'],
    ['Hemoglobiin', 'Hemogramm 5-osalise leukogrammiga', 'hematology'],
    ['Giardia lamblia DNA roojas', 'Soole parasiitide DNA paneel roojas', 'infection'],
    ['HbA1c (IFCC)', null, 'chemistry'],
    ['ALP', null, 'liver-kidney'],
    ['eGFR (Crea, CKD-EPI)', null, 'liver-kidney'],
    ['CRP', null, 'inflammation'],
    ['Vitamiin D (25-OH)', null, 'vitamins'],
    ['Ferritiin', null, 'vitamins'],
    ['Mystery analyte', null, null],
  ]
  it.each(cases)('%s → %s', (analyte, panel, expected) => {
    expect(guessMeta({ analyte, panel, material: null, resultRaw: '1' }).category).toBe(expected)
  })
})

describe('guessMeta material', () => {
  it('passes material through', () => {
    expect(guessMeta({ ...base, analyte: 'CRP' }).material).toBe('VERI')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- labClassify`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/labClassify.ts`:

```ts
import { parseResultNum, censoredDir } from './labParse'

export interface AnalyteMeta {
  material: string | null
  category: string | null
  value_type: 'number' | 'binary'
}

// First match wins. Estonian portal terms included. Order matters: more specific
// panels/analytes should precede broader ones (e.g. HbA1c before generic).
const CATEGORY_RULES: { category: string; keywords: string[] }[] = [
  { category: 'allergy', keywords: ['ige'] },
  { category: 'hematology', keywords: ['hemogramm', 'leukogramm', 'wbc', 'rbc', 'erü', 'trombo', 'hemoglobiin'] },
  { category: 'infection', keywords: ['parasiit', 'dna paneel'] },
  { category: 'chemistry', keywords: ['glükoos', 'glucose', 'hba1c', 'naatrium', 'kaalium', 'kloriid'] },
  { category: 'liver-kidney', keywords: ['alp', 'alat', 'asat', 'bilirubiin', 'ggt', 'egfr', 'kreatiniin', 'crea'] },
  { category: 'inflammation', keywords: ['crp', 'settereaktsioon'] },
  { category: 'vitamins', keywords: ['vitamiin', 'b12', 'folaat', 'folate', 'ferritiin', 'raud', 'iron'] },
]

function guessCategory(haystack: string): string | null {
  const h = haystack.toLowerCase()
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some(k => h.includes(k))) return rule.category
  }
  return null
}

export function guessMeta(
  input: { analyte: string; panel: string | null; material: string | null; resultRaw: string },
): AnalyteMeta {
  const raw = input.resultRaw.trim()
  const isNumber = parseResultNum(raw) != null || censoredDir(raw) != null
  const value_type: 'number' | 'binary' = !isNumber && raw !== '' ? 'binary' : 'number'
  return {
    material: input.material,
    category: guessCategory(`${input.panel ?? ''} ${input.analyte}`),
    value_type,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- labClassify`
Expected: PASS. (Note: `crp` matches `inflammation` before `liver-kidney`'s `crea` because `crea` requires the substring "crea"; "CRP" does not contain it — verify the `CRP → inflammation` and `eGFR → liver-kidney` cases both pass.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/labClassify.ts src/lib/labClassify.test.ts
git commit -m "feat: analyte auto-classification (guessMeta, seven categories)"
```

---

### Task 5: Chart resolver + segment builder (`labChart.ts`)

**Files:**
- Modify: `src/lib/labChart.ts` (add `chartTypeFor`, `lineSegments`)
- Modify: `src/lib/labChart.test.ts`

**Interfaces:**
- Produces:
  - `type ChartType = 'allergy-scale' | 'timeseries' | 'strip'`
  - `chartTypeFor(meta: { category: string | null; value_type: string | null } | null, hasNumeric: boolean): ChartType`
    - `allergy-scale` when `meta.category === 'allergy'` and `meta.value_type === 'number'`.
    - `timeseries` when `meta.value_type === 'number'`, or when `meta` is null but numeric points exist.
    - `strip` otherwise.
  - `interface ScaledPoint { x: number; y: number; censored: '<' | '>' | null }`
  - `lineSegments(pts: ScaledPoint[]): { x1: number; y1: number; x2: number; y2: number; dashed: boolean }[]` — consecutive-pair segments; `dashed` is true when **either** endpoint is censored.
- Note: `computeYDomain` already receives every numeric value, and censored points now carry `result_num = bound`, so the y-domain includes them with no change.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/labChart.test.ts` (add the two symbols to the existing import line):

```ts
import { chartTypeFor, lineSegments } from './labChart'

describe('chartTypeFor', () => {
  it('allergy + number → allergy-scale', () => {
    expect(chartTypeFor({ category: 'allergy', value_type: 'number' }, true)).toBe('allergy-scale')
  })
  it('number (non-allergy) → timeseries', () => {
    expect(chartTypeFor({ category: 'chemistry', value_type: 'number' }, true)).toBe('timeseries')
  })
  it('binary → strip', () => {
    expect(chartTypeFor({ category: 'infection', value_type: 'binary' }, false)).toBe('strip')
  })
  it('no meta but numeric points → timeseries', () => {
    expect(chartTypeFor(null, true)).toBe('timeseries')
  })
  it('no meta, no numeric points → strip', () => {
    expect(chartTypeFor(null, false)).toBe('strip')
  })
})

describe('lineSegments', () => {
  it('dashes a segment when either endpoint is censored', () => {
    const segs = lineSegments([
      { x: 0, y: 0, censored: null },
      { x: 1, y: 1, censored: '>' },
      { x: 2, y: 2, censored: null },
    ])
    expect(segs).toHaveLength(2)
    expect(segs[0]).toEqual({ x1: 0, y1: 0, x2: 1, y2: 1, dashed: true })  // touches censored
    expect(segs[1]).toEqual({ x1: 1, y1: 1, x2: 2, y2: 2, dashed: true })  // touches censored
  })
  it('keeps a segment solid when neither endpoint is censored', () => {
    const segs = lineSegments([
      { x: 0, y: 0, censored: null },
      { x: 1, y: 1, censored: null },
    ])
    expect(segs[0].dashed).toBe(false)
  })
  it('returns no segments for a single point', () => {
    expect(lineSegments([{ x: 0, y: 0, censored: null }])).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- labChart`
Expected: FAIL — `chartTypeFor`/`lineSegments` not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/labChart.ts`:

```ts
export type ChartType = 'allergy-scale' | 'timeseries' | 'strip'

// Pick the chart from the analyte's classification. Only allergy+number takes the
// class scale; any numeric analyte is a time-series; everything else is a strip.
export function chartTypeFor(
  meta: { category: string | null; value_type: string | null } | null,
  hasNumeric: boolean,
): ChartType {
  if (meta?.category === 'allergy' && meta.value_type === 'number') return 'allergy-scale'
  if (meta?.value_type === 'number') return 'timeseries'
  if (!meta && hasNumeric) return 'timeseries'
  return 'strip'
}

export interface ScaledPoint { x: number; y: number; censored: '<' | '>' | null }

// Consecutive-pair segments. A segment is dashed when either endpoint is a
// censored (>/<) value, signalling its exact position is uncertain.
export function lineSegments(
  pts: ScaledPoint[],
): { x1: number; y1: number; x2: number; y2: number; dashed: boolean }[] {
  const segs: { x1: number; y1: number; x2: number; y2: number; dashed: boolean }[] = []
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, dashed: a.censored != null || b.censored != null })
  }
  return segs
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- labChart`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/labChart.ts src/lib/labChart.test.ts
git commit -m "feat: chart type resolver + dashed-segment builder"
```

---

### Task 6: Allergy class scale (`labAllergyScale.ts`)

**Files:**
- Create: `src/lib/labAllergyScale.ts`
- Create: `src/lib/labAllergyScale.test.ts`

**Interfaces:**
- Produces:
  - `const CAP_RAST_THRESHOLDS: number[]` = `[0.35, 0.70, 3.5, 17.5, 50, 100]` (6 thresholds → 7 classes 0–6).
  - `interface ScalePosition { x: number; className: number; capped: '<' | '>' | null }`
  - `positionFor(value: number, dir?: '<' | '>' | null): ScalePosition` — maps a value to a fraction `x` in `[0,1]` across a 7-cell banded bar (piecewise-linear within a cell), the class number `0..6`, and a `capped` flag. `dir === '>'` or `value >= 100` → far right (`x: 1`, class 6, `capped: '>'`); `dir === '<'` or `value < 0.35` → far left (`x: 0`, class 0, `capped: '<'`).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/labAllergyScale.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { CAP_RAST_THRESHOLDS, positionFor } from './labAllergyScale'

describe('CAP_RAST_THRESHOLDS', () => {
  it('has the six standard CAP-RAST thresholds', () => {
    expect(CAP_RAST_THRESHOLDS).toEqual([0.35, 0.70, 3.5, 17.5, 50, 100])
  })
})

describe('positionFor', () => {
  it('below 0.35 → class 0, clamped left, capped <', () => {
    expect(positionFor(0.1)).toEqual({ x: 0, className: 0, capped: '<' })
  })
  it('censored < → class 0 regardless of bound', () => {
    expect(positionFor(0.35, '<')).toEqual({ x: 0, className: 0, capped: '<' })
  })
  it('at/above 100 → class 6, clamped right, capped >', () => {
    expect(positionFor(100)).toEqual({ x: 1, className: 6, capped: '>' })
    expect(positionFor(250)).toEqual({ x: 1, className: 6, capped: '>' })
  })
  it('censored > → class 6', () => {
    expect(positionFor(50, '>')).toEqual({ x: 1, className: 6, capped: '>' })
  })
  it('a mid value lands in its class cell', () => {
    // 0.35 is the bottom of class 1 → start of the 2nd of 7 cells → x = 1/7.
    const p = positionFor(0.35)
    expect(p.className).toBe(1)
    expect(p.capped).toBeNull()
    expect(p.x).toBeCloseTo(1 / 7, 5)
  })
  it('interpolates within a cell', () => {
    // Halfway between 0.35 and 0.70 → middle of class-1 cell → x = 1.5/7.
    const p = positionFor((0.35 + 0.70) / 2)
    expect(p.className).toBe(1)
    expect(p.x).toBeCloseTo(1.5 / 7, 5)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- labAllergyScale`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/labAllergyScale.ts`:

```ts
// Fixed CAP-RAST IgE class bands, shared by every allergen (not per-analyte, not
// stored). Six thresholds partition values into seven classes (0..6).
export const CAP_RAST_THRESHOLDS = [0.35, 0.70, 3.5, 17.5, 50, 100]
const CLASS_COUNT = CAP_RAST_THRESHOLDS.length + 1 // 7 cells across the bar

export interface ScalePosition { x: number; className: number; capped: '<' | '>' | null }

// Map an IgE value to a fraction across the 7-cell banded bar. Class 0 (< first
// threshold) clamps to the far left; class 6 (>= last threshold, i.e. off-scale)
// clamps to the far right. Within an interior cell the value interpolates
// linearly between that cell's lower and upper thresholds.
export function positionFor(value: number, dir?: '<' | '>' | null): ScalePosition {
  if (dir === '>' || value >= CAP_RAST_THRESHOLDS[CAP_RAST_THRESHOLDS.length - 1]) {
    return { x: 1, className: CLASS_COUNT - 1, capped: '>' }
  }
  if (dir === '<' || value < CAP_RAST_THRESHOLDS[0]) {
    return { x: 0, className: 0, capped: '<' }
  }
  // Interior classes 1..5: find the cell whose [lower, upper) contains value.
  let c = 1
  while (c < CAP_RAST_THRESHOLDS.length && value >= CAP_RAST_THRESHOLDS[c]) c++
  const lower = CAP_RAST_THRESHOLDS[c - 1]
  const upper = CAP_RAST_THRESHOLDS[c]
  const frac = (value - lower) / (upper - lower)
  return { x: (c + frac) / CLASS_COUNT, className: c, capped: null }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- labAllergyScale`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/labAllergyScale.ts src/lib/labAllergyScale.test.ts
git commit -m "feat: CAP-RAST allergy class scale (positionFor)"
```

---

### Task 7: Data layer — persist raw_text/panel/note + analyte meta

**Files:**
- Modify: `src/lib/lab.ts` (interfaces + `saveSession`)
- Modify: `src/lib/labDescriptions.ts` (interface + `seedAnalyteMeta`, `updateAnalyteMeta`)

**Interfaces:**
- Consumes: `supabase`; `ParsedSession` from `./labParse`; `AnalyteMeta` from `./labClassify`.
- Produces:
  - `LabResult` gains `panel: string | null` and `note: string | null`.
  - `LabSession` gains `raw_text: string | null`.
  - `saveSession` persists `raw_text` on the session and `panel`/`note` on results (already spreads `ParsedResult`, which now carries them).
  - `AnalyteDescription` gains `category: string | null`, `value_type: string | null`, `material: string | null`.
  - `seedAnalyteMeta(rows: { analyte: string; material: string | null; category: string | null; value_type: string }[]): Promise<void>` — inserts only analytes **absent** from the dictionary (`upsert(..., { onConflict: 'analyte', ignoreDuplicates: true })`); existing rows untouched.
  - `updateAnalyteMeta(analyte: string, patch: { category?: string | null; value_type?: string | null; material?: string | null }): Promise<void>` — Settings inline edit (relies on the existing `update` grant).

- [ ] **Step 1: Update `lab.ts` interfaces and saveSession**

In `src/lib/lab.ts`, add to `LabResult` (after `verdict`):

```ts
  verdict: string | null
  panel: string | null
  note: string | null
}
```

Add to `LabSession` (after `taken_at`):

```ts
  taken_at: string
  created_at: string
  raw_text: string | null
  results: LabResult[]
}
```

Replace the session insert in `saveSession` to include `raw_text`:

```ts
  const { data, error } = await supabase
    .from('lab_sessions')
    .insert({ sample_id: s.sample_id, material: s.material, taken_at: s.taken_at, raw_text: s.raw_text })
    .select('id')
    .single()
```

The results insert already does `{ ...r, session_id: sessionId }`; since `ParsedResult` now includes `panel` and `note`, these persist automatically. No further change to the results insert.

- [ ] **Step 2: Update `labDescriptions.ts`**

In `src/lib/labDescriptions.ts`, extend the interface and add the two functions. Replace the `AnalyteDescription` interface:

```ts
export interface AnalyteDescription {
  analyte: string
  description: string | null
  category: string | null
  value_type: string | null
  material: string | null
}
```

Add after `deleteDescription`:

```ts
// Seed the dictionary with guessed metadata for analytes not already present.
// ignoreDuplicates keeps any existing (possibly user-corrected) row untouched.
export async function seedAnalyteMeta(
  rows: { analyte: string; material: string | null; category: string | null; value_type: string }[],
): Promise<void> {
  if (!rows.length) return
  const { error } = await supabase
    .from('lab_analyte_descriptions')
    .upsert(rows, { onConflict: 'analyte', ignoreDuplicates: true })
  if (error) throw error
}

// Update classification fields for one analyte (Settings inline edit).
export async function updateAnalyteMeta(
  analyte: string,
  patch: { category?: string | null; value_type?: string | null; material?: string | null },
): Promise<void> {
  const { error } = await supabase
    .from('lab_analyte_descriptions')
    .update(patch)
    .eq('analyte', analyte)
  if (error) throw error
}
```

- [ ] **Step 3: Verify it builds**

Run: `npm run build`
Expected: PASS. (Type errors may surface in `GraphView`/`Settings`/`labDescriptionsCsv` if they construct `AnalyteDescription`/`DescRow` literals — those are updated in Tasks 9 and 10. If the build fails only there, proceed; otherwise fix the reported line. To keep this task's build green, confirm `fetchDescriptions` uses `select('*')` — it does — so no literal is constructed here.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/lab.ts src/lib/labDescriptions.ts
git commit -m "feat: persist raw_text/panel/note and analyte classification meta"
```

---

### Task 8: Import modal — multi-session paste + dictionary seeding

**Files:**
- Modify: `src/pages/tests/ImportModal.tsx`

**Interfaces:**
- Consumes: `splitSessions`, `parseSession`, `ParsedSession` from `../../lib/labParse`; `saveSession`, `fetchSampleIds` from `../../lib/lab`; `guessMeta` from `../../lib/labClassify`; `seedAnalyteMeta` from `../../lib/labDescriptions`.
- Produces: unchanged default export `ImportModal({ onClose, onSaved })`. One paste can now contain several samples; the log lists **each** detected session; on Done all non-duplicate sessions save and the dictionary is seeded for new analytes.

- [ ] **Step 1: Rewrite `addPaste` to split multi-session pastes**

In `src/pages/tests/ImportModal.tsx`, update the imports:

```tsx
import { useEffect, useState } from 'react'
import { splitSessions, parseSession, type ParsedSession } from '../../lib/labParse'
import { saveSession, fetchSampleIds } from '../../lib/lab'
import { guessMeta } from '../../lib/labClassify'
import { seedAnalyteMeta } from '../../lib/labDescriptions'
import styles from './ImportModal.module.css'
```

Replace `addPaste` so it parses every block in the paste:

```tsx
  function addPaste() {
    if (!text.trim()) return
    const seenIds = new Set([...knownIds, ...queued()])
    const newEntries: Entry[] = []
    for (const block of splitSessions(text)) {
      try {
        const session = parseSession(block)
        const date = new Date(session.taken_at).toLocaleString()
        const isDup = seenIds.has(session.sample_id)
        if (!isDup) seenIds.add(session.sample_id)
        newEntries.push({
          session: isDup ? undefined : session,
          label: `${date} · ${session.material ?? '—'} · ${session.results.length} analytes${isDup ? ' (already saved — skipped)' : ''}`,
          status: isDup ? 'dup' : 'ok',
        })
      } catch (e: any) {
        newEntries.push({ label: e?.message ?? 'Could not parse paste', status: 'error' })
      }
    }
    setEntries(prev => [...prev, ...newEntries])
    setText('')
  }
```

- [ ] **Step 2: Seed the dictionary in `done()` after a successful save**

Replace `done()` so it seeds analyte metadata for saved sessions:

```tsx
  async function done() {
    const toSave = entries.filter(e => e.session).map(e => e.session!)
    if (!toSave.length) { onClose(); return }
    setSaving(true)
    setError(null)
    const savedIds = new Set<string>()
    const failures: string[] = []
    for (const s of toSave) {
      try { await saveSession(s); savedIds.add(s.sample_id) }
      catch (e: any) { failures.push(`${s.sample_id}: ${e?.message ?? 'save failed'}`) }
    }
    // Seed guessed metadata for analytes across the sessions that saved. Existing
    // dictionary rows are left untouched (seedAnalyteMeta ignores duplicates).
    const metaRows = new Map<string, { analyte: string; material: string | null; category: string | null; value_type: string }>()
    for (const s of toSave.filter(s => savedIds.has(s.sample_id))) {
      for (const r of s.results) {
        if (metaRows.has(r.analyte)) continue
        const m = guessMeta({ analyte: r.analyte, panel: r.panel, material: s.material, resultRaw: r.result_raw })
        metaRows.set(r.analyte, { analyte: r.analyte, material: m.material, category: m.category, value_type: m.value_type })
      }
    }
    try { await seedAnalyteMeta([...metaRows.values()]) } catch { /* best-effort seeding */ }
    setSaving(false)
    if (failures.length) {
      setEntries(prev => prev.filter(e => !(e.session && savedIds.has(e.session.sample_id))))
      setError(`Saved ${savedIds.size}. Failed — ${failures.join('; ')}`)
      return
    }
    onSaved()
  }
```

Update the hint copy (line ~76) to reflect multi-sample pastes:

```tsx
        <p className={styles.hint}>Paste one or more samples from the portal, then Add. Each sample is detected automatically.</p>
```

- [ ] **Step 3: Verify it builds**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/pages/tests/ImportModal.tsx
git commit -m "feat: import modal parses multi-sample pastes and seeds the dictionary"
```

---

### Task 9: GraphView — classifier-driven charts

**Files:**
- Modify: `src/pages/tests/GraphView.tsx` (full rewrite)
- Modify: `src/pages/tests/views.module.css` (add chart styles)

**Interfaces:**
- Consumes: `LabSession` from `../../lib/lab`; `LabEvent` from `../../lib/labEvents`; `AnalyteDescription` from `../../lib/labDescriptions`; `computeYDomain`, `scalePoints`, `refBandRect`, `eventLinesX`, `chartTypeFor`, `lineSegments`, `type ChartDims`, `type ScaledPoint` from `../../lib/labChart`; `censoredDir` from `../../lib/labParse`; `positionFor`, `CAP_RAST_THRESHOLDS` from `../../lib/labAllergyScale`.
- Produces: unchanged export `GraphView({ sessions, events, descriptions })`. Per analyte it now picks `allergy-scale` / `timeseries` / `strip` from the dictionary meta and renders accordingly. Censored points on the time-series are literal `>`/`<` glyphs with dashed adjacent segments. All three chart kinds share a two-line tooltip: `<result_raw> <unit> · <dd.mm.yyyy HH:MM>` then `<verdict ?? note ?? ''>`.

- [ ] **Step 1: Rewrite `GraphView.tsx`**

Replace the whole file with:

```tsx
import type { LabSession } from '../../lib/lab'
import type { LabEvent } from '../../lib/labEvents'
import type { AnalyteDescription } from '../../lib/labDescriptions'
import {
  computeYDomain, scalePoints, refBandRect, eventLinesX, chartTypeFor, lineSegments,
  type ChartDims, type ScaledPoint,
} from '../../lib/labChart'
import { censoredDir } from '../../lib/labParse'
import { positionFor, CAP_RAST_THRESHOLDS } from '../../lib/labAllergyScale'
import styles from './views.module.css'

const DIMS: ChartDims = { width: 320, height: 180, padL: 34, padR: 12, padT: 12, padB: 24 }

interface NumPoint { t: number; v: number; raw: string; bad: boolean; censored: '<' | '>' | null }
interface QualPoint { t: number; verdict: string | null; note: string | null; raw: string }

interface AnalyteSeries {
  analyte: string
  unit: string | null
  numeric: NumPoint[]
  qualitative: QualPoint[]
  refMin: number | null
  refMax: number | null
}

function buildSeries(sessions: LabSession[]): AnalyteSeries[] {
  const map = new Map<string, AnalyteSeries>()
  const ordered = [...sessions].sort((a, b) => a.taken_at.localeCompare(b.taken_at))
  for (const s of ordered) {
    const t = new Date(s.taken_at).getTime()
    for (const r of s.results) {
      let ser = map.get(r.analyte)
      if (!ser) {
        ser = { analyte: r.analyte, unit: r.unit, numeric: [], qualitative: [], refMin: r.ref_min, refMax: r.ref_max }
        map.set(r.analyte, ser)
      }
      if (r.unit) ser.unit = r.unit
      if (r.ref_min != null) ser.refMin = r.ref_min
      if (r.ref_max != null) ser.refMax = r.ref_max
      if (r.result_num != null) {
        const bad = (r.ref_min != null && r.result_num < r.ref_min) || (r.ref_max != null && r.result_num > r.ref_max)
        ser.numeric.push({ t, v: r.result_num, raw: r.result_raw, bad, censored: censoredDir(r.result_raw) })
      } else {
        ser.qualitative.push({ t, verdict: r.verdict, note: r.note, raw: r.result_raw })
      }
    }
  }
  return [...map.values()]
}

// Two-line tooltip shared by every chart kind.
function tip(raw: string, unit: string | null, t: number, second: string | null): string {
  const when = new Date(t).toLocaleString()
  const line1 = `${raw}${unit ? ` ${unit}` : ''} · ${when}`
  return second ? `${line1}\n${second}` : line1
}

export function GraphView(
  { sessions, events, descriptions }: { sessions: LabSession[]; events: LabEvent[]; descriptions: AnalyteDescription[] },
) {
  const series = buildSeries(sessions)
  if (!series.length) return <p className={styles.empty}>No lab results yet.</p>
  const metaOf = (a: string) => descriptions.find(d => d.analyte === a) ?? null
  const descOf = (a: string) => metaOf(a)?.description ?? ''
  const eventTimes = events.map(e => new Date(`${e.event_date}T00:00:00`).getTime())

  return (
    <div className={styles.charts}>
      {series.map(ser => {
        const meta = metaOf(ser.analyte)
        const kind = chartTypeFor(meta, ser.numeric.length > 0)
        return (
          <div key={ser.analyte} className={styles.chartCard}>
            <div className={styles.chartTitle} title={descOf(ser.analyte)}>
              {ser.analyte}{ser.unit ? <span className={styles.unit}> ({ser.unit})</span> : null}
            </div>
            {kind === 'allergy-scale'
              ? <AllergyScale ser={ser} />
              : kind === 'timeseries'
                ? <TimeSeries ser={ser} eventTimes={eventTimes} />
                : null}
            {(kind === 'strip' || ser.qualitative.length > 0) && <Strip ser={ser} />}
          </div>
        )
      })}
    </div>
  )
}

function TimeSeries({ ser, eventTimes }: { ser: AnalyteSeries; eventTimes: number[] }) {
  const numeric = ser.numeric
  const times = numeric.map(p => p.t)
  const tMin = Math.min(...times), tMax = Math.max(...times)
  const { yMin, yMax } = computeYDomain(numeric.map(p => p.v), ser.refMin, ser.refMax)
  const base = scalePoints(numeric.map(p => ({ t: p.t, v: p.v })), DIMS, tMin, tMax, yMin, yMax)
  const pts: ScaledPoint[] = base.map((p, i) => ({ ...p, censored: numeric[i].censored }))
  const band = refBandRect(ser.refMin, ser.refMax, DIMS, yMin, yMax)
  const evX = eventLinesX(eventTimes, DIMS, tMin, tMax)
  const segs = lineSegments(pts)
  return (
    <svg viewBox={`0 0 ${DIMS.width} ${DIMS.height}`} className={styles.svg} role="img" aria-label={`${ser.analyte} trend`}>
      {band && <rect x={band.x} y={band.y} width={band.width} height={band.height} className={styles.band} />}
      {evX.map((x, i) => <line key={i} x1={x} y1={DIMS.padT} x2={x} y2={DIMS.height - DIMS.padB} className={styles.eventLine} />)}
      {segs.map((s, i) => (
        <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} className={s.dashed ? styles.lineDashed : styles.line} />
      ))}
      {pts.map((p, i) => {
        const n = numeric[i]
        const t = <title>{tip(n.raw, ser.unit, n.t, null)}</title>
        if (p.censored) {
          // Literal >/< glyph replaces the dot; the shape is the color-blind cue.
          return (
            <text key={i} x={p.x} y={p.y} dy="0.32em" textAnchor="middle" className={styles.glyph}>
              {p.censored}{t}
            </text>
          )
        }
        return (
          <circle key={i} cx={p.x} cy={p.y} r={3} className={n.bad ? styles.dotBad : styles.dot}>{t}</circle>
        )
      })}
    </svg>
  )
}

function AllergyScale({ ser }: { ser: AnalyteSeries }) {
  // Latest numeric point drives the arrow; older points listed in the tooltip.
  const sorted = [...ser.numeric].sort((a, b) => a.t - b.t)
  const latest = sorted[sorted.length - 1]
  const pos = positionFor(latest.v, latest.censored)
  const older = sorted.slice(0, -1).map(p => `${new Date(p.t).toLocaleDateString()}: ${p.raw}`).join('\n')
  const W = 260, H = 40, cells = CAP_RAST_THRESHOLDS.length + 1
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg} role="img" aria-label={`${ser.analyte} allergy class`}>
      {Array.from({ length: cells }, (_, c) => (
        <g key={c}>
          <rect x={(c / cells) * W} y={4} width={W / cells} height={16} className={styles[`band${c}` as keyof typeof styles]} />
          <text x={((c + 0.5) / cells) * W} y={32} textAnchor="middle" className={styles.classNum}>{c}</text>
        </g>
      ))}
      <polygon
        points={`${pos.x * W},22 ${pos.x * W - 4},14 ${pos.x * W + 4},14`}
        className={styles.arrow}
      >
        <title>{tip(latest.raw, ser.unit, latest.t, older ? `Class ${pos.className}\n${older}` : `Class ${pos.className}`)}</title>
      </polygon>
    </svg>
  )
}

function Strip({ ser }: { ser: AnalyteSeries }) {
  return (
    <div className={styles.strip}>
      {ser.qualitative.map((q, i) => {
        const positive = /positiiv/i.test(q.verdict ?? q.raw)
        return (
          <span
            key={i}
            className={`${styles.verdictDot} ${positive ? styles.verdictPos : styles.verdictNeg}`}
            title={tip(q.raw, ser.unit, q.t, q.verdict ?? q.note)}
          >
            {/* Second, non-color cue: ● positive vs ○ negative. */}
            <span aria-hidden="true">{positive ? '●' : '○'}</span> {q.verdict ?? q.raw}
          </span>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Add the new chart styles**

Append to `src/pages/tests/views.module.css`:

```css
.unit { color: var(--ink2); font-weight: 400; font-size: 12px; }
.lineDashed { fill: none; stroke: var(--accent); stroke-width: 1.5; stroke-dasharray: 4 3; opacity: 0.7; }
.glyph { fill: var(--accent); font-size: 13px; font-weight: 700; }
.arrow { fill: var(--ink); }
.classNum { fill: var(--ink2); font-size: 10px; }
.verdictPos { border-color: var(--red); color: var(--ink); }
.verdictNeg { color: var(--ink2); }
/* Allergy class bands, green (0) → red (6); class number is the second cue. */
.band0 { fill: #2e7d32; }
.band1 { fill: #66bb6a; }
.band2 { fill: #cddc39; }
.band3 { fill: #ffca28; }
.band4 { fill: #fb8c00; }
.band5 { fill: #f4511e; }
.band6 { fill: #c62828; }
```

- [ ] **Step 3: Verify it builds**

Run: `npm run build`
Expected: PASS. Then run `npm test` to confirm the whole suite is green.

- [ ] **Step 4: Commit**

```bash
git add src/pages/tests/GraphView.tsx src/pages/tests/views.module.css
git commit -m "feat: classifier-driven lab charts (allergy scale, censored glyphs, dashed segments)"
```

---

### Task 10: Settings — analyte dictionary with classification + CSV columns

**Files:**
- Modify: `src/lib/labDescriptionsCsv.ts` (add columns to round-trip)
- Modify: `src/lib/labDescriptionsCsv.test.ts` (create if absent)
- Modify: `src/pages/Settings.tsx` (`LabDescriptionsSection` → dictionary)

**Interfaces:**
- Consumes: `toCsv` from `./nutritionCsv`.
- Produces:
  - `interface DescRow { analyte: string; category: string; value_type: string; material: string; description: string }`
  - `descriptionsToCsv(rows: DescRow[]): string` — headers `analyte,category,value_type,material,description`.
  - `parseDescRows(cells: string[][]): DescRow[]` — reads all five columns; drops a header row whose first cell is `analyte`.
  - `computeDescPlan` unchanged in shape (keyed on `analyte`).
  - Settings section renders category (dropdown) + value_type (dropdown) + material + description per analyte, inline-editable, with the CSV export/import round-trip staying lossless.

- [ ] **Step 1: Write the failing CSV round-trip test**

Create `src/lib/labDescriptionsCsv.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { descriptionsToCsv, parseDescRows, computeDescPlan } from './labDescriptionsCsv'

const row = { analyte: 'CRP', category: 'inflammation', value_type: 'number', material: 'VERI', description: 'C-reactive protein' }

describe('descriptions CSV round-trip', () => {
  it('is lossless across all five columns', () => {
    const csv = descriptionsToCsv([row])
    const back = parseDescRows(csv.trim().split(/\r?\n/).map(l => l.split(',').map(c => c.replace(/^"|"$/g, ''))))
    expect(back).toEqual([row])
  })
  it('drops the header row and trims', () => {
    const rows = parseDescRows([
      ['analyte', 'category', 'value_type', 'material', 'description'],
      [' CRP ', ' inflammation ', ' number ', ' VERI ', ' C-reactive protein '],
    ])
    expect(rows).toEqual([row])
  })
})

describe('computeDescPlan', () => {
  it('sync mode deletes DB analytes absent from the file', () => {
    const plan = computeDescPlan([row], ['CRP', 'ALP'], 'sync')
    expect(plan.upserts).toEqual([row])
    expect(plan.deletes).toEqual(['ALP'])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- labDescriptionsCsv`
Expected: FAIL — `DescRow` lacks the new fields / columns not written.

- [ ] **Step 3: Update `labDescriptionsCsv.ts`**

Replace the file body with:

```ts
import { toCsv } from './nutritionCsv'

export interface DescRow {
  analyte: string
  category: string
  value_type: string
  material: string
  description: string
}

const HEADERS = ['analyte', 'category', 'value_type', 'material', 'description']

export function descriptionsToCsv(rows: DescRow[]): string {
  return toCsv(HEADERS, rows.map(r => [r.analyte, r.category ?? '', r.value_type ?? '', r.material ?? '', r.description ?? '']))
}

export function parseDescRows(cells: string[][]): DescRow[] {
  const rows = cells.length && cells[0][0]?.trim().toLowerCase() === 'analyte'
    ? cells.slice(1) : cells
  return rows
    .map(r => ({
      analyte: (r[0] ?? '').trim(),
      category: (r[1] ?? '').trim(),
      value_type: (r[2] ?? '').trim(),
      material: (r[3] ?? '').trim(),
      description: (r[4] ?? '').trim(),
    }))
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

- [ ] **Step 4: Update `applyDescPlan` in `labDescriptions.ts` to upsert full rows**

The `DescRow` upsert in `applyDescPlan` (src/lib/labDescriptions.ts) now carries the extra columns, which is correct — `.upsert(rows, { onConflict: 'analyte' })` writes them. No code change needed if `applyDescPlan` already types its rows as `DescRow[]`; confirm it compiles against the new `DescRow`. If tsc complains that `DescRow` is missing `description` narrowing, leave the body as-is — the shape is compatible.

- [ ] **Step 5: Run the CSV test to verify it passes**

Run: `npm test -- labDescriptionsCsv`
Expected: PASS.

- [ ] **Step 6: Update `Settings.tsx` `LabDescriptionsSection`**

In `src/pages/Settings.tsx`, add the import:

```tsx
import { upsertDescription, deleteDescription, applyDescPlan, updateAnalyteMeta } from '../lib/labDescriptions'
```

Replace `handleExport` to emit the full rows and the render to show dropdowns. Replace the `handleExport` function:

```tsx
  function handleExport() {
    const csv = descriptionsToCsv(descriptions.map(d => ({
      analyte: d.analyte,
      category: d.category ?? '',
      value_type: d.value_type ?? '',
      material: d.material ?? '',
      description: d.description ?? '',
    })))
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = 'analyte-dictionary.csv'; a.click()
    URL.revokeObjectURL(url)
  }
```

Add a meta-edit handler after `handleDelete`:

```tsx
  async function handleMeta(analyte: string, patch: { category?: string; value_type?: string }) {
    setError(null)
    try { await updateAnalyteMeta(analyte, patch); await reload() }
    catch (err: any) { setError(err?.message ?? 'Could not update.') }
  }
```

Replace the heading, hint, and list `<li>` markup so each row shows the dropdowns:

```tsx
      <h2 className={styles.heading}>Analyte dictionary</h2>
      <p className={styles.hint}>What each analyte means and how it charts. Category &amp; type drive the chart. Edit here or via CSV.</p>
```

```tsx
      <ul className={styles.list}>
        {descriptions.map(d => (
          <li key={d.analyte} className={styles.item}>
            <span><strong>{d.analyte}</strong>{d.description ? ` — ${d.description}` : ''}</span>
            <select value={d.category ?? ''} onChange={e => handleMeta(d.analyte, { category: e.target.value })} aria-label={`${d.analyte} category`}>
              <option value="">—</option>
              {['allergy', 'hematology', 'infection', 'chemistry', 'liver-kidney', 'inflammation', 'vitamins'].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select value={d.value_type ?? ''} onChange={e => handleMeta(d.analyte, { value_type: e.target.value })} aria-label={`${d.analyte} value type`}>
              <option value="">—</option>
              <option value="number">number</option>
              <option value="binary">binary</option>
            </select>
            <button className={styles.remove} onClick={() => handleDelete(d.analyte)} aria-label={`Delete ${d.analyte}`}>×</button>
          </li>
        ))}
      </ul>
```

- [ ] **Step 7: Verify it builds and the suite is green**

Run: `npm run build`
Expected: PASS.
Run: `npm test`
Expected: PASS (all lib suites).

- [ ] **Step 8: Commit**

```bash
git add src/lib/labDescriptionsCsv.ts src/lib/labDescriptionsCsv.test.ts src/lib/labDescriptions.ts src/pages/Settings.tsx
git commit -m "feat: analyte dictionary in Settings (category/value_type dropdowns, CSV columns)"
```

---

## Manual verification (after Task 10)

Not automated — run once in a browser against a migrated Supabase project:

1. Apply `migrations/2026-07-20-lab-classification.sql` in the Supabase SQL editor.
2. On `/tests`, import a **multi-sample** paste (ROE/VERI/PLASMA) — confirm each sample appears as its own log row and saves.
3. Confirm an allergy IgE analyte renders the class scale; a chemistry analyte (HbA1c) a time-series; a `negatiivne` analyte the strip with ●/○ cue.
4. Confirm a censored analyte (CRP `<0.6`, Vitamin D `>50` style) shows a literal `<`/`>` glyph and dashed adjacent line segments.
5. In Settings → Analyte dictionary, change a category/value_type and confirm the chart type updates on reload; export CSV, re-import, confirm no data loss.

---

## Self-review notes

- **Spec coverage:** §1 raw_text (Task 1, 7, 8) · §2 parser hardening/multi-session/censored bound (Tasks 2, 3) · §3 auto-classify seven categories (Task 4, seeded in Task 8) · §4 chart resolver + allergy scale + censored glyphs + dashed segments + unified tooltip + strip second cue (Tasks 5, 6, 9) · §5 import UX (Task 8) · §6 Settings dictionary + CSV (Task 10) · migration §1 (Task 1). All covered.
- **Type consistency:** `AnalyteMeta` (labClassify) ↔ `seedAnalyteMeta` rows ↔ `guessMeta` output; `ScaledPoint` shared by `scalePoints` consumers and `lineSegments`; `DescRow` five-column shape used by CSV + Settings + `applyDescPlan`; `censored: '<' | '>' | null` consistent across `censoredDir`, `NumPoint`, `ScaledPoint`, `positionFor`.
- **Ordering caveat (Task 4):** `CRP` must classify as `inflammation` not `liver-kidney` — verified because `liver-kidney`'s creatinine keyword is `crea` (not a substring of "crp") and `inflammation` precedes nothing that shadows it; the `it.each` cases lock this.
