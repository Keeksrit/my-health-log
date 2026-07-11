import { supabase } from './supabase'

export interface TrainingSession {
  date: string             // YYYY-MM-DD
  start_time?: string      // HH:MM:SS (local)
  type: string             // SessionType from sports app, kept loose here
  duration_seconds?: number
  avg_hr?: number | null
}

export interface TrainingSegment {
  startMin: number         // minutes from the day's midnight, 0..1440
  endMin: number
  session: TrainingSession
  estimated: boolean       // true when start_time and/or duration was defaulted
}

const DAY_MS = 24 * 60 * 60 * 1000
export const DEFAULT_START_TIME = '20:00:00'
export const DEFAULT_DURATION_S = 3600

// All portions of each session that fall within one local calendar day, clipped
// to [0, 1440] minutes. A session crossing midnight yields a late-evening segment
// on its own day and an early-morning segment on the next day. Missing start_time
// or duration is filled from the defaults and flags the segment as estimated.
export function trainingSegmentsForDay(sessions: TrainingSession[], dayKey: string): TrainingSegment[] {
  const dayStart = new Date(`${dayKey}T00:00:00`).getTime()
  const dayEnd = dayStart + DAY_MS
  const segs: TrainingSegment[] = []
  for (const s of sessions) {
    const estimated = !s.start_time || s.duration_seconds == null
    const start = new Date(`${s.date}T${s.start_time ?? DEFAULT_START_TIME}`).getTime()
    const durS = s.duration_seconds ?? DEFAULT_DURATION_S
    const end = start + durS * 1000
    if (!(end > start)) continue                 // drops zero-length + NaN (unparseable) rows
    const clipS = Math.max(start, dayStart)
    const clipE = Math.min(end, dayEnd)
    if (clipE <= clipS) continue
    segs.push({
      startMin: (clipS - dayStart) / 60000,
      endMin: (clipE - dayStart) / 60000,
      session: s,
      estimated,
    })
  }
  return segs
}

export function trainingTooltip(s: TrainingSession): string {
  const hhmm = (s.start_time ?? DEFAULT_START_TIME).slice(0, 5)
  const mins = Math.round((s.duration_seconds ?? DEFAULT_DURATION_S) / 60)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const parts = [s.type]
  if (s.avg_hr != null) parts.push(`avg ${s.avg_hr} bpm`)
  parts.push(hhmm, `${h}h${String(m).padStart(2, '0')}m`)
  return parts.join(' · ')
}

// Reads the sports schema via the shared health-pinned singleton, retargeting
// just this query. Rows without a date can't be placed, so drop them.
export async function fetchTraining(): Promise<TrainingSession[]> {
  const { data, error } = await supabase
    .schema('sports')
    .from('sessions')
    .select('date, start_time, type, duration_seconds, avg_hr')
    .order('date', { ascending: false })
  if (error) throw error
  return (data as TrainingSession[]).filter(s => s.date)
}
