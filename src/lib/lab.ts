import { supabase } from './supabase'
import type { ParsedSession } from './labParse'

export interface LabResult {
  id: string
  session_id: string
  analyte: string
  result_raw: string
  result_num: number | null
  unit: string | null
  ref: string | null
  ref_min: number | null
  ref_max: number | null
  verdict: string | null
  panel: string | null
  note: string | null
}

export interface LabSession {
  id: string
  sample_id: string
  material: string | null
  taken_at: string
  created_at: string
  raw_text: string | null
  results: LabResult[]
}

export async function fetchSessions(): Promise<LabSession[]> {
  const { data, error } = await supabase
    .from('lab_sessions')
    .select('*, results:lab_results(*)')
    .order('taken_at', { ascending: false })
  if (error) throw error
  return (data as LabSession[]).map(s => ({ ...s, results: s.results ?? [] }))
}

export async function fetchSampleIds(): Promise<string[]> {
  const { data, error } = await supabase.from('lab_sessions').select('sample_id')
  if (error) throw error
  return (data as { sample_id: string }[]).map(r => r.sample_id)
}

export async function saveSession(s: ParsedSession): Promise<void> {
  const { data, error } = await supabase
    .from('lab_sessions')
    .insert({ sample_id: s.sample_id, material: s.material, taken_at: s.taken_at, raw_text: s.raw_text })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') throw new Error(`Sample ${s.sample_id} is already saved.`)
    throw error
  }
  const sessionId = (data as { id: string }).id
  if (s.results.length) {
    const rows = s.results.map(r => ({ ...r, session_id: sessionId }))
    const { error: rErr } = await supabase.from('lab_results').insert(rows)
    if (rErr) {
      // Roll back the orphan session so a retry can re-insert cleanly.
      await supabase.from('lab_sessions').delete().eq('id', sessionId)
      throw rErr
    }
  }
}

export async function deleteSession(id: string): Promise<void> {
  const { error } = await supabase.from('lab_sessions').delete().eq('id', id)
  if (error) throw error
}
