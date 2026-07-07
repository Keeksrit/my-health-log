import { describe, it, expect } from 'vitest'
import { normalizeUnitName } from './units'

describe('normalizeUnitName', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeUnitName('  tbsp  ')).toBe('tbsp')
  })

  it('collapses internal whitespace', () => {
    expect(normalizeUnitName('fluid   ounce')).toBe('fluid ounce')
  })

  it('throws on empty or whitespace-only input', () => {
    expect(() => normalizeUnitName('   ')).toThrow('Unit name cannot be empty')
  })
})
