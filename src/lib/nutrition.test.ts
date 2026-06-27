import { describe, it, expect } from 'vitest'
import {
  matchFoodByIngredientSet, parseCsv, distinctIngredientTypes,
  diffIngredientLinks, splitDateTime, combineDateTime, validateLogType,
} from './nutrition'
import type { Food, Ingredient } from '../types/nutrition'

function ing(id: string, name: string, type: string | null = null): Ingredient {
  return { id, name, type, created_at: '' }
}
function food(id: string, name: string, ingredients: Ingredient[]): Food {
  return { id, name, created_at: '', ingredients }
}

describe('matchFoodByIngredientSet', () => {
  const pasta1 = food('f1', 'Pepperoni Pasta', [ing('a', 'pepperoni'), ing('b', 'coconut milk'), ing('c', 'pasta')])
  const pasta2 = food('f2', 'Pepperoni Pasta 2', [ing('a', 'pepperoni'), ing('d', 'heavy cream'), ing('c', 'pasta')])
  const foods = [pasta1, pasta2]

  it('matches an exact set regardless of order', () => {
    expect(matchFoodByIngredientSet(foods, ['c', 'a', 'b'])).toBe(pasta1)
  })

  it('distinguishes foods that differ by one ingredient', () => {
    expect(matchFoodByIngredientSet(foods, ['a', 'd', 'c'])).toBe(pasta2)
  })

  it('returns null when no food has that exact set', () => {
    expect(matchFoodByIngredientSet(foods, ['a', 'c'])).toBeNull()
  })

  it('matches an empty set against a food with no ingredients', () => {
    const plain = food('f3', 'Water', [])
    expect(matchFoodByIngredientSet([plain], [])).toBe(plain)
  })
})

describe('parseCsv', () => {
  it('parses simple rows', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']])
  })

  it('handles quoted fields containing commas', () => {
    expect(parseCsv('name,ingredients\nPasta,"pepperoni, pasta, cream"')).toEqual([
      ['name', 'ingredients'],
      ['Pasta', 'pepperoni, pasta, cream'],
    ])
  })

  it('handles escaped double quotes inside a quoted field', () => {
    expect(parseCsv('"he said ""hi"""')).toEqual([['he said "hi"']])
  })

  it('ignores a trailing newline', () => {
    expect(parseCsv('a,b\n')).toEqual([['a', 'b']])
  })
})

describe('distinctIngredientTypes', () => {
  it('returns distinct types in canonical order, dropping nulls', () => {
    const list = [
      ing('1', 'pasta', 'Grains & Starches'),
      ing('2', 'pepperoni', 'Proteins'),
      ing('3', 'olive oil', 'Fats & Oils'),
      ing('4', 'mystery', null),
      ing('5', 'penne', 'Grains & Starches'),
    ]
    expect(distinctIngredientTypes(list)).toEqual(['Grains & Starches', 'Proteins', 'Fats & Oils'])
  })

  it('returns an empty array when all types are null', () => {
    expect(distinctIngredientTypes([ing('1', 'x', null)])).toEqual([])
  })
})

describe('diffIngredientLinks', () => {
  it('reports added and removed ids, ignoring unchanged', () => {
    expect(diffIngredientLinks(['a', 'b', 'c'], ['b', 'c', 'd'])).toEqual({
      toAdd: ['d'], toRemove: ['a'],
    })
  })
  it('is empty when the sets match regardless of order', () => {
    expect(diffIngredientLinks(['a', 'b'], ['b', 'a'])).toEqual({ toAdd: [], toRemove: [] })
  })
  it('handles empty current/next', () => {
    expect(diffIngredientLinks([], ['a'])).toEqual({ toAdd: ['a'], toRemove: [] })
    expect(diffIngredientLinks(['a'], [])).toEqual({ toAdd: [], toRemove: ['a'] })
  })
})

describe('validateLogType', () => {
  it('accepts a known type case-insensitively, normalised to lowercase', () => {
    expect(validateLogType('Main')).toBe('main')
    expect(validateLogType('salty snack')).toBe('salty snack')
  })
  it('returns null for blank input', () => {
    expect(validateLogType('')).toBeNull()
    expect(validateLogType('   ')).toBeNull()
  })
  it('throws for an unknown type', () => {
    expect(() => validateLogType('brunch')).toThrow()
  })
})

describe('split/combineDateTime', () => {
  it('round-trips a local wall-clock time', () => {
    const iso = combineDateTime('2026-06-27', '08:30')
    expect(splitDateTime(iso)).toEqual({ date: '2026-06-27', time: '08:30' })
  })
  it('splitDateTime zero-pads month, day, hour, minute', () => {
    const iso = combineDateTime('2026-01-05', '07:05')
    expect(splitDateTime(iso)).toEqual({ date: '2026-01-05', time: '07:05' })
  })
})
