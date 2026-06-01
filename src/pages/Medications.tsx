import { useState, useEffect } from 'react'
import type { MedicationSchedule } from '../types/medication'
import { fetchSchedulesWithTypes } from '../lib/medication'
import AddMedicationFlow from './AddMedicationFlow'
import MedicationTable from './MedicationTable'
import styles from './Medications.module.css'

export default function Medications() {
  const [schedules, setSchedules]   = useState<MedicationSchedule[]>([])
  const [loading, setLoading]       = useState(true)
  const [addOpen, setAddOpen]       = useState(false)
  const [activeSchedule, setActive] = useState<MedicationSchedule | null>(null)

  async function load() {
    try {
      const data = await fetchSchedulesWithTypes()
      setSchedules(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function handleSaved() {
    setAddOpen(false)
    load()
  }

  if (activeSchedule) {
    return (
      <MedicationTable
        schedule={activeSchedule}
        onBack={() => setActive(null)}
      />
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.topRow}>
        <p className={styles.sec}>Medications</p>
        <button className={styles.addBtn} onClick={() => setAddOpen(true)}>+ Add</button>
      </div>

      {loading ? (
        <p className={styles.empty}>Loading…</p>
      ) : schedules.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>💊</div>
          <h2>No medications yet</h2>
          <p>Tap + Add to set up your first medication schedule.</p>
        </div>
      ) : (
        schedules.map(s => {
          const isActive = !s.end_date || s.end_date >= new Date().toISOString().slice(0, 10)
          return (
            <button key={s.id} className={styles.scheduleCard} onClick={() => setActive(s)}>
              <div className={styles.cardRow}>
                <span className={styles.medName}>{s.medication_type?.display_name}</span>
                <span className={`${styles.statusPill} ${isActive ? styles.active : styles.past}`}>
                  {isActive ? 'Active' : 'Past'}
                </span>
              </div>
              {s.medication_type?.strength && (
                <span className={styles.medDetail}>{s.medication_type.strength}</span>
              )}
              {s.medication_type?.form && (
                <span className={styles.medDetail}> · {s.medication_type.form}</span>
              )}
              <div className={styles.dateRange}>
                {s.start_date} → {s.end_date ?? 'ongoing'}
              </div>
              <div className={styles.defaults}>
                {s.default_count} × daily · {s.default_time}
              </div>
            </button>
          )
        })
      )}

      {addOpen && (
        <AddMedicationFlow
          onClose={() => setAddOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
