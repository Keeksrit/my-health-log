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
