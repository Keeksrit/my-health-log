import { describe, it, expect } from 'vitest'
import { CAP_RAST_THRESHOLDS, positionFor } from './labAllergyScale'

describe('CAP_RAST_THRESHOLDS', () => {
  it('has the six standard CAP-RAST thresholds', () => {
    expect(CAP_RAST_THRESHOLDS).toEqual([0.35, 0.70, 3.5, 17.5, 50, 100])
  })
})

describe('positionFor', () => {
  it('below 0.35 → class 0, clamped left, capped <', () => {
    expect(positionFor(0.1)).toEqual({ x: 0, className: 0, capped: '<' })
  })
  it('censored < → class 0 regardless of bound', () => {
    expect(positionFor(0.35, '<')).toEqual({ x: 0, className: 0, capped: '<' })
  })
  it('at/above 100 → class 6, clamped right, capped >', () => {
    expect(positionFor(100)).toEqual({ x: 1, className: 6, capped: '>' })
    expect(positionFor(250)).toEqual({ x: 1, className: 6, capped: '>' })
  })
  it('censored > → class 6', () => {
    expect(positionFor(50, '>')).toEqual({ x: 1, className: 6, capped: '>' })
  })
  it('a mid value lands in its class cell', () => {
    // 0.35 is the bottom of class 1 → start of the 2nd of 7 cells → x = 1/7.
    const p = positionFor(0.35)
    expect(p.className).toBe(1)
    expect(p.capped).toBeNull()
    expect(p.x).toBeCloseTo(1 / 7, 5)
  })
  it('interpolates within a cell', () => {
    // Halfway between 0.35 and 0.70 → middle of class-1 cell → x = 1.5/7.
    const p = positionFor((0.35 + 0.70) / 2)
    expect(p.className).toBe(1)
    expect(p.x).toBeCloseTo(1.5 / 7, 5)
  })
})
