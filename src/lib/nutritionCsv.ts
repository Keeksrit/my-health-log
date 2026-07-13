import type { Food, Ingredient, LogEntry } from '../types/nutrition'

export type SyncMode = 'sync' | 'add'

export interface IngredientCsvRow { id: string; name: string; type: string | null }
export interface FoodCsvRow { id: string; name: string; type: string | null; ingredientNames: string[] }
export interface LogCsvRow { id: string; food: string; amount: string; unit: string; eatenAt: string }

export interface SyncPlan<T> {
  inserts: T[]      // blank id
  updates: T[]      // id present in DB
  unknownIds: T[]   // non-blank id absent from DB
  deletes: string[] // DB ids absent from the file (sync mode only)
}

// ── Serialization ──────────────────────────────────────
function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v
}

export function toCsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

function pad2(n: number): string { return String(n).padStart(2, '0') }

// Parse a log entry's date-time string into a local Date.
// Accepts our own ISO export (`2026-07-10T10:00`) and European Excel's
// `DD.MM.YYYY HH:MM[:SS]`. Returns null for empty/unparseable input.
export function parseLocalDateTime(s: string): Date | null {
  const t = s.trim()
  if (!t) return null
  const eu = /^(\d{1,2})\.(\d{1,2})\.(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t)
  if (eu) {
    const [, d, mo, y, h, mi, se] = eu
    const date = new Date(+y, +mo - 1, +d, +h, +mi, se ? +se : 0)
    return isNaN(date.getTime()) ? null : date
  }
  const date = new Date(t)
  return isNaN(date.getTime()) ? null : date
}

export function formatLocalDateTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
    `T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export function ingredientsToCsv(rows: Ingredient[]): string {
  return toCsv(['id', 'name', 'type'],
    rows.map(i => [i.id, i.name, i.type ?? '']))
}

export function foodsToCsv(rows: Food[]): string {
  return toCsv(['id', 'name', 'type', 'ingredients'],
    rows.map(f => [
      f.id, f.name, f.type ?? '',
      (f.ingredients ?? []).map(i => i.name).join(', '),
    ]))
}

export function logToCsv(rows: LogEntry[]): string {
  return toCsv(['id', 'food', 'amount', 'unit', 'eaten_at'],
    rows.map(e => [
      e.id,
      e.food?.name ?? 'Unknown food',
      e.amount != null ? String(e.amount) : '',
      e.unit ?? '',
      formatLocalDateTime(e.eaten_at),
    ]))
}

// ── Parsing (drop an optional header row whose first cell is "id") ──
function dropHeader(rows: string[][]): string[][] {
  if (rows.length && rows[0][0]?.trim().toLowerCase() === 'id') return rows.slice(1)
  return rows
}

export function parseIngredientRows(rows: string[][]): IngredientCsvRow[] {
  return dropHeader(rows).map(r => ({
    id: (r[0] ?? '').trim(),
    name: (r[1] ?? '').trim(),
    type: (r[2] ?? '').trim() || null,
  }))
}

export function parseFoodRows(rows: string[][]): FoodCsvRow[] {
  return dropHeader(rows).map(r => ({
    id: (r[0] ?? '').trim(),
    name: (r[1] ?? '').trim(),
    type: (r[2] ?? '').trim() || null,
    ingredientNames: (r[3] ?? '').split(',').map(s => s.trim()).filter(Boolean),
  }))
}

export function parseLogRows(rows: string[][]): LogCsvRow[] {
  return dropHeader(rows).map(r => ({
    id: (r[0] ?? '').trim(),
    food: (r[1] ?? '').trim(),
    amount: (r[2] ?? '').trim(),
    unit: (r[3] ?? '').trim(),
    eatenAt: (r[4] ?? '').trim(),
  }))
}

// ── Validation ─────────────────────────────────────────
export function normalizeLogAmountUnit(
  amountRaw: string, unitRaw: string, allowedUnits: Set<string>
): { amount: number | null; unit: string | null } {
  const a = amountRaw.trim()
  if (!a) return { amount: null, unit: null }
  const amount = Number(a)
  if (!(amount > 0)) throw new Error(`Bad amount "${amountRaw}"`)
  const unit = unitRaw.trim()
  if (!allowedUnits.has(unit)) throw new Error(`Bad unit "${unitRaw}"`)
  return { amount, unit }
}

// ── Sync plan ──────────────────────────────────────────
export function computeSyncPlan<T extends { id: string }>(
  fileRows: T[], dbIds: string[], mode: SyncMode
): SyncPlan<T> {
  const dbSet = new Set(dbIds)
  const inserts = fileRows.filter(r => !r.id)
  if (mode === 'add') {
    return { inserts, updates: [], unknownIds: [], deletes: [] }
  }
  const updates = fileRows.filter(r => r.id && dbSet.has(r.id))
  const unknownIds = fileRows.filter(r => r.id && !dbSet.has(r.id))
  const fileIdSet = new Set(fileRows.map(r => r.id).filter(Boolean))
  const deletes = dbIds.filter(id => !fileIdSet.has(id))
  return { inserts, updates, unknownIds, deletes }
}

// Rows a log sync should create: blank-id rows get a DB-generated id; rows whose
// id isn't in the DB (unknownIds) are inserted keeping that id, so the DB mirrors
// the file exactly and an export→import round-trip preserves ids.
export function logsToInsert(
  plan: Pick<SyncPlan<LogCsvRow>, 'inserts' | 'unknownIds'>
): { id?: string; row: LogCsvRow }[] {
  return [
    ...plan.inserts.map(row => ({ row })),
    ...plan.unknownIds.map(row => ({ id: row.id, row })),
  ]
}
