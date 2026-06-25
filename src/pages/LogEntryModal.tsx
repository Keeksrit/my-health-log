import { useState } from 'react'
import type { Food, LogEntry } from '../types/nutrition'
import { LOG_UNITS } from '../types/nutrition'
import { insertLogEntry, updateLogEntry } from '../lib/nutrition'
import modalStyles from './Modal.module.css'
import formStyles from './AddMedicationFlow.module.css'

interface Props {
  foods: Food[]
  entry?: LogEntry | null
  onClose: () => void
  onSaved: () => void
}

// datetime-local wants "YYYY-MM-DDTHH:mm"; trim a stored ISO string to that.
function toLocalInput(iso: string): string {
  return iso.slice(0, 16)
}

export default function LogEntryModal({ foods, entry, onClose, onSaved }: Props) {
  const [foodId, setFoodId] = useState(entry?.food_id ?? '')
  const [search, setSearch] = useState('')
  const [amount, setAmount] = useState(entry ? String(entry.amount) : '')
  const [unit, setUnit] = useState(entry?.unit ?? 'serving')
  const [eatenAt, setEatenAt] = useState(
    entry ? toLocalInput(entry.eaten_at) : new Date().toISOString().slice(0, 16)
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const filtered = search.trim()
    ? foods.filter(f => f.name.toLowerCase().includes(search.trim().toLowerCase()))
    : foods

  async function handleSave() {
    const amt = Number(amount)
    if (!foodId) { setError('Pick a food.'); return }
    if (!(amt > 0)) { setError('Amount must be a positive number.'); return }
    if (!eatenAt) { setError('Pick a date & time.'); return }
    setSaving(true)
    setError('')
    const payload = { food_id: foodId, amount: amt, unit, eaten_at: new Date(eatenAt).toISOString() }
    try {
      if (entry) await updateLogEntry(entry.id, payload)
      else await insertLogEntry(payload)
      onSaved()
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong.')
      setSaving(false)
    }
  }

  return (
    <div className={modalStyles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={modalStyles.sheet}>
        <div className={modalStyles.handle} />
        <div className={formStyles.header}>
          <h2 className={modalStyles.title}>{entry ? 'Edit entry' : 'Log entry'}</h2>
          <button className={formStyles.cancelBtn} onClick={onClose}>Cancel</button>
        </div>

        <label className={formStyles.label}>FOOD *</label>
        <input
          className={formStyles.input}
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search foods…"
        />
        <select
          className={formStyles.input}
          style={{ marginTop: 8 }}
          size={Math.min(6, Math.max(2, filtered.length))}
          value={foodId}
          onChange={e => setFoodId(e.target.value)}
        >
          {filtered.map(f => (
            <option key={f.id} value={f.id}>{f.name}{f.type ? ` · ${f.type}` : ''}</option>
          ))}
        </select>

        <label className={formStyles.label}>AMOUNT *</label>
        <input
          className={formStyles.input}
          type="number"
          min="0"
          step="any"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="e.g. 200"
        />

        <label className={formStyles.label}>UNIT</label>
        <select className={formStyles.input} value={unit} onChange={e => setUnit(e.target.value)}>
          {LOG_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
        </select>

        <label className={formStyles.label}>EATEN AT</label>
        <input
          className={formStyles.input}
          type="datetime-local"
          value={eatenAt}
          onChange={e => setEatenAt(e.target.value)}
        />

        {error && <p className={modalStyles.desc} style={{ color: 'var(--danger, #B83A3A)' }}>{error}</p>}

        <button className={formStyles.nextBtn} disabled={saving} onClick={handleSave}>
          {saving ? 'Saving…' : entry ? 'Save changes' : 'Log it'}
        </button>
      </div>
    </div>
  )
}
