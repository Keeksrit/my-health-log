import { supabase } from './supabase'

export interface FoodType {
  id: string
  name: string
  color: string | null
  created_at: string
}

export function normalizeFoodTypeName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, ' ')
  if (!name) throw new Error('Food type name cannot be empty')
  return name
}

export async function fetchFoodTypes(): Promise<FoodType[]> {
  const { data, error } = await supabase
    .from('nutrition_food_types')
    .select('*')
    .order('created_at')
  if (error) throw error
  return data as FoodType[]
}

export async function addFoodType(name: string): Promise<FoodType> {
  const clean = normalizeFoodTypeName(name)
  const { data, error } = await supabase
    .from('nutrition_food_types')
    .insert({ name: clean })
    .select()
    .single()
  if (error) {
    if (error.code === '23505') throw new Error('That food type already exists.')
    throw error
  }
  return data as FoodType
}

export async function deleteFoodType(id: string): Promise<void> {
  const { error } = await supabase.from('nutrition_food_types').delete().eq('id', id)
  if (error) throw error
}

export async function updateFoodTypeColor(id: string, color: string | null): Promise<void> {
  const { error } = await supabase
    .from('nutrition_food_types')
    .update({ color })
    .eq('id', id)
  if (error) throw error
}
