import { useState, useEffect, useCallback } from 'react'
import type { MedicationSchedule, MedicationLog } from '../types/medication'
import Loader from '../components/ui/Loader'
import { fetchLogsForSchedule, upsertLog } from '../lib/medication'
import styles from './MedicationTable.module.css'

interface Props {
  schedule: MedicationSchedule
  onBack: () => void
}

export default function MedicationTable({ schedule, onBack }: Props) {
  const [logs, setLogs]         = useState<MedicationLog[]>([])
  const [loading, setLoading]   = useState(true)
  const [dirty, setDirty]       = useState<Record<string, MedicationLog>>({})
  const [saving, setSaving]     = useState(false)

  async function load() {
    const data = await fetchLogsForSchedule(schedule.id)
    setLogs(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [schedule.id])

  function handleChange(log: MedicationLog, field: 'time' | 'count', value: string) {
    const updated = { ...log, [field]: value }
    setLogs(prev => prev.map(l => l.id === log.id ? updated : l))
    setDirty(prev => ({ ...prev, [log.id]: updated }))
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

  async function handleSaveAll() {
    const changes = Object.values(dirty)
    if (!changes.length) return
    setSaving(true)
    for (const log of changes) {
      await upsertLog({
        schedule_id: log.schedule_id,
        date:        log.date,
        time:        log.time,
        count:       log.count,
      })
    }
    setDirty({})
    setSaving(false)
  }

  const med = schedule.medication_type
  const hasDirty = Object.keys(dirty).length > 0

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
        <Loader />
      ) : logs.length === 0 ? (
        <p className={styles.loading}>No log entries yet.</p>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <div className={styles.headerRow}>
              <div className={styles.colDate}>Date</div>
              <div className={styles.colTime}>Time</div>
              <div className={styles.colCount}>Count</div>
            </div>

            {logs.map(log => {
              const [h, m] = log.time.split(':').map(Number)
              const isDirty = !!dirty[log.id]
              return (
                <div key={log.id} className={`${styles.row} ${isDirty ? styles.rowDirty : ''}`}>
                  <div className={styles.colDate}>
                    <span className={styles.dateText}>
                      {new Date(log.date + 'T12:00:00').toLocaleDateString('en-GB', {
                        weekday: 'short', day: 'numeric', month: 'short'
                      })}
                    </span>
                  </div>

                  <div className={styles.colTime}>
                    <div className={styles.timeControl}>
                      <div className={styles.timeUnit}>
                        <button className={styles.stepBtn} onClick={() => bumpHour(log, 1)}>+</button>
                        <span className={styles.timeSegment}>{String(h).padStart(2, '0')}</span>
                        <button className={styles.stepBtn} onClick={() => bumpHour(log, -1)}>−</button>
                      </div>
                      <span className={styles.timeSep}>:</span>
                      <div className={styles.timeUnit}>
                        <button className={styles.stepBtn} onClick={() => bumpMinute(log, 1)}>+</button>
                        <span className={styles.timeSegment}>{String(m).padStart(2, '0')}</span>
                        <button className={styles.stepBtn} onClick={() => bumpMinute(log, -1)}>−</button>
                      </div>
                    </div>
                  </div>

                  <div className={styles.colCount}>
                    <input
                      className={styles.countInput}
                      type="text"
                      value={log.count}
                      onChange={e => handleChange(log, 'count', e.target.value)}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          <div className={styles.saveBarWrap}>
            <button
              className={`${styles.saveBar} ${hasDirty ? styles.saveBarActive : ''}`}
              disabled={!hasDirty || saving}
              onClick={handleSaveAll}
            >
              {saving ? 'Saving…' : hasDirty ? `Save changes (${Object.keys(dirty).length})` : 'No unsaved changes'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
