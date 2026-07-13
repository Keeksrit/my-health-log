import { describe, it, expect } from 'vitest'
import type { LogEntry } from '../types/nutrition'
import { dayKeyOf, entryVisibleByType, filterLog } from './nutritionFilters'

function entry(id: string, eaten_at: string, type: string | null): LogEntry {
  return {
    id, food_id: 'f-' + id, amount: null, unit: null,
    eaten_at, created_at: eaten_at,
    food: { id: 'f-' + id, name: 'Food ' + id, type, created_at: eaten_at },
  }
}

describe('dayKeyOf', () => {
  it('formats local date parts as YYYY-MM-DD zero-padded', () => {
    expect(dayKeyOf(new Date(2026, 6, 3, 9, 5))).toBe('2026-07-03')
    expect(dayKeyOf(new Date(2026, 11, 25, 0, 0))).toBe('2026-12-25')
  })
})

describe('entryVisibleByType', () => {
  const salty = entry('1', '2026-07-03T10:00', 'Salty snack')
  const untyped = entry('2', '2026-07-03T11:00', null)

  it('shows a typed entry when its type is not hidden', () => {
    expect(entryVisibleByType(salty, new Set(), false)).toBe(true)
  })
  it('hides a typed entry when its type is hidden', () => {
    expect(entryVisibleByType(salty, new Set(['Salty snack']), false)).toBe(false)
  })
  it('shows an untyped entry unless No-type is hidden', () => {
    expect(entryVisibleByType(untyped, new Set(), false)).toBe(true)
    expect(entryVisibleByType(untyped, new Set(), true)).toBe(false)
  })
  it('does not hide an untyped entry just because some type is hidden', () => {
    expect(entryVisibleByType(untyped, new Set(['Salty snack']), false)).toBe(true)
  })
})

describe('filterLog', () => {
  const incompleteDay = entry('1', '2026-07-01T10:00', 'Main')
  const goodDaySalty = entry('2', '2026-07-02T10:00', 'Salty snack')
  const goodDayMain = entry('3', '2026-07-02T12:00', 'Main')
  const log = [incompleteDay, goodDaySalty, goodDayMain]
  const incompleteDays = new Set(['2026-07-01'])

  it('drops entries on incomplete days when hideIncomplete is on', () => {
    const out = filterLog(log, { hideIncomplete: true, incompleteDays, hiddenTypes: new Set(), hideNoType: false })
    expect(out.map(e => e.id)).toEqual(['2', '3'])
  })
  it('keeps incomplete-day entries when hideIncomplete is off', () => {
    const out = filterLog(log, { hideIncomplete: false, incompleteDays, hiddenTypes: new Set(), hideNoType: false })
    expect(out.map(e => e.id)).toEqual(['1', '2', '3'])
  })
  it('drops entries whose type is hidden', () => {
    const out = filterLog(log, { hideIncomplete: false, incompleteDays, hiddenTypes: new Set(['Salty snack']), hideNoType: false })
    expect(out.map(e => e.id)).toEqual(['1', '3'])
  })
  it('applies both filters together', () => {
    const out = filterLog(log, { hideIncomplete: true, incompleteDays, hiddenTypes: new Set(['Salty snack']), hideNoType: false })
    expect(out.map(e => e.id)).toEqual(['3'])
  })
})
