import type { Entry } from '../types'
import { dateKey } from '../lib/utils'
import styles from './Stats.module.css'

interface Props {
  entries: Entry[]
}

export default function Stats({ entries }: Props) {
  const days = new Set(entries.map(e => dateKey(e.created_at))).size

  const symCount: Record<string, number> = {}
  const sevSum:   Record<string, number> = {}
  const sevN:     Record<string, number> = {}
  const partCount: Record<string, number> = {}

  entries.forEach(e => {
    symCount[e.name] = (symCount[e.name] ?? 0) + 1
    if (e.severity) {
      sevSum[e.name] = (sevSum[e.name] ?? 0) + e.severity
      sevN[e.name]   = (sevN[e.name]   ?? 0) + 1
    }
    if (e.body_part) {
      const loc = e.location_label ?? e.body_part
      partCount[loc] = (partCount[loc] ?? 0) + 1
    }
  })

  const topSym   = Object.entries(symCount).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const topParts = Object.entries(partCount).sort((a, b) => b[1] - a[1]).slice(0, 5)

  return (
    <div className={styles.page}>
      <p className={styles.sec}>Overview</p>
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statNum}>{entries.length}</div>
          <div className={styles.statLabel}>Total entries</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statNum}>{days}</div>
          <div className={styles.statLabel}>Days tracked</div>
        </div>
      </div>

      <p className={styles.sec}>Most logged symptoms</p>
      {topSym.length === 0 ? (
        <p className={styles.empty}>None yet</p>
      ) : topSym.map(([name, cnt]) => {
        const avg = sevN[name] ? (sevSum[name] / sevN[name]).toFixed(1) : null
        return (
          <div key={name} className={styles.card}>
            <div className={styles.cardRow}>
              <span className={styles.cardName}>{name}</span>
              <span className={`${styles.pill} ${styles.pillGray}`}>{cnt}×</span>
              {avg && <span className={`${styles.pill} ${styles.pillAmber}`}>avg {avg}</span>}
            </div>
          </div>
        )
      })}

      <p className={styles.sec}>Most affected areas</p>
      {topParts.length === 0 ? (
        <p className={styles.empty}>None yet</p>
      ) : topParts.map(([loc, cnt]) => (
        <div key={loc} className={styles.card}>
          <div className={styles.cardRow}>
            <span className={styles.cardName}>{loc}</span>
            <span className={`${styles.pill} ${styles.pillGreen}`}>{cnt}×</span>
          </div>
        </div>
      ))}
    </div>
  )
}
