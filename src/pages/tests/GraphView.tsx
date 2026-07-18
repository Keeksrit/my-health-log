import type { LabSession } from '../../lib/lab'
import type { LabEvent } from '../../lib/labEvents'
import type { AnalyteDescription } from '../../lib/labDescriptions'
import { computeYDomain, scalePoints, refBandRect, eventLinesX, type ChartDims } from '../../lib/labChart'
import styles from './views.module.css'

const DIMS: ChartDims = { width: 320, height: 180, padL: 34, padR: 12, padT: 12, padB: 24 }

interface AnalyteSeries {
  analyte: string
  numeric: { t: number; v: number; raw: string; bad: boolean }[]
  qualitative: { t: number; verdict: string | null; raw: string }[]
  refMin: number | null
  refMax: number | null
}

function buildSeries(sessions: LabSession[]): AnalyteSeries[] {
  const map = new Map<string, AnalyteSeries>()
  // Oldest-first so the line reads left→right in time.
  const ordered = [...sessions].sort((a, b) => a.taken_at.localeCompare(b.taken_at))
  for (const s of ordered) {
    const t = new Date(s.taken_at).getTime()
    for (const r of s.results) {
      let ser = map.get(r.analyte)
      if (!ser) {
        ser = { analyte: r.analyte, numeric: [], qualitative: [], refMin: r.ref_min, refMax: r.ref_max }
        map.set(r.analyte, ser)
      }
      // Newest session's ref wins (ordered is ascending), so a changed
      // reference range tracks the latest visit rather than the oldest.
      if (r.ref_min != null) ser.refMin = r.ref_min
      if (r.ref_max != null) ser.refMax = r.ref_max
      if (r.result_num != null) {
        const bad = (r.ref_min != null && r.result_num < r.ref_min) || (r.ref_max != null && r.result_num > r.ref_max)
        ser.numeric.push({ t, v: r.result_num, raw: r.result_raw, bad })
      } else {
        ser.qualitative.push({ t, verdict: r.verdict, raw: r.result_raw })
      }
    }
  }
  return [...map.values()]
}

export function GraphView(
  { sessions, events, descriptions }: { sessions: LabSession[]; events: LabEvent[]; descriptions: AnalyteDescription[] },
) {
  const series = buildSeries(sessions)
  if (!series.length) return <p className={styles.empty}>No lab results yet.</p>
  const descOf = (a: string) => descriptions.find(d => d.analyte === a)?.description ?? ''
  const eventTimes = events.map(e => new Date(`${e.event_date}T00:00:00`).getTime())

  return (
    <div className={styles.charts}>
      {series.map(ser => {
        const numeric = ser.numeric
        if (numeric.length === 0) {
          // Purely qualitative → verdict-dot strip.
          return (
            <div key={ser.analyte} className={styles.chartCard}>
              <div className={styles.chartTitle} title={descOf(ser.analyte)}>{ser.analyte}</div>
              <div className={styles.strip}>
                {ser.qualitative.map((q, i) => (
                  <span key={i} className={styles.verdictDot} title={`${new Date(q.t).toLocaleDateString()} · ${q.raw}${q.verdict ? ` · ${q.verdict}` : ''}`}>
                    {q.verdict ?? q.raw}
                  </span>
                ))}
              </div>
            </div>
          )
        }
        const times = numeric.map(p => p.t)
        const tMin = Math.min(...times), tMax = Math.max(...times)
        const { yMin, yMax } = computeYDomain(numeric.map(p => p.v), ser.refMin, ser.refMax)
        const pts = scalePoints(numeric.map(p => ({ t: p.t, v: p.v })), DIMS, tMin, tMax, yMin, yMax)
        const band = refBandRect(ser.refMin, ser.refMax, DIMS, yMin, yMax)
        const evX = eventLinesX(eventTimes, DIMS, tMin, tMax)
        const polyline = pts.map(p => `${p.x},${p.y}`).join(' ')
        return (
          <div key={ser.analyte} className={styles.chartCard}>
            <div className={styles.chartTitle} title={descOf(ser.analyte)}>{ser.analyte}</div>
            <svg viewBox={`0 0 ${DIMS.width} ${DIMS.height}`} className={styles.svg} role="img" aria-label={`${ser.analyte} trend`}>
              {band && <rect x={band.x} y={band.y} width={band.width} height={band.height} className={styles.band} />}
              {evX.map((x, i) => <line key={i} x1={x} y1={DIMS.padT} x2={x} y2={DIMS.height - DIMS.padB} className={styles.eventLine} />)}
              {pts.length > 1 && <polyline points={polyline} className={styles.line} />}
              {pts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={3} className={numeric[i].bad ? styles.dotBad : styles.dot}>
                  <title>{`${new Date(numeric[i].t).toLocaleDateString()} · ${numeric[i].raw}`}</title>
                </circle>
              ))}
            </svg>
            {ser.qualitative.length > 0 && (
              <div className={styles.strip}>
                {ser.qualitative.map((q, i) => (
                  <span key={i} className={styles.verdictDot} title={`${new Date(q.t).toLocaleDateString()} · ${q.raw}${q.verdict ? ` · ${q.verdict}` : ''}`}>
                    {q.verdict ?? q.raw}
                  </span>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
