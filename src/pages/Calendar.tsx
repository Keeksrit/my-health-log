import { useState } from 'react'
import type { Entry } from '../types'
import { dateKey, todayKey, fmtDateLong, uid } from '../lib/utils'
import { insertEntry } from '../lib/supabase'
import EntryCard from '../components/ui/EntryCard'
import Icon from '../components/ui/Icon'
import DuplicateDayModal from './DuplicateDayModal'
import styles from './Calendar.module.css'

interface Props {
  entries: Entry[]
  onReload: () => void
}

export default function Calendar({ entries, onReload }: Props) {
  const now = new Date()
  const [year, setYear]         = useState(now.getFullYear())
  const [month, setMonth]       = useState(now.getMonth())
  const [selected, setSelected] = useState<string | null>(null)
  const [dupOpen, setDupOpen]   = useState(false)

  const map: Record<string, { count: number; maxSev: number }> = {}
  entries.forEach(e => {
    const k = dateKey(e.created_at)
    if (!map[k]) map[k] = { count: 0, maxSev: 0 }
    map[k].count++
    if (e.severity) map[k].maxSev = Math.max(map[k].maxSev, e.severity)
  })

  const firstDay  = new Date(year, month, 1)
  const lastDate  = new Date(year, month + 1, 0).getDate()
  const monthName = firstDay.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  let startDow    = firstDay.getDay()
  startDow = startDow === 0 ? 6 : startDow - 1

  function changeMonth(dir: number) {
    let m = month + dir, y = year
    if (m > 11) { m = 0; y++ }
    if (m < 0)  { m = 11; y-- }
    setMonth(m); setYear(y); setSelected(null)
  }

  function dKey(d: number) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  const todayStr     = todayKey()
  const selEntries   = selected
    ? entries.filter(e => dateKey(e.created_at) === selected).sort((a, b) => b.created_at - a.created_at)
    : []

  function cellClass(k: string) {
    const info = map[k]
    let cls = styles.cell
    if (k === todayStr)  cls += ` ${styles.today}`
    if (k === selected)  cls += ` ${styles.cellSelected}`
    if (info) {
      if (info.maxSev >= 4)   cls += ` ${styles.sevHigh}`
      else if (info.maxSev === 3) cls += ` ${styles.sevMid}`
      else                    cls += ` ${styles.sevLow}`
    }
    return cls
  }

  return (
    <div className={styles.page}>
      <div className={styles.calHeader}>
        <button className={styles.navBtn} onClick={() => changeMonth(-1)}>‹</button>
        <h2 className={styles.monthTitle}>{monthName}</h2>
        <button className={styles.navBtn} onClick={() => changeMonth(1)}>›</button>
      </div>

      <div className={styles.grid}>
        {['M','T','W','T','F','S','S'].map((d, i) => (
          <div key={i} className={styles.dayName}>{d}</div>
        ))}
        {Array(startDow).fill(null).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: lastDate }, (_, i) => i + 1).map(d => {
          const k = dKey(d)
          return (
            <div key={d} className={cellClass(k)} onClick={() => setSelected(k)}>
              {d}
            </div>
          )
        })}
      </div>

      {selected && (
        <>
          <div className={styles.dayHeader}>
            <p className={styles.sec}>{fmtDateLong(selected)}</p>
            {selEntries.length > 0 && (
              <button className={styles.dupDayBtn} onClick={() => setDupOpen(true)}>
                <Icon name="copy" size={14} /> Duplicate day
              </button>
            )}
          </div>
          {selEntries.length === 0
            ? <div className={styles.noEntries}>No entries this day</div>
            : selEntries.map(e => <EntryCard key={e.id} entry={e} />)
          }
        </>
      )}

      <DuplicateDayModal
        open={dupOpen}
        sourceDay={selected ?? todayKey()}
        entries={entries}
        onClose={() => setDupOpen(false)}
        onDone={onReload}
      />
    </div>
  )
}
