import type { LabSession } from '../../lib/lab'
import type { AnalyteDescription } from '../../lib/labDescriptions'
import styles from './views.module.css'

function outOfRange(num: number | null, min: number | null, max: number | null): boolean {
  if (num == null) return false
  if (min != null && num < min) return true
  if (max != null && num > max) return true
  return false
}

export function TableView(
  { sessions, descriptions, onDelete }: { sessions: LabSession[]; descriptions: AnalyteDescription[]; onDelete: (id: string) => void },
) {
  // Analyte rows in first-seen order across all sessions (newest-first).
  const analytes: string[] = []
  const seen = new Set<string>()
  for (const s of sessions) for (const r of s.results) {
    if (!seen.has(r.analyte)) { seen.add(r.analyte); analytes.push(r.analyte) }
  }
  const descOf = (a: string) => descriptions.find(d => d.analyte === a)?.description ?? ''

  if (!sessions.length) return <p className={styles.empty}>No lab results yet.</p>

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.analyteCol}>Analyte</th>
            {sessions.map(s => (
              <th key={s.id}>
                <div className={styles.colHead}>
                  <span>{new Date(s.taken_at).toLocaleDateString()}</span>
                  <button
                    className={styles.delCol}
                    onClick={() => {
                      if (window.confirm(`Delete the ${new Date(s.taken_at).toLocaleDateString()} session and all its results?`)) onDelete(s.id)
                    }}
                    aria-label={`Delete ${new Date(s.taken_at).toLocaleDateString()} session`}
                  >×</button>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {analytes.map(a => (
            <tr key={a}>
              <td className={styles.analyteCol} title={descOf(a)}>{a}</td>
              {sessions.map(s => {
                const r = s.results.find(x => x.analyte === a)
                if (!r) return <td key={s.id} className={styles.blank}>—</td>
                const bad = outOfRange(r.result_num, r.ref_min, r.ref_max)
                return (
                  <td key={s.id} className={bad ? styles.bad : ''} title={`${r.ref ?? ''}${r.verdict ? ` · ${r.verdict}` : ''}`}>
                    {r.result_raw}{r.unit ? ` ${r.unit}` : ''}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
