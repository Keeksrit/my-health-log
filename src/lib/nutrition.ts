import { createClient } from '@supabase/supabase-js'
import type { Food, Ingredient, LogEntry } from '../types/nutrition'
import { INGREDIENT_TYPES } from '../types/nutrition'

const db = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  { db: { schema: 'health' } }
)

// ── Pure helpers ───────────────────────────────────────
export function matchFoodByIngredientSet(foods: Food[], ingredientIds: string[]): Food | null {
  const target = new Set(ingredientIds)
  for (const f of foods) {
    const ids = (f.ingredients ?? []).map(i => i.id)
    if (ids.length === target.size && ids.every(id => target.has(id))) return f
  }
  return null
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuotes = false; i++; continue
      }
      field += ch; i++; continue
    }
    if (ch === '"') { inQuotes = true; i++; continue }
    if (ch === ',') { row.push(field); field = ''; i++; continue }
    if (ch === '\n' || ch === '\r') {
      // swallow \r\n as one break
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field); rows.push(row); field = ''; row = []; i++; continue
    }
    field += ch; i++
  }
  // flush trailing field/row unless the input ended exactly on a row break
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }
  return rows
}

export function distinctIngredientTypes(ingredients: Ingredient[]): string[] {
  const present = new Set(ingredients.map(i => i.type).filter((t): t is string => t != null))
  return INGREDIENT_TYPES.filter(t => present.has(t))
}

export function diffIngredientLinks(
  current: string[], next: string[]
): { toAdd: string[]; toRemove: string[] } {
  const cur = new Set(current)
  const nxt = new Set(next)
  return {
    toAdd: next.filter(id => !cur.has(id)),
    toRemove: current.filter(id => !nxt.has(id)),
  }
}

function pad2(n: number): string { return String(n).padStart(2, '0') }

export function splitDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  return {
    date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
  }
}

export function combineDateTime(date: string, time: string): string {
  return new Date(`${date}T${time}`).toISOString()
}

// ── Ingredients ────────────────────────────────────────
export async function fetchIngredients(): Promise<Ingredient[]> {
  const { data, error } = await db
    .from('nutrition_ingredients')
    .select('*')
    .order('name')
  if (error) throw error
  return data as Ingredient[]
}

export async function insertIngredient(
  input: { name: string; type: string | null }
): Promise<Ingredient> {
  const { data, error } = await db
    .from('nutrition_ingredients')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data as Ingredient
}

// Escape LIKE wildcards so an ilike lookup matches the name literally (case-insensitively).
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, c => `\\${c}`)
}

export async function getOrCreateIngredientByName(name: string): Promise<Ingredient> {
  const { data, error } = await db
    .from('nutrition_ingredients')
    .select('*')
    .ilike('name', escapeLike(name))
    .maybeSingle()
  if (error) throw error
  if (data) return data as Ingredient
  try {
    return await insertIngredient({ name, type: null })
  } catch (e: any) {
    if (e?.code === '23505') {
      const { data: existing, error: refErr } = await db
        .from('nutrition_ingredients')
        .select('*')
        .ilike('name', escapeLike(name))
        .maybeSingle()
      if (refErr) throw refErr
      if (existing) return existing as Ingredient
    }
    throw e
  }
}

// ── Foods ──────────────────────────────────────────────
export async function fetchFoodsWithIngredients(): Promise<Food[]> {
  const { data, error } = await db
    .from('nutrition_foods')
    .select('*, nutrition_food_ingredients(nutrition_ingredients(*))')
    .order('name')
  if (error) throw error
  return (data ?? []).map((row: any): Food => ({
    id: row.id,
    name: row.name,
    type: row.type,
    created_at: row.created_at,
    ingredients: (row.nutrition_food_ingredients ?? [])
      .map((link: any) => link.nutrition_ingredients as Ingredient)
      .filter(Boolean),
  }))
}

export async function insertFood(
  input: { name: string; type: string | null },
  ingredientIds: string[]
): Promise<Food> {
  const { data, error } = await db
    .from('nutrition_foods')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  const foodRow = data as Food
  if (ingredientIds.length) {
    const links = ingredientIds.map(id => ({ food_id: foodRow.id, ingredient_id: id }))
    const { error: linkErr } = await db.from('nutrition_food_ingredients').insert(links)
    if (linkErr) throw linkErr
  }
  return foodRow
}

export async function getOrCreateFoodByName(name: string): Promise<Food> {
  const { data, error } = await db
    .from('nutrition_foods')
    .select('*')
    .ilike('name', escapeLike(name))
    .maybeSingle()
  if (error) throw error
  if (data) return data as Food
  try {
    return await insertFood({ name, type: null }, [])
  } catch (e: any) {
    if (e?.code === '23505') {
      const { data: existing, error: refErr } = await db
        .from('nutrition_foods')
        .select('*')
        .ilike('name', escapeLike(name))
        .maybeSingle()
      if (refErr) throw refErr
      if (existing) return existing as Food
    }
    throw e
  }
}

// ── Consumption log ────────────────────────────────────
export async function fetchLog(): Promise<LogEntry[]> {
  const { data, error } = await db
    .from('nutrition_consumption_log')
    .select('*, food:nutrition_foods(*)')
    .order('eaten_at', { ascending: false })
  if (error) throw error
  return data as LogEntry[]
}

export async function insertLogEntry(
  input: { food_id: string; amount: number | null; unit: string | null; type?: string | null; eaten_at: string }
): Promise<void> {
  const { error } = await db.from('nutrition_consumption_log').insert(input)
  if (error) throw error
}

export async function insertLogEntries(
  entries: { food_id: string; amount: number | null; unit: string | null; type?: string | null; eaten_at: string }[]
): Promise<void> {
  if (!entries.length) return
  const { error } = await db.from('nutrition_consumption_log').insert(entries)
  if (error) throw error
}

export async function updateLogEntry(
  id: string,
  input: { food_id: string; amount: number | null; unit: string | null; type?: string | null; eaten_at: string }
): Promise<void> {
  const { error } = await db.from('nutrition_consumption_log').update(input).eq('id', id)
  if (error) throw error
}

export async function deleteLogEntry(id: string): Promise<void> {
  const { error } = await db.from('nutrition_consumption_log').delete().eq('id', id)
  if (error) throw error
}
