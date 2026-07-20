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

const META_RE = /Proovinõu\s*ID:\s*([^\s,]+)/i
const MATERIAL_RE = /Proovimaterjal:\s*([^,]+)/i
const TAKEN_RE = /Võetud:\s*([\d.]+\s+[\d:]+)/i
const VERDICT_RE = /^Tulemuse\s*tõlgendus:\s*(.+)$/i
const NOTE_RE = /^Tulemuse\s*märkus:\s*(.+)$/i
// A date like 07.07.2026 marks the restated material line ("Seerum - dd.mm.yyyy").
const DATE_RE = /\d{1,2}\.\d{1,2}\.\d{4}/
// Section/heading noise that is neither a panel nor a result.
const NOISE = new Set(['laboratoorsed uuringud'])

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
