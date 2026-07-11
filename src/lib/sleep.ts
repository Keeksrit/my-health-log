import { supabase } from './supabase'

export interface SleepNight {
  date: string          // YYYY-MM-DD, the wake day (per Oura)
  bedtime_start: string // ISO timestamptz
  bedtime_end: string   // ISO timestamptz
}

export interface SleepSegment {
  startMin: number      // minutes from the day's midnight, 0..1440
  endMin: number
  night: SleepNight
}

const DAY_MS = 24 * 60 * 60 * 1000

// All asleep intervals that fall within one local calendar day, clipped to
// [0, 1440] minutes. A night crossing midnight yields a late-evening segment
// on the prior day and an early-morning segment on the wake day.
export function sleepSegmentsForDay(nights: SleepNight[], dayKey: string): SleepSegment[] {
  const dayStart = new Date(`${dayKey}T00:00:00`).getTime()
  const dayEnd = dayStart + DAY_MS
  const segs: SleepSegment[] = []
  for (const night of nights) {
    const start = new Date(night.bedtime_start).getTime()
    const end = new Date(night.bedtime_end).getTime()
    if (!(end > start)) continue
    const s = Math.max(start, dayStart)
    const e = Math.min(end, dayEnd)
    if (e <= s) continue
    segs.push({ startMin: (s - dayStart) / 60000, endMin: (e - dayStart) / 60000, night })
  }
  return segs
}

export function sleepTooltip(night: SleepNight): string {
  const opts = { hour: '2-digit', minute: '2-digit', hour12: false } as const
  const bed = new Date(night.bedtime_start).toLocaleTimeString(undefined, opts)
  const wake = new Date(night.bedtime_end).toLocaleTimeString(undefined, opts)
  const mins = Math.round(
    (new Date(night.bedtime_end).getTime() - new Date(night.bedtime_start).getTime()) / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${bed} → ${wake} · ${h}h${String(m).padStart(2, '0')}m`
}

// Reads the sports schema via the shared health-pinned singleton, retargeting
// just this query. Rows missing either bedtime can't be drawn, so drop them.
export async function fetchSleep(): Promise<SleepNight[]> {
  const { data, error } = await supabase
    .schema('sports')
    .from('oura_sleep')
    .select('date, bedtime_start, bedtime_end')
    .order('date', { ascending: false })
  if (error) throw error
  return (data as SleepNight[]).filter(n => n.bedtime_start && n.bedtime_end)
}
