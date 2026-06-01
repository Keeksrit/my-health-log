import { useState } from 'react'
import type { Entry } from '../types'
import { dateKey, todayKey, uid } from '../lib/utils'
import { insertEntry } from '../lib/supabase'
import styles from './Modal.module.css'

interface Props {
  open: boolean
  sourceDay: string
  entries: Entry[]
  onClose: () => void
  onDone: () => void
}

export default function DuplicateDayModal({ open, sourceDay, entries, onClose, onDone }: Props) {
  const [target, setTarget] = useState(todayKey())
  const [saving, setSaving] = useState(false)

  if (!open) return null

  async function handleConfirm() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) {
      alert('Use YYYY-MM-DD format.')
      return
    }
    setSaving(true)
    const dayEntries = entries.filter(e => dateKey(e.created_at) === sourceDay)
    const targetTs = new Date(target + 'T12:00:00').getTime()
    for (const e of dayEntries) {
      await insertEntry({ ...e, id: uid(), created_at: targetTs + Math.random() * 1000, entry_date: target })
    }
    setSaving(false)
    onDone()
    onClose()
  }

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.sheet}>
        <div className={styles.handle} />
        <h2 className={styles.title}>Duplicate Day</h2>
        <p className={styles.desc}>Copy all entries to another date.</p>
        <label className={styles.label}>Target date</label>
        <input
          className={styles.input}
          type="text"
          value={target}
          onChange={e => setTarget(e.target.value)}
          placeholder="YYYY-MM-DD"
        />
        <p className={styles.hint}>e.g. {todayKey()}</p>
        <button className={styles.saveBtn} disabled={saving} onClick={handleConfirm}>
          {saving ? 'Copying…' : `Copy entries to ${target}`}
        </button>
        <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}
