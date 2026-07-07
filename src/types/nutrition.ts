export interface Ingredient {
  id: string
  name: string
  type: string | null
  created_at: string
}

export interface Food {
  id: string
  name: string
  type: string | null
  created_at: string
  // joined via nutrition_food_ingredients
  ingredients?: Ingredient[]
}

export interface LogEntry {
  id: string
  food_id: string
  amount: number | null
  unit: string | null
  eaten_at: string
  created_at: string
  food?: Food
}

export const INGREDIENT_TYPES = [
  'Grains & Starches',
  'Proteins',
  'Dairy',
  'Dairy alternative',
  'Fruit',
  'Vegetable',
  'Fats & Oils',
  'Processed',
] as const
