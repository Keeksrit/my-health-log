import { createClient } from '@supabase/supabase-js'
import type { Food, Ingredient, LogEntry } from '../types/nutrition'
import { INGREDIENT_TYPES } from '../types/nutrition'
import type {
  IngredientCsvRow, FoodCsvRow, LogCsvRow, SyncMode,
} from './nutritionCsv'
import { computeSyncPlan, logsToInsert, normalizeLogAmountUnit, parseLocalDateTime } from './nutritionCsv'

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

// Sniff the field separator from the first line so files exported by
// European Excel (which uses ';', sometimes tab) import as well as our own ','.
function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const counts = [',', ';', '\t'].map(d => [d, firstLine.split(d).length - 1] as const)
  const best = counts.reduce((a, b) => (b[1] > a[1] ? b : a))
  return best[1] > 0 ? best[0] : ','
}

export function parseCsv(text: string): string[][] {
  // Strip a leading UTF-8 BOM (Excel prepends one) so the first cell is clean.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const delim = detectDelimiter(text)
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
    if (ch === delim) { row.push(field); field = ''; i++; continue }
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

export async function updateIngredient(
  id: string, input: { name: string; type: string | null }
): Promise<void> {
  const { error } = await db.from('nutrition_ingredients').update(input).eq('id', id)
  if (error) throw error
}

export async function deleteIngredient(id: string): Promise<void> {
  const { error } = await db.from('nutrition_ingredients').delete().eq('id', id)
  if (error) {
    if (error.code === '23503') {
      throw new Error('That ingredient is still used by a food. Remove it from those foods first.')
    }
    throw error
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
    type: row.type ?? null,
    created_at: row.created_at,
    ingredients: (row.nutrition_food_ingredients ?? [])
      .map((link: any) => link.nutrition_ingredients as Ingredient)
      .filter(Boolean),
  }))
}

export async function insertFood(
  input: { name: string; type?: string | null },
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
    return await insertFood({ name }, [])
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

export async function updateFood(
  id: string, input: { name: string; type?: string | null }
): Promise<void> {
  const { error } = await db.from('nutrition_foods').update(input).eq('id', id)
  if (error) throw error
}

export async function setFoodIngredients(foodId: string, ingredientIds: string[]): Promise<void> {
  const { data, error } = await db
    .from('nutrition_food_ingredients')
    .select('ingredient_id')
    .eq('food_id', foodId)
  if (error) throw error
  const current = (data ?? []).map((r: any) => r.ingredient_id as string)
  const { toAdd, toRemove } = diffIngredientLinks(current, ingredientIds)
  if (toRemove.length) {
    const { error: delErr } = await db
      .from('nutrition_food_ingredients')
      .delete()
      .eq('food_id', foodId)
      .in('ingredient_id', toRemove)
    if (delErr) throw delErr
  }
  if (toAdd.length) {
    const links = toAdd.map(id => ({ food_id: foodId, ingredient_id: id }))
    const { error: insErr } = await db.from('nutrition_food_ingredients').insert(links)
    if (insErr) throw insErr
  }
}

export async function deleteFood(id: string): Promise<void> {
  const { error } = await db.from('nutrition_foods').delete().eq('id', id)
  if (error) throw error
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
  input: { id?: string; food_id: string; amount: number | null; unit: string | null; eaten_at: string }
): Promise<void> {
  const { error } = await db.from('nutrition_consumption_log').insert(input)
  if (error) throw error
}

export async function insertLogEntries(
  entries: { food_id: string; amount: number | null; unit: string | null; eaten_at: string }[]
): Promise<void> {
  if (!entries.length) return
  const { error } = await db.from('nutrition_consumption_log').insert(entries)
  if (error) throw error
}

export async function updateLogEntry(
  id: string,
  input: { food_id: string; amount: number | null; unit: string | null; eaten_at: string }
): Promise<void> {
  const { error } = await db.from('nutrition_consumption_log').update(input).eq('id', id)
  if (error) throw error
}

export async function deleteLogEntry(id: string): Promise<void> {
  const { error } = await db.from('nutrition_consumption_log').delete().eq('id', id)
  if (error) throw error
}

export async function updateLogEntries(
  rows: { id: string; food_id: string; amount: number | null; unit: string | null; eaten_at: string }[]
): Promise<void> {
  for (const r of rows) {
    const { id, ...input } = r
    await updateLogEntry(id, input)
  }
}

// ── CSV import / sync ──────────────────────────────────
export interface ImportSummary {
  inserted: number
  updated: number
  deleted: number
  skipped: string[]   // bad rows, unknown ids
  blocked: string[]   // FK-blocked deletes
  stubs: string[]     // auto-created foods/ingredients
}

function emptySummary(): ImportSummary {
  return { inserted: 0, updated: 0, deleted: 0, skipped: [], blocked: [], stubs: [] }
}

export async function syncIngredients(rows: IngredientCsvRow[], mode: SyncMode): Promise<ImportSummary> {
  const sum = emptySummary()
  const existing = await fetchIngredients()
  const plan = computeSyncPlan(rows, existing.map(i => i.id), mode)
  for (const r of plan.unknownIds) sum.skipped.push(`ingredient row references unknown id "${r.id}"`)
  for (const r of plan.inserts) {
    if (!r.name) { sum.skipped.push('ingredient with empty name'); continue }
    try { await insertIngredient({ name: r.name, type: r.type }); sum.inserted++ }
    catch (e: any) { sum.skipped.push(`insert ingredient "${r.name}": ${e?.message ?? 'error'}`) }
  }
  for (const r of plan.updates) {
    try { await updateIngredient(r.id, { name: r.name, type: r.type }); sum.updated++ }
    catch (e: any) { sum.skipped.push(`update ingredient "${r.name}": ${e?.message ?? 'error'}`) }
  }
  for (const id of plan.deletes) {
    try { await deleteIngredient(id); sum.deleted++ }
    catch (e: any) { sum.blocked.push(`ingredient ${id}: ${e?.message ?? 'still referenced'}`) }
  }
  return sum
}

export async function syncFoods(rows: FoodCsvRow[], mode: SyncMode): Promise<ImportSummary> {
  const sum = emptySummary()
  const existing = await fetchFoodsWithIngredients()
  const plan = computeSyncPlan(rows, existing.map(f => f.id), mode)
  for (const r of plan.unknownIds) sum.skipped.push(`food row references unknown id "${r.id}"`)

  async function resolveIngredientIds(names: string[]): Promise<string[]> {
    const ids: string[] = []
    for (const n of names) {
      const ing = await getOrCreateIngredientByName(n)
      if (ing.type === null) sum.stubs.push(`ingredient: ${ing.name}`)
      ids.push(ing.id)
    }
    return ids
  }

  for (const r of plan.inserts) {
    if (!r.name) { sum.skipped.push('food with empty name'); continue }
    try {
      const ids = await resolveIngredientIds(r.ingredientNames)
      await insertFood({ name: r.name, type: r.type }, ids)
      sum.inserted++
    } catch (e: any) { sum.skipped.push(`insert food "${r.name}": ${e?.message ?? 'error'}`) }
  }
  for (const r of plan.updates) {
    try {
      const ids = await resolveIngredientIds(r.ingredientNames)
      await updateFood(r.id, { name: r.name, type: r.type })
      await setFoodIngredients(r.id, ids)
      sum.updated++
    } catch (e: any) { sum.skipped.push(`update food "${r.name}": ${e?.message ?? 'error'}`) }
  }
  for (const id of plan.deletes) {
    try { await deleteFood(id); sum.deleted++ }
    catch (e: any) { sum.blocked.push(`food ${id}: ${e?.message ?? 'still referenced by the log'}`) }
  }
  return sum
}

export async function syncLog(
  rows: LogCsvRow[], mode: SyncMode, allowedUnits: Set<string>
): Promise<ImportSummary> {
  const sum = emptySummary()
  const existing = await fetchLog()
  const plan = computeSyncPlan(rows, existing.map(e => e.id), mode)

  async function build(r: LogCsvRow): Promise<{ food_id: string; amount: number | null; unit: string | null; eaten_at: string }> {
    if (!r.food) throw new Error('empty food name')
    const { amount, unit } = normalizeLogAmountUnit(r.amount, r.unit, allowedUnits)
    const when = r.eatenAt ? parseLocalDateTime(r.eatenAt) : new Date()
    if (!when) throw new Error(`bad date "${r.eatenAt}"`)
    const food = await getOrCreateFoodByName(r.food)
    if (!food.ingredients?.length) sum.stubs.push(`food: ${food.name}`)
    return { food_id: food.id, amount, unit, eaten_at: when.toISOString() }
  }

  // Blank-id rows insert with a DB-generated id; unknown-id rows insert keeping
  // their id so a full sync mirrors the file (export→import restores ids).
  for (const { id, row } of logsToInsert(plan)) {
    try {
      await insertLogEntry(id ? { id, ...(await build(row)) } : await build(row))
      sum.inserted++
    } catch (e: any) { sum.skipped.push(`insert log "${row.food}": ${e?.message ?? 'error'}`) }
  }
  for (const r of plan.updates) {
    try { await updateLogEntry(r.id, await build(r)); sum.updated++ }
    catch (e: any) { sum.skipped.push(`update log "${r.food}": ${e?.message ?? 'error'}`) }
  }
  for (const id of plan.deletes) {
    try { await deleteLogEntry(id); sum.deleted++ }
    catch (e: any) { sum.blocked.push(`log ${id}: ${e?.message ?? 'error'}`) }
  }
  return sum
}
