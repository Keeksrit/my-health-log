export interface ChartDims {
  width: number; height: number
  padL: number; padR: number; padT: number; padB: number
}
export interface ChartPoint { t: number; v: number }

const plotLeft = (d: ChartDims) => d.padL
const plotRight = (d: ChartDims) => d.width - d.padR
const plotTop = (d: ChartDims) => d.padT
const plotBottom = (d: ChartDims) => d.height - d.padB

function yFor(v: number, d: ChartDims, yMin: number, yMax: number): number {
  const span = yMax - yMin || 1
  return plotBottom(d) - ((v - yMin) / span) * (plotBottom(d) - plotTop(d))
}
function xFor(t: number, d: ChartDims, tMin: number, tMax: number): number {
  const span = tMax - tMin || 1
  return plotLeft(d) + ((t - tMin) / span) * (plotRight(d) - plotLeft(d))
}

export function computeYDomain(values: number[], refMin: number | null, refMax: number | null) {
  const all = [...values]
  if (refMin != null) all.push(refMin)
  if (refMax != null) all.push(refMax)
  let lo = Math.min(...all)
  let hi = Math.max(...all)
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = 0; hi = 1 }
  if (lo === hi) { lo -= 1; hi += 1 }
  const pad = (hi - lo) * 0.1
  return { yMin: lo - pad, yMax: hi + pad }
}

export function scalePoints(
  pts: ChartPoint[], d: ChartDims, tMin: number, tMax: number, yMin: number, yMax: number,
): { x: number; y: number }[] {
  return pts.map(p => ({ x: xFor(p.t, d, tMin, tMax), y: yFor(p.v, d, yMin, yMax) }))
}

export function refBandRect(
  refMin: number | null, refMax: number | null, d: ChartDims, yMin: number, yMax: number,
): { x: number; y: number; width: number; height: number } | null {
  if (refMin == null && refMax == null) return null
  const yHi = refMax != null ? yFor(refMax, d, yMin, yMax) : plotTop(d)
  const yLo = refMin != null ? yFor(refMin, d, yMin, yMax) : plotBottom(d)
  return {
    x: plotLeft(d),
    y: yHi,
    width: plotRight(d) - plotLeft(d),
    height: yLo - yHi,
  }
}

export function eventLinesX(dates: number[], d: ChartDims, tMin: number, tMax: number): number[] {
  return dates.filter(t => t >= tMin && t <= tMax).map(t => xFor(t, d, tMin, tMax))
}

export function niceTicks(yMin: number, yMax: number, count = 5): number[] {
  const span = yMax - yMin || 1
  const rawStep = span / Math.max(1, count)
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const norm = rawStep / mag
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag
  const start = Math.floor(yMin / step) * step
  const ticks: number[] = []
  for (let v = start; v <= yMax + step * 0.5; v += step) ticks.push(Number(v.toFixed(6)))
  return ticks
}

export type ChartType = 'allergy-scale' | 'timeseries' | 'strip'

// Pick the chart from the analyte's classification. Only allergy+number takes the
// class scale; only an explicitly-binary analyte is a strip; any other analyte
// with numeric points is a time-series. An unclassified dictionary row
// (value_type null) with numeric data therefore still charts as a time-series,
// same as an analyte with no dictionary row at all.
export function chartTypeFor(
  meta: { category: string | null; value_type: string | null } | null,
  hasNumeric: boolean,
): ChartType {
  if (meta?.category === 'allergy' && meta.value_type === 'number') return 'allergy-scale'
  if (meta?.value_type === 'binary') return 'strip'
  if (hasNumeric) return 'timeseries'
  return 'strip'
}

export interface ScaledPoint { x: number; y: number; censored: '<' | '>' | null }

// Consecutive-pair segments. A segment is dashed when either endpoint is a
// censored (>/<) value, signalling its exact position is uncertain.
export function lineSegments(
  pts: ScaledPoint[],
): { x1: number; y1: number; x2: number; y2: number; dashed: boolean }[] {
  const segs: { x1: number; y1: number; x2: number; y2: number; dashed: boolean }[] = []
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, dashed: a.censored != null || b.censored != null })
  }
  return segs
}
