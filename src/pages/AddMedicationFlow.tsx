import { useState } from 'react'
import type { MedicationType } from '../types/medication'
import {
  insertMedicationType,
  insertSchedule,
  insertLogs,
  generateLogRows,
} from '../lib/medication'
import styles from './AddMedicationFlow.module.css'
import modalStyles from './Modal.module.css'

interface Props {
  onClose: () => void
  onSaved: () => void
}

type Step = 'details' | 'schedule'

export default function AddMedicationFlow({ onClose, onSaved }: Props) {
  const [step, setStep] = useState<Step>('details')

  // Step 1 — details
  const [displayName,   setDisplayName]   = useState('')
  const [technicalName, setTechnicalName] = useState('')
  const [form,          setForm]          = useState('')
  const [strength,      setStrength]      = useState('')

  // Step 2 — schedule
  const [startDate,     setStartDate]     = useState(new Date().toISOString().slice(0, 10))
  const [endDate,       setEndDate]       = useState('')
  const [defaultCount,  setDefaultCount]  = useState('1')
  const [defaultTime,   setDefaultTime]   = useState('08:00')
  const [saving,        setSaving]        = useState(false)

  async function handleSave() {
    if (!displayName.trim()) { alert('Display name is required.'); return }
    if (!startDate) { alert('Start date is required.'); return }
    setSaving(true)
    try {
      // 1. Insert medication type
      const medType = await insertMedicationType({
        display_name:   displayName.trim(),
        technical_name: technicalName.trim() || null,
        form:           form.trim() || null,
        strength:       strength.trim() || null,
      })

      // 2. Insert schedule
      const schedule = await insertSchedule({
        medication_type_id: medType.id,
        start_date:    startDate,
        end_date:      endDate || null,
        default_count: defaultCount,
        default_time:  defaultTime,
      })

      // 3. Pre-generate log rows from start to today
      const rows = generateLogRows(schedule.id, startDate, endDate || null, defaultTime, defaultCount)
      await insertLogs(rows)

      onSaved()
    } catch (e) {
      console.error(e)
      alert('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={modalStyles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={modalStyles.sheet}>
        <div className={modalStyles.handle} />

        <div className={styles.header}>
          {step === 'schedule' && (
            <button className={styles.backBtn} onClick={() => setStep('details')}>←</button>
          )}
          <h2 className={modalStyles.title}>
            {step === 'details' ? 'Medication details' : 'Schedule'}
          </h2>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
        </div>

        {/* ── Step 1: Details ── */}
        {step === 'details' && (
          <div>
            <label className={styles.label}>DISPLAY NAME *</label>
            <input
              className={styles.input}
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="e.g. Vitamin D"
              autoFocus
            />

            <label className={styles.label}>TECHNICAL NAME</label>
            <input
              className={styles.input}
              type="text"
              value={technicalName}
              onChange={e => setTechnicalName(e.target.value)}
              placeholder="e.g. Cholecalciferol"
            />

            <label className={styles.label}>FORM</label>
            <input
              className={styles.input}
              type="text"
              value={form}
              onChange={e => setForm(e.target.value)}
              placeholder="e.g. Tablet, Capsule, Liquid"
            />

            <label className={styles.label}>STRENGTH</label>
            <input
              className={styles.input}
              type="text"
              value={strength}
              onChange={e => setStrength(e.target.value)}
              placeholder="e.g. 1000 IU, 50mg"
            />

            <button
              className={styles.nextBtn}
              disabled={!displayName.trim()}
              onClick={() => setStep('schedule')}
            >
              Next →
            </button>
          </div>
        )}

        {/* ── Step 2: Schedule ── */}
        {step === 'schedule' && (
          <div>
            <label className={styles.label}>START DATE *</label>
            <input
              className={styles.input}
              type="text"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              placeholder="YYYY-MM-DD"
            />

            <label className={styles.label}>END DATE <span className={styles.optional}>(optional)</span></label>
            <input
              className={styles.input}
              type="text"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              placeholder="YYYY-MM-DD — leave blank if ongoing"
            />

            <label className={styles.label}>DEFAULT COUNT PER DAY</label>
            <input
              className={styles.input}
              type="text"
              value={defaultCount}
              onChange={e => setDefaultCount(e.target.value)}
              placeholder="e.g. 1"
            />

            <label className={styles.label}>DEFAULT TIME</label>
            <div className={styles.timeRow}>
              <button className={styles.timeBtn} onClick={() => {
                const [h, m] = defaultTime.split(':').map(Number)
                const total = Math.max(0, h * 60 + m - 15)
                setDefaultTime(`${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`)
              }}>−</button>
              <span className={styles.timeDisplay}>{defaultTime}</span>
              <button className={styles.timeBtn} onClick={() => {
                const [h, m] = defaultTime.split(':').map(Number)
                const total = Math.min(23*60+45, h * 60 + m + 15)
                setDefaultTime(`${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`)
              }}>+</button>
            </div>

            <button className={styles.nextBtn} disabled={saving} onClick={handleSave}>
              {saving ? 'Saving…' : 'Save & generate log'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
