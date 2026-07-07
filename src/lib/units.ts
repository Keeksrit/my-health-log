import { supabase } from './supabase'

export interface Unit {
  id: string
  name: string
  created_at: string
}

export function normalizeUnitName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, ' ')
  if (!name) throw new Error('Unit name cannot be empty')
  return name
}

export async function fetchUnits(): Promise<Unit[]> {
  const { data, error } = await supabase
    .from('nutrition_units')
    .select('*')
    .order('created_at')
  if (error) throw error
  return data as Unit[]
}

export async function addUnit(name: string): Promise<Unit> {
  const clean = normalizeUnitName(name)
  const { data, error } = await supabase
    .from('nutrition_units')
    .insert({ name: clean })
    .select()
    .single()
  if (error) {
    if (error.code === '23505') throw new Error('That unit already exists.')
    throw error
  }
  return data as Unit
}

export async function deleteUnit(id: string): Promise<void> {
  const { error } = await supabase.from('nutrition_units').delete().eq('id', id)
  if (error) throw error
}
