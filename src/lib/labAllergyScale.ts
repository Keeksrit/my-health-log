// Fixed CAP-RAST IgE class bands, shared by every allergen (not per-analyte, not
// stored). Six thresholds partition values into seven classes (0..6).
export const CAP_RAST_THRESHOLDS = [0.35, 0.70, 3.5, 17.5, 50, 100]
const CLASS_COUNT = CAP_RAST_THRESHOLDS.length + 1 // 7 cells across the bar

export interface ScalePosition { x: number; className: number; capped: '<' | '>' | null }

// Map an IgE value to a fraction across the 7-cell banded bar. Class 0 (< first
// threshold) clamps to the far left; class 6 (>= last threshold, i.e. off-scale)
// clamps to the far right. Within an interior cell the value interpolates
// linearly between that cell's lower and upper thresholds.
export function positionFor(value: number, dir?: '<' | '>' | null): ScalePosition {
  if (dir === '>' || value >= CAP_RAST_THRESHOLDS[CAP_RAST_THRESHOLDS.length - 1]) {
    return { x: 1, className: CLASS_COUNT - 1, capped: '>' }
  }
  if (dir === '<' || value < CAP_RAST_THRESHOLDS[0]) {
    return { x: 0, className: 0, capped: '<' }
  }
  // Interior classes 1..5: find the cell whose [lower, upper) contains value.
  let c = 1
  while (c < CAP_RAST_THRESHOLDS.length && value >= CAP_RAST_THRESHOLDS[c]) c++
  const lower = CAP_RAST_THRESHOLDS[c - 1]
  const upper = CAP_RAST_THRESHOLDS[c]
  const frac = (value - lower) / (upper - lower)
  return { x: (c + frac) / CLASS_COUNT, className: c, capped: null }
}
