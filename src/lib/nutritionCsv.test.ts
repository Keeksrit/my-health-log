import { describe, it, expect } from 'vitest'
import {
  toCsv,
  formatLocalDateTime,
  parseFoodRows,
  parseLogRows,
  computeSyncPlan,
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
