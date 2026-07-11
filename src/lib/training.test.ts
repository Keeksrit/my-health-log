import { describe, it, expect } from 'vitest'
import { trainingSegmentsForDay, trainingTooltip, type TrainingSession } from './training'

const session = (over: Partial<TrainingSession> = {}): TrainingSession => ({
  date: '2026-07-10', type: 'run', ...over,
})

describe('trainingSegmentsForDay', () => {
  it('places a real session by start_time and duration, estimated=false', () => {
    const s = session({ start_time: '13:00:00', duration_seconds: 90 * 60 })
    const segs = trainingSegmentsForDay([s], '2026-07-10')
    expect(segs).toHaveLength(1)
    expect(segs[0].startMin).toBe(13 * 60)       // 780
    expect(segs[0].endMin).toBe(14 * 60 + 30)    // 870
    expect(segs[0].estimated).toBe(false)
    expect(segs[0].session).toBe(s)
  })

  it('falls back to 20:00 when start_time is missing, estimated=true', () => {
    const s = session({ duration_seconds: 60 * 60 })
    const segs = trainingSegmentsForDay([s], '2026-07-10')
    expect(segs[0].startMin).toBe(20 * 60)       // 1200
    expect(segs[0].endMin).toBe(21 * 60)         // 1260
    expect(segs[0].estimated).toBe(true)
  })

  it('falls back to 60 min when duration is missing, estimated=true', () => {
    const s = session({ start_time: '08:00:00' })
    const segs = trainingSegmentsForDay([s], '2026-07-10')
    expect(segs[0].startMin).toBe(8 * 60)        // 480
    expect(segs[0].endMin).toBe(9 * 60)          // 540
    expect(segs[0].estimated).toBe(true)
  })

  it('uses both fallbacks when start_time and duration are missing', () => {
    const segs = trainingSegmentsForDay([session()], '2026-07-10')
    expect(segs[0].startMin).toBe(20 * 60)       // 1200
    expect(segs[0].endMin).toBe(21 * 60)         // 1260
    expect(segs[0].estimated).toBe(true)
  })

  it('splits a cross-midnight session across two days (tail on start day)', () => {
    const s = session({ start_time: '23:00:00', duration_seconds: 180 * 60 })
    const segs = trainingSegmentsForDay([s], '2026-07-10')
    expect(segs).toHaveLength(1)
    expect(segs[0].startMin).toBe(23 * 60)       // 1380
    expect(segs[0].endMin).toBe(1440)
    expect(segs[0].estimated).toBe(false)
  })

  it('splits a cross-midnight session across two days (head on next day)', () => {
    const s = session({ start_time: '23:00:00', duration_seconds: 180 * 60 })
    const segs = trainingSegmentsForDay([s], '2026-07-11')
    expect(segs).toHaveLength(1)
    expect(segs[0].startMin).toBe(0)
    expect(segs[0].endMin).toBe(2 * 60)          // 120
  })

  it('returns nothing for a day the session does not touch', () => {
    const s = session({ start_time: '13:00:00', duration_seconds: 60 * 60 })
    expect(trainingSegmentsForDay([s], '2026-07-11')).toEqual([])
  })

  it('skips zero-length or unparseable sessions', () => {
    expect(trainingSegmentsForDay([session({ start_time: '10:00:00', duration_seconds: 0 })], '2026-07-10')).toEqual([])
  })
})

describe('trainingTooltip', () => {
  it('includes type, avg_hr, start and duration', () => {
    const s = session({ type: 'run', start_time: '13:00:00', duration_seconds: 90 * 60, avg_hr: 142 })
    expect(trainingTooltip(s)).toBe('run · avg 142 bpm · 13:00 · 1h30m')
  })

  it('omits avg_hr when null and uses fallbacks for time/duration', () => {
    const s = session({ type: 'gym', avg_hr: null })
    expect(trainingTooltip(s)).toBe('gym · 20:00 · 1h00m')
  })
})
