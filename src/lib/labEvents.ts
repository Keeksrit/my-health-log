import { supabase } from './supabase'

export interface LabEvent {
  id: string
  name: string
  event_date: string // YYYY-MM-DD
  color: string | null
}

export async function fetchEvents(): Promise<LabEvent[]> {
  const { data, error } = await supabase
    .from('lab_events')
    .select('*')
    .order('event_date')
  if (error) throw error
  return data as LabEvent[]
}

export async function addEvent(name: string, eventDate: string, color: string | null): Promise<LabEvent> {
  const clean = name.trim()
  if (!clean) throw new Error('Event name cannot be empty')
  const { data, error } = await supabase
    .from('lab_events')
    .insert({ name: clean, event_date: eventDate, color })
    .select()
    .single()
  if (error) throw error
  return data as LabEvent
}

export async function updateEvent(
  id: string, patch: { name?: string; event_date?: string; color?: string | null },
): Promise<void> {
  const { error } = await supabase.from('lab_events').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteEvent(id: string): Promise<void> {
  const { error } = await supabase.from('lab_events').delete().eq('id', id)
  if (error) throw error
}
