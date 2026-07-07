import { describe, it, expect } from 'vitest'
import { normalizeFoodTypeName } from './foodTypes'

describe('normalizeFoodTypeName', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeFoodTypeName('  drink  ')).toBe('drink')
  })

  it('collapses internal whitespace', () => {
    expect(normalizeFoodTypeName('salty   snack')).toBe('salty snack')
  })

  it('throws on empty or whitespace-only input', () => {
    expect(() => normalizeFoodTypeName('   ')).toThrow('Food type name cannot be empty')
  })
})
