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
