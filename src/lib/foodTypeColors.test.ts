import { describe, it, expect } from 'vitest'
import { PALETTE, FALLBACK_COLOR, colorForType } from './foodTypeColors'

const types = [
  { name: 'Fruit', color: '#6AA84F' },
  { name: 'Dessert', color: null },
]

describe('PALETTE', () => {
  it('is a non-empty list of hex colors', () => {
    expect(PALETTE.length).toBeGreaterThan(0)
    for (const c of PALETTE) expect(c).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })
})

describe('colorForType', () => {
  it("returns a matched type's color", () => {
    expect(colorForType('Fruit', types)).toBe('#6AA84F')
  })

  it('returns grey when the matched type has no color', () => {
    expect(colorForType('Dessert', types)).toBe(FALLBACK_COLOR)
  })

  it('returns grey for an unknown type name', () => {
    expect(colorForType('Nope', types)).toBe(FALLBACK_COLOR)
  })

  it('returns grey for null or undefined type name', () => {
    expect(colorForType(null, types)).toBe(FALLBACK_COLOR)
    expect(colorForType(undefined, types)).toBe(FALLBACK_COLOR)
  })
})
