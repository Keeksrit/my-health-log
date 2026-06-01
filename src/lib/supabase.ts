import { createClient } from '@supabase/supabase-js'
import type { Entry } from '../types'

const url  = import.meta.env.VITE_SUPABASE_URL  as string
const key  = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Point to the health schema
export const supabase = createClient(url, key, {
  db: { schema: 'health' },
})

// ── Entries ────────────────────────────────────────────
export async function fetchEntries(): Promise<Entry[]> {
  const { data, error } = await supabase
    .from('entries')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as Entry[]
}

export async function insertEntry(entry: Entry): Promise<void> {
  const { error } = await supabase.from('entries').insert(entry)
  if (error) throw error
}

export async function insertEntries(entries: Entry[]): Promise<void> {
  for (const e of entries) await insertEntry(e)
}

export async function deleteEntry(id: string): Promise<void> {
  const { error } = await supabase.from('entries').delete().eq('id', id)
  if (error) throw error
}

export async function updateEntry(entry: Entry): Promise<void> {
  const { error } = await supabase.from('entries').update(entry).eq('id', entry.id)
  if (error) throw error
}
