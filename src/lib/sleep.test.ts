import { describe, it, expect } from 'vitest'
import { sleepSegmentsForDay, sleepTooltip, type SleepNight } from './sleep'

const night = (date: string, start: string, end: string): SleepNight => ({
  date, bedtime_start: start, bedtime_end: end,
})

describe('sleepSegmentsForDay', () => {
  const crossMidnight = night('2026-07-11', '2026-07-10T23:00:00', '2026-07-11T07:00:00')

  it('returns the late-evening segment on the prior day', () => {
    const segs = sleepSegmentsForDay([crossMidnight], '2026-07-10')
    expect(segs).toHaveLength(1)
    expect(segs[0].startMin).toBe(23 * 60) // 1380
    expect(segs[0].endMin).toBe(1440)
    expect(segs[0].night).toBe(crossMidnight)
  })

  it('returns the early-morning segment on the wake day', () => {
    const segs = sleepSegmentsForDay([crossMidnight], '2026-07-11')
    expect(segs).toHaveLength(1)
    expect(segs[0].startMin).toBe(0)
    expect(segs[0].endMin).toBe(7 * 60) // 420
  })

  it('returns nothing for a day the night does not touch', () => {
    expect(sleepSegmentsForDay([crossMidnight], '2026-07-09')).toEqual([])
  })

  it('handles a night fully within one day', () => {
    const nap = night('2026-07-10', '2026-07-10T13:00:00', '2026-07-10T14:30:00')
    const segs = sleepSegmentsForDay([nap], '2026-07-10')
    expect(segs).toHaveLength(1)
    expect(segs[0].startMin).toBe(13 * 60)      // 780
    expect(segs[0].endMin).toBe(14 * 60 + 30)   // 870
  })

  it('skips zero-length or inverted intervals', () => {
    const bad = night('2026-07-10', '2026-07-10T07:00:00', '2026-07-10T07:00:00')
    expect(sleepSegmentsForDay([bad], '2026-07-10')).toEqual([])
  })
})

describe('sleepTooltip', () => {
  it('formats bedtime, wake, and time in bed', () => {
    const n = night('2026-07-11', '2026-07-10T23:15:00', '2026-07-11T07:02:00')
    expect(sleepTooltip(n)).toBe('23:15 → 07:02 · 7h47m')
  })
})
