import type { LabSession } from '../../lib/lab'
import type { LabEvent } from '../../lib/labEvents'
import type { AnalyteDescription } from '../../lib/labDescriptions'
import {
  computeYDomain, scalePoints, refBandRect, eventLinesX, chartTypeFor, lineSegments,
  type ChartDims, type ScaledPoint,
} from '../../lib/labChart'
import { censoredDir } from '../../lib/labParse'
import { positionFor, CAP_RAST_THRESHOLDS } from '../../lib/labAllergyScale'
import styles from './views.module.css'

const DIMS: ChartDims = { width: 320, height: 180, padL: 34, padR: 12, padT: 12, padB: 24 }

interface NumPoint { t: number; v: number; raw: string; bad: boolean; censored: '<' | '>' | null }
interface QualPoint { t: number; verdict: string | null; note: string | null; raw: string }

interface AnalyteSeries {
  analyte: string
  unit: string | null
  numeric: NumPoint[]
  qualitative: QualPoint[]
  refMin: number | null
  refMax: number | null
}

function buildSeries(sessions: LabSession[]): AnalyteSeries[] {
  const map = new Map<string, AnalyteSeries>()
  const ordered = [...sessions].sort((a, b) => a.taken_at.localeCompare(b.taken_at))
  for (const s of ordered) {
    const t = new Date(s.taken_at).getTime()
    for (const r of s.results) {
      let ser = map.get(r.analyte)
      if (!ser) {
        ser = { analyte: r.analyte, unit: r.unit, numeric: [], qualitative: [], refMin: r.ref_min, refMax: r.ref_max }
        map.set(r.analyte, ser)
      }
      if (r.unit) ser.unit = r.unit
      if (r.ref_min != null) ser.refMin = r.ref_min
      if (r.ref_max != null) ser.refMax = r.ref_max
      if (r.result_num != null) {
        const bad = (r.ref_min != null && r.result_num < r.ref_min) || (r.ref_max != null && r.result_num > r.ref_max)
        ser.numeric.push({ t, v: r.result_num, raw: r.result_raw, bad, censored: censoredDir(r.result_raw) })
      } else {
        ser.qualitative.push({ t, verdict: r.verdict, note: r.note, raw: r.result_raw })
      }
    }
  }
  return [...map.values()]
}

// Two-line tooltip shared by every chart kind.
function tip(raw: string, unit: string | null, t: number, second: string | null): string {
  const when = new Date(t).toLocaleString()
  const line1 = `${raw}${unit ? ` ${unit}` : ''} · ${when}`
  return second ? `${line1}\n${second}` : line1
}

export function GraphView(
  { sessions, events, descriptions }: { sessions: LabSession[]; events: LabEvent[]; descriptions: AnalyteDescription[] },
) {
  const series = buildSeries(sessions)
  if (!series.length) return <p className={styles.empty}>No lab results yet.</p>
  const metaOf = (a: string) => descriptions.find(d => d.analyte === a) ?? null
  const descOf = (a: string) => metaOf(a)?.description ?? ''
  const eventTimes = events.map(e => new Date(`${e.event_date}T00:00:00`).getTime())

  return (
    <div className={styles.charts}>
      {series.map(ser => {
        const meta = metaOf(ser.analyte)
        const kind = chartTypeFor(meta, ser.numeric.length > 0)
        return (
          <div key={ser.analyte} className={styles.chartCard}>
            <div className={styles.chartTitle} title={descOf(ser.analyte)}>
              {ser.analyte}{ser.unit ? <span className={styles.unit}> ({ser.unit})</span> : null}
            </div>
            {kind === 'allergy-scale'
              ? <AllergyScale ser={ser} />
              : kind === 'timeseries'
                ? <TimeSeries ser={ser} eventTimes={eventTimes} />
                : null}
            {(kind === 'strip' || ser.qualitative.length > 0) && <Strip ser={ser} />}
          </div>
        )
      })}
    </div>
  )
}

function TimeSeries({ ser, eventTimes }: { ser: AnalyteSeries; eventTimes: number[] }) {
  const numeric = ser.numeric
  const times = numeric.map(p => p.t)
  const tMin = Math.min(...times), tMax = Math.max(...times)
  const { yMin, yMax } = computeYDomain(numeric.map(p => p.v), ser.refMin, ser.refMax)
  const base = scalePoints(numeric.map(p => ({ t: p.t, v: p.v })), DIMS, tMin, tMax, yMin, yMax)
  const pts: ScaledPoint[] = base.map((p, i) => ({ ...p, censored: numeric[i].censored }))
  const band = refBandRect(ser.refMin, ser.refMax, DIMS, yMin, yMax)
  const evX = eventLinesX(eventTimes, DIMS, tMin, tMax)
  const segs = lineSegments(pts)
  return (
    <svg viewBox={`0 0 ${DIMS.width} ${DIMS.height}`} className={styles.svg} role="img" aria-label={`${ser.analyte} trend`}>
      {band && <rect x={band.x} y={band.y} width={band.width} height={band.height} className={styles.band} />}
      {evX.map((x, i) => <line key={i} x1={x} y1={DIMS.padT} x2={x} y2={DIMS.height - DIMS.padB} className={styles.eventLine} />)}
      {segs.map((s, i) => (
        <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} className={s.dashed ? styles.lineDashed : styles.line} />
      ))}
      {pts.map((p, i) => {
        const n = numeric[i]
        const t = <title>{tip(n.raw, ser.unit, n.t, null)}</title>
        if (p.censored) {
          // Literal >/< glyph replaces the dot; the shape is the color-blind cue.
          return (
            <text key={i} x={p.x} y={p.y} dy="0.32em" textAnchor="middle" className={styles.glyph}>
              {p.censored}{t}
            </text>
          )
        }
        return (
          <circle key={i} cx={p.x} cy={p.y} r={3} className={n.bad ? styles.dotBad : styles.dot}>{t}</circle>
        )
      })}
    </svg>
  )
}

function AllergyScale({ ser }: { ser: AnalyteSeries }) {
  // Latest numeric point drives the arrow; older points listed in the tooltip.
  const sorted = [...ser.numeric].sort((a, b) => a.t - b.t)
  const latest = sorted[sorted.length - 1]
  if (!latest) return null
  const pos = positionFor(latest.v, latest.censored)
  const older = sorted.slice(0, -1).map(p => `${new Date(p.t).toLocaleDateString()}: ${p.raw}`).join('\n')
  const W = 260, H = 40, cells = CAP_RAST_THRESHOLDS.length + 1
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg} role="img" aria-label={`${ser.analyte} allergy class`}>
      {Array.from({ length: cells }, (_, c) => (
        <g key={c}>
          <rect x={(c / cells) * W} y={4} width={W / cells} height={16} className={styles[`band${c}` as keyof typeof styles]} />
          <text x={((c + 0.5) / cells) * W} y={32} textAnchor="middle" className={styles.classNum}>{c}</text>
        </g>
      ))}
      <polygon
        points={`${pos.x * W},22 ${pos.x * W - 4},14 ${pos.x * W + 4},14`}
        className={styles.arrow}
      >
        <title>{tip(latest.raw, ser.unit, latest.t, older ? `Class ${pos.className}\n${older}` : `Class ${pos.className}`)}</title>
      </polygon>
    </svg>
  )
}

function Strip({ ser }: { ser: AnalyteSeries }) {
  return (
    <div className={styles.strip}>
      {ser.qualitative.map((q, i) => {
        const positive = /positiiv/i.test(q.verdict ?? q.raw)
        return (
          <span
            key={i}
            className={`${styles.verdictDot} ${positive ? styles.verdictPos : styles.verdictNeg}`}
            title={tip(q.raw, ser.unit, q.t, q.verdict ?? q.note)}
          >
            {/* Second, non-color cue: ● positive vs ○ negative. */}
            <span aria-hidden="true">{positive ? '●' : '○'}</span> {q.verdict ?? q.raw}
          </span>
        )
      })}
    </div>
  )
}
