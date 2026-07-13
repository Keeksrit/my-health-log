import { describe, it, expect } from 'vitest'
import {
  toCsv,
  formatLocalDateTime,
  parseFoodRows,
  parseLogRows,
  computeSyncPlan,
  normalizeLogAmountUnit,
  parseLocalDateTime,
} from './nutritionCsv'
import { parseCsv } from './nutrition'

describe('toCsv', () => {
  it('quotes cells containing commas, quotes, and newlines and round-trips through parseCsv', () => {
    const text = toCsv(['id', 'name', 'ingredients'], [
      ['1', 'Rye bread', 'rye,water,salt'],
      ['2', 'She said "hi"', 'line1\nline2'],
    ])
    const parsed = parseCsv(text.trim())
    expect(parsed[0]).toEqual(['id', 'name', 'ingredients'])
    expect(parsed[1]).toEqual(['1', 'Rye bread', 'rye,water,salt'])
    expect(parsed[2]).toEqual(['2', 'She said "hi"', 'line1\nline2'])
  })
})

describe('formatLocalDateTime', () => {
  it('formats an ISO instant as local YYYY-MM-DDTHH:MM', () => {
    // Build the expected value from the same Date so the test is timezone-agnostic.
    const iso = new Date(2026, 6, 5, 9, 30).toISOString()
    expect(formatLocalDateTime(iso)).toBe('2026-07-05T09:30')
  })
})

describe('parseLocalDateTime', () => {
  it('parses ISO local date-times', () => {
    const d = parseLocalDateTime('2026-07-10T10:00')!
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()])
      .toEqual([2026, 6, 10, 10, 0])
  })

  it('parses European DD.MM.YYYY HH:MM as local time (not MM.DD)', () => {
    const d = parseLocalDateTime('10.07.2026 10:00')!
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()])
      .toEqual([2026, 6, 10, 10, 0])
  })

  it('parses European date-time with seconds', () => {
    const d = parseLocalDateTime('04.06.2026 22:30:15')!
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()])
      .toEqual([2026, 5, 4, 22, 30, 15])
  })

  it('returns null for empty or unparseable input', () => {
    expect(parseLocalDateTime('')).toBeNull()
    expect(parseLocalDateTime('   ')).toBeNull()
    expect(parseLocalDateTime('not a date')).toBeNull()
  })
})

describe('parseFoodRows', () => {
  it('drops the header row and splits the ingredients cell', () => {
    const rows = [
      ['id', 'name', 'type', 'ingredients'],
      ['ab1', 'Rye bread', 'main', 'rye, water, salt'],
      ['', 'Coffee', 'drink', ''],
    ]
    expect(parseFoodRows(rows)).toEqual([
      { id: 'ab1', name: 'Rye bread', type: 'main', ingredientNames: ['rye', 'water', 'salt'] },
      { id: '', name: 'Coffee', type: 'drink', ingredientNames: [] },
    ])
  })
})

describe('parseLogRows', () => {
  it('parses log rows without a type column', () => {
    const rows = [
      ['id', 'food', 'amount', 'unit', 'eaten_at'],
      ['x1', 'Rye bread', '2', 'serving', '2026-07-05T09:00'],
    ]
    expect(parseLogRows(rows)).toEqual([
      { id: 'x1', food: 'Rye bread', amount: '2', unit: 'serving', eatenAt: '2026-07-05T09:00' },
    ])
  })
})

describe('computeSyncPlan', () => {
  const file = [
    { id: 'a', name: 'A' },   // exists → update
    { id: '', name: 'C' },    // blank → insert
    { id: 'z', name: 'Z' },   // non-blank, not in db → unknown
  ]
  const dbIds = ['a', 'b']    // b missing from file → delete (sync)

  it('sync mode: update matched, insert blank, delete missing, flag unknown', () => {
    const plan = computeSyncPlan(file, dbIds, 'sync')
    expect(plan.updates.map(r => r.id)).toEqual(['a'])
    expect(plan.inserts.map(r => r.name)).toEqual(['C'])
    expect(plan.deletes).toEqual(['b'])
    expect(plan.unknownIds.map(r => r.id)).toEqual(['z'])
  })

  it('add mode: insert blank only, no updates or deletes', () => {
    const plan = computeSyncPlan(file, dbIds, 'add')
    expect(plan.inserts.map(r => r.name)).toEqual(['C'])
    expect(plan.updates).toEqual([])
    expect(plan.deletes).toEqual([])
    expect(plan.unknownIds).toEqual([])
  })
})

describe('normalizeLogAmountUnit', () => {
  const allowed = new Set(['g', 'serving'])

  it('returns null amount and unit when amount is blank', () => {
    expect(normalizeLogAmountUnit('', 'g', allowed)).toEqual({ amount: null, unit: null })
  })

  it('returns amount and unit when valid', () => {
    expect(normalizeLogAmountUnit('2', 'serving', allowed)).toEqual({ amount: 2, unit: 'serving' })
  })

  it('throws on a non-positive amount', () => {
    expect(() => normalizeLogAmountUnit('0', 'g', allowed)).toThrow('amount')
  })

  it('throws on an unknown unit', () => {
    expect(() => normalizeLogAmountUnit('2', 'cups', allowed)).toThrow('unit')
  })
})
