import { useState, useEffect } from 'react'
import type { MedicationSchedule, MedicationLog } from '../types/medication'
import { fetchLogsForSchedule, upsertLog } from '../lib/medication'
import styles from './MedicationTable.module.css'

interface Props {
  schedule: MedicationSchedule
  onBack: () => void
}

export default function MedicationTable({ schedule, onBack }: Props) {
  const [logs, setLogs]       = useState<MedicationLog[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState<Record<string, boolean>>({})

  async function load() {
    const data = await fetchLogsForSchedule(schedule.id)
    setLogs(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [schedule.id])

  async function handleChange(log: MedicationLog, field: 'time' | 'count', value: string) {
    const updated = { ...log, [field]: value }
    setLogs(prev => prev.map(l => l.id === log.id ? updated : l))
    setSaving(prev => ({ ...prev, [log.id]: true }))
    await upsertLog({
      schedule_id: updated.schedule_id,
      date:        updated.date,
      time:        updated.time,
      count:       updated.count,
    })
    setSaving(prev => ({ ...prev, [log.id]: false }))
  }

  function bumpHour(log: MedicationLog, delta: number) {
    const [h, m] = log.time.split(':').map(Number)
    const newH = Math.min(23, Math.max(0, h + delta))
    handleChange(log, 'time', `${String(newH).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  }

  function bumpMinute(log: MedicationLog, delta: number) {
    const [h, m] = log.time.split(':').map(Number)
    const steps = [0, 15, 30, 45]
    const currentIdx = steps.indexOf(m)
    const baseIdx = currentIdx === -1 ? 0 : currentIdx
    const newIdx = Math.min(3, Math.max(0, baseIdx + delta))
    handleChange(log, 'time', `${String(h).padStart(2, '0')}:${String(steps[newIdx]).padStart(2, '0')}`)
  }

  const med = schedule.medication_type

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={onBack}>←</button>
        <div className={styles.titleBlock}>
          <h2 className={styles.title}>{med?.display_name}</h2>
          <p className={styles.subtitle}>
            {[med?.strength, med?.form].filter(Boolean).join(' · ')}
            {' · '}
            {schedule.start_date} → {schedule.end_date ?? 'ongoing'}
          </p>
        </div>
      </div>

      {loading ? (
        <p className={styles.loading}>Loading…</p>
      ) : logs.length === 0 ? (
        <p className={styles.loading}>No log entries yet.</p>
      ) : (
        <div className={styles.tableWrap}>
          <div className={styles.headerRow}>
            <div className={styles.colDate}>Date</div>
            <div className={styles.colTime}>Time</div>
            <div className={styles.colCount}>Count</div>
            <div className={styles.colStatus} />
          </div>

          {logs.map(log => {
            const [h, m] = log.time.split(':').map(Number)
            return (
              <div key={log.id} className={styles.row}>
                {/* Date */}
                <div className={styles.colDate}>
                  <span className={styles.dateText}>
                    {new Date(log.date + 'T12:00:00').toLocaleDateString('en-GB', {
                      weekday: 'short', day: 'numeric', month: 'short'
                    })}
                  </span>
                </div>

                {/* Time */}
                <div className={styles.colTime}>
                  <div className={styles.timeControl}>
                    {/* Hours */}
                    <div className={styles.timeUnit}>
                      <button className={styles.stepBtn} onClick={() => bumpHour(log, 1)}>+</button>
                      <span className={styles.timeSegment}>{String(h).padStart(2, '0')}</span>
                      <button className={styles.stepBtn} onClick={() => bumpHour(log, -1)}>−</button>
                    </div>
                    <span className={styles.timeSep}>:</span>
                    {/* Minutes */}
                    <div className={styles.timeUnit}>
                      <button className={styles.stepBtn} onClick={() => bumpMinute(log, 1)}>+</button>
                      <span className={styles.timeSegment}>{String(m).padStart(2, '0')}</span>
                      <button className={styles.stepBtn} onClick={() => bumpMinute(log, -1)}>−</button>
                    </div>
                  </div>
                </div>

                {/* Count */}
                <div className={styles.colCount}>
                  <input
                    className={styles.countInput}
                    type="text"
                    value={log.count}
                    onChange={e => handleChange(log, 'count', e.target.value)}
                  />
                </div>

                {/* Saving indicator */}
                <div className={styles.colStatus}>
                  {saving[log.id] && <span className={styles.savingDot} />}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
