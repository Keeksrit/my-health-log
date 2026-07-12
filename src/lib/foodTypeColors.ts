// Curated categorical palette for food-type dots. Chosen to stay
// distinguishable and readable over the card background in light and dark.
export const PALETTE: string[] = [
  '#E4572E', // orange
  '#F2B705', // amber
  '#6AA84F', // green
  '#17A398', // teal
  '#3B82C4', // blue
  '#8E5FD9', // purple
  '#D96BA0', // pink
  '#B5651D', // brown
  '#E23B3B', // red
  '#607D8B', // slate
]

// Dots for foods with no type, or a type with no color assigned yet.
export const FALLBACK_COLOR = '#9CA3AF'

export function colorForType(
  typeName: string | null | undefined,
  foodTypes: Array<{ name: string; color: string | null }>,
): string {
  if (!typeName) return FALLBACK_COLOR
  const match = foodTypes.find(t => t.name === typeName)
  return match?.color ?? FALLBACK_COLOR
}
