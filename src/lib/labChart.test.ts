import { describe, it, expect } from 'vitest'
import { computeYDomain, scalePoints, refBandRect, eventLinesX, niceTicks } from './labChart'

const DIMS = { width: 100, height: 100, padL: 10, padR: 10, padT: 10, padB: 10 }
// plot area: x in [10, 90] (width 80), y in [10, 90] (height 80)

describe('computeYDomain', () => {
  it('spans data and ref bounds with padding', () => {
    const d = computeYDomain([3, 5], 2, 6)
    expect(d.yMin).toBeLessThanOrEqual(2)
    expect(d.yMax).toBeGreaterThanOrEqual(6)
  })
  it('handles a single value with no ref', () => {
    const d = computeYDomain([5], null, null)
    expect(d.yMin).toBeLessThan(5)
    expect(d.yMax).toBeGreaterThan(5)
  })
})

describe('scalePoints', () => {
  it('maps time to x and value to inverted y within the plot area', () => {
    const pts = scalePoints([{ t: 0, v: 0 }, { t: 100, v: 100 }], DIMS, 0, 100, 0, 100)
    expect(pts[0]).toEqual({ x: 10, y: 90 }) // earliest, lowest → left, bottom
    expect(pts[1]).toEqual({ x: 90, y: 10 }) // latest, highest → right, top
  })
})

describe('refBandRect', () => {
  it('spans the full plot width and the ref range', () => {
    const r = refBandRect(0, 50, DIMS, 0, 100)!
    expect(r.x).toBe(10)
    expect(r.width).toBe(80)
    expect(r.y).toBe(50)     // top of band = y for value 50
    expect(r.height).toBe(40) // down to value 0 (y=90)
  })
  it('clips a one-sided <max band to the plot bottom', () => {
    const r = refBandRect(null, 50, DIMS, 0, 100)!
    expect(r.y).toBe(50)
    expect(r.height).toBe(40) // 50 down to plot bottom (y=90)
  })
  it('returns null when both bounds are null', () => {
    expect(refBandRect(null, null, DIMS, 0, 100)).toBeNull()
  })
})

describe('eventLinesX', () => {
  it('keeps in-range dates and drops out-of-range', () => {
    expect(eventLinesX([50, 150], DIMS, 0, 100, )).toEqual([50])
  })
})

describe('niceTicks', () => {
  it('returns ascending ticks covering the domain', () => {
    const ticks = niceTicks(0, 10, 5)
    expect(ticks[0]).toBeLessThanOrEqual(0)
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(10)
    for (let i = 1; i < ticks.length; i++) expect(ticks[i]).toBeGreaterThan(ticks[i - 1])
  })
})
