import { useState } from 'react'
import type { MedicationSchedule } from '../types/medication'
import { updateMedicationType, updateSchedule } from '../lib/medication'
import { createClient } from '@supabase/supabase-js'
import modalStyles from './Modal.module.css'
import styles from './AddMedicationFlow.module.css'
import ownStyles from './EditMedicationModal.module.css'

const db = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  { db: { schema: 'health' } }
)

interface Props {
  schedule: MedicationSchedule
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
}

export default function EditMedicationModal({ schedule, onClose, onSaved, onDeleted }: Props) {
  const med = schedule.medication_type!

  const [displayName,   setDisplayName]   = useState(med.display_name)
  const [technicalName, setTechnicalName] = useState(med.technical_name ?? '')
  const [form,          setForm]          = useState(med.form ?? '')
  const [strength,      setStrength]      = useState(med.strength ?? '')
  const [startDate,     setStartDate]     = useState(schedule.start_date)
  const [endDate,       setEndDate]       = useState(schedule.end_date ?? '')
  const [defaultCount,  setDefaultCount]  = useState(schedule.default_count)
  const [defaultTime,   setDefaultTime]   = useState(schedule.default_time)
  const [saving,        setSaving]        = useState(false)
  const [deleting,      setDeleting]      = useState(false)

  async function handleSave() {
    if (!displayName.trim()) { alert('Display name is required.'); return }
    setSaving(true)
    try {
      await updateMedicationType(med.id, {
        display_name:   displayName.trim(),
        technical_name: technicalName.trim() || null,
        form:           form.trim() || null,
        strength:       strength.trim() || null,
      })
      await updateSchedule(schedule.id, {
        start_date:    startDate,
        end_date:      endDate || null,
        default_count: defaultCount,
        default_time:  defaultTime,
      })
      onSaved()
    } catch (e) {
      console.error(e)
      alert('Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete ${med.display_name} and all its log entries? This cannot be undone.`)) return
    setDeleting(true)
    try {
      // Cascade deletes schedules and logs automatically
      await db.from('medication_types').delete().eq('id', med.id)
      onDeleted()
    } catch (e) {
      console.error(e)
      alert('Something went wrong.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className={modalStyles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={modalStyles.sheet}>
        <div className={modalStyles.handle} />
        <div className={styles.header}>
          <h2 className={modalStyles.title}>Edit medication</h2>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
        </div>

        <label className={styles.label}>DISPLAY NAME *</label>
        <input className={styles.input} type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} />

        <label className={styles.label}>TECHNICAL NAME</label>
        <input className={styles.input} type="text" value={technicalName} onChange={e => setTechnicalName(e.target.value)} />

        <label className={styles.label}>FORM</label>
        <input className={styles.input} type="text" value={form} onChange={e => setForm(e.target.value)} />

        <label className={styles.label}>STRENGTH</label>
        <input className={styles.input} type="text" value={strength} onChange={e => setStrength(e.target.value)} />

        <label className={styles.label}>START DATE</label>
        <input className={styles.input} type="text" value={startDate} onChange={e => setStartDate(e.target.value)} />

        <label className={styles.label}>END DATE <span className={styles.optional}>(optional)</span></label>
        <input className={styles.input} type="text" value={endDate} onChange={e => setEndDate(e.target.value)} placeholder="Leave blank if ongoing" />

        <label className={styles.label}>DEFAULT COUNT</label>
        <input className={styles.input} type="text" value={defaultCount} onChange={e => setDefaultCount(e.target.value)} />

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
          {saving ? 'Saving…' : 'Save changes'}
        </button>

        <button className={ownStyles.deleteBtn} disabled={deleting} onClick={handleDelete}>
          {deleting ? 'Deleting…' : 'Delete medication'}
        </button>
      </div>
    </div>
  )
}
