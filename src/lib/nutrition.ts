import type { Food, Ingredient } from '../types/nutrition'
import { INGREDIENT_TYPES } from '../types/nutrition'

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
