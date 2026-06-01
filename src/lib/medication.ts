import { supabase } from './supabase'
import type { MedicationType, MedicationSchedule, MedicationLog } from '../types/medication'

// ── Types ──────────────────────────────────────────────
export async function fetchMedicationTypes(): Promise<MedicationType[]> {
  const { data, error } = await supabase
    .from('medication_types')
    .select('*')
    .order('display_name')
  if (error) throw error
  return data as MedicationType[]
}

export async function insertMedicationType(
  type: Omit<MedicationType, 'id' | 'created_at'>
): Promise<MedicationType> {
  const { data, error } = await supabase
    .from('medication_types')
    .insert(type)
    .select()
    .single()
  if (error) throw error
  return data as MedicationType
}

// ── Schedules ──────────────────────────────────────────
export async function fetchSchedulesWithTypes(): Promise<MedicationSchedule[]> {
  const { data, error } = await supabase
    .from('medication_schedules')
    .select(`*, medication_type:medication_types(*)`)
    .order('start_date', { ascending: false })
  if (error) throw error
  return data as MedicationSchedule[]
}

export async function insertSchedule(
  schedule: Omit<MedicationSchedule, 'id' | 'created_at' | 'medication_type'>
): Promise<MedicationSchedule> {
  const { data, error } = await supabase
    .from('medication_schedules')
    .insert(schedule)
    .select()
    .single()
  if (error) throw error
  return data as MedicationSchedule
}

// ── Logs ───────────────────────────────────────────────
export async function fetchLogsForSchedule(scheduleId: string): Promise<MedicationLog[]> {
  const { data, error } = await supabase
    .from('medication_logs')
    .select('*')
    .eq('schedule_id', scheduleId)
    .order('date', { ascending: false })
  if (error) throw error
  return data as MedicationLog[]
}

export async function upsertLog(log: Omit<MedicationLog, 'id' | 'created_at'>): Promise<void> {
  const { error } = await supabase
    .from('medication_logs')
    .upsert(log, { onConflict: 'schedule_id,date' })
  if (error) throw error
}

export async function insertLogs(logs: Omit<MedicationLog, 'id' | 'created_at'>[]): Promise<void> {
  if (!logs.length) return
  const { error } = await supabase
    .from('medication_logs')
    .insert(logs)
  if (error) throw error
}

// ── Helpers ────────────────────────────────────────────
// Generate log rows from start_date up to today (or end_date, whichever is earlier)
export function generateLogRows(
  scheduleId: string,
  startDate: string,
  endDate: string | null,
  defaultTime: string,
  defaultCount: string
): Omit<MedicationLog, 'id' | 'created_at'>[] {
  const rows: Omit<MedicationLog, 'id' | 'created_at'>[] = []
  const today = new Date().toISOString().slice(0, 10)
  const end = endDate && endDate < today ? endDate : today
  const cur = new Date(startDate + 'T12:00:00')
  const endDt = new Date(end + 'T12:00:00')

  while (cur <= endDt) {
    rows.push({
      schedule_id: scheduleId,
      date: cur.toISOString().slice(0, 10),
      time: defaultTime,
      count: defaultCount,
    })
    cur.setDate(cur.getDate() + 1)
  }
  return rows
}

// Bump time by N minutes (multiples of 15)
export function bumpTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  const clamped = Math.max(0, Math.min(23 * 60 + 59, total))
  const newH = Math.floor(clamped / 60)
  const newM = clamped % 60
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`
}
