import { useMemo, useState } from 'react'
import type { Food, LogEntry } from '../types/nutrition'
import { LOG_UNITS } from '../types/nutrition'
import { insertLogEntries, updateLogEntry, getOrCreateFoodByName } from '../lib/nutrition'
import modalStyles from './Modal.module.css'
import formStyles from './AddMedicationFlow.module.css'
import styles from './LogEntryModal.module.css'

interface Props {
  foods: Food[]
  entry?: LogEntry | null
  onClose: () => void
  onSaved: () => void
}

interface Row {
  food: Food
  amount: string
  unit: string
}

// Snap a date down to the nearest 15-minute boundary.
function snap15(d: Date): Date {
  const out = new Date(d)
  out.setSeconds(0, 0)
  out.setMinutes(Math.floor(out.getMinutes() / 15) * 15)
  return out
}

function formatEatenAt(d: Date): string {
  const date = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${date} · ${time}`
}

export default function LogEntryModal({ foods, entry, onClose, onSaved }: Props) {
  const editing = !!entry

  const [foodList, setFoodList] = useState<Food[]>(foods)
  const [picked, setPicked] = useState<Row[]>(() => {
    if (entry) {
      const f = foods.find(x => x.id === entry.food_id) ?? entry.food
      if (f) return [{ food: f, amount: entry.amount != null ? String(entry.amount) : '', unit: entry.unit ?? 'serving' }]
    }
    return []
  })
  const [query, setQuery] = useState('')
  const [eatenAt, setEatenAt] = useState<Date>(() => snap15(entry ? new Date(entry.eaten_at) : new Date()))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const pickedIds = picked.map(r => r.food.id)

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return foodList.filter(f => f.name.toLowerCase().includes(q) && !pickedIds.includes(f.id)).slice(0, 8)
  }, [query, foodList, picked])

  const exactExists = foodList.some(f => f.name.toLowerCase() === query.trim().toLowerCase())

  function selectFood(food: Food) {
    setQuery('')
    if (editing) {
      setPicked([{ food, amount: picked[0]?.amount ?? '', unit: picked[0]?.unit ?? 'serving' }])
    } else if (!pickedIds.includes(food.id)) {
      setPicked([...picked, { food, amount: '', unit: 'serving' }])
    }
  }

  async function createAndSelect() {
    const name = query.trim()
    if (!name) return
    try {
      const food = await getOrCreateFoodByName(name)
      setFoodList(prev => (prev.some(f => f.id === food.id) ? prev : [...prev, food]))
      selectFood(food)
    } catch (e: any) {
      setError(e?.message ?? 'Could not create food.')
    }
  }

  function removeRow(id: string) {
    setPicked(picked.filter(r => r.food.id !== id))
  }
  function setRowAmount(id: string, amount: string) {
    setPicked(picked.map(r => (r.food.id === id ? { ...r, amount } : r)))
  }
  function setRowUnit(id: string, unit: string) {
    setPicked(picked.map(r => (r.food.id === id ? { ...r, unit } : r)))
  }

  function nudge(deltaMin: number) {
    setEatenAt(prev => {
      const d = new Date(prev)
      d.setMinutes(d.getMinutes() + deltaMin)
      return d
    })
  }

  async function handleSave() {
    if (picked.length === 0) { setError('Pick at least one food.'); return }
    for (const r of picked) {
      if (r.amount.trim() && !(Number(r.amount) > 0)) {
        setError(`Amount for ${r.food.name} must be a positive number.`)
        return
      }
    }
    setSaving(true)
    setError('')
    const eaten_at = eatenAt.toISOString()
    const rows = picked.map(r => {
      const amt = r.amount.trim() ? Number(r.amount) : null
      return { food_id: r.food.id, amount: amt, unit: amt != null ? r.unit : null, eaten_at }
    })
    try {
      if (entry) await updateLogEntry(entry.id, rows[0])
      else await insertLogEntries(rows)
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
          <h2 className={modalStyles.title}>{editing ? 'Edit entry' : 'Log entry'}</h2>
          <button className={formStyles.cancelBtn} onClick={onClose}>Cancel</button>
        </div>

        <label className={formStyles.label}>{editing ? 'FOOD' : 'FOODS'} *</label>

        {picked.length > 0 && (
          <div className={styles.rows}>
            {picked.map(r => (
              <div key={r.food.id} className={styles.row}>
                <span className={styles.rowName}>{r.food.name}</span>
                <input
                  className={styles.amountInput}
                  type="number"
                  min="0"
                  step="any"
                  value={r.amount}
                  onChange={e => setRowAmount(r.food.id, e.target.value)}
                  placeholder="amt"
                />
                <select
                  className={styles.unitSelect}
                  value={r.unit}
                  onChange={e => setRowUnit(r.food.id, e.target.value)}
                >
                  {LOG_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                {!editing && (
                  <button className={styles.rowRemove} onClick={() => removeRow(r.food.id)}>×</button>
                )}
              </div>
            ))}
          </div>
        )}

        <input
          className={formStyles.input}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={editing ? 'Change food…' : 'Type to add a food…'}
        />
        {query.trim() && (
          <div className={styles.suggestions}>
            {suggestions.map(f => (
              <button key={f.id} className={styles.suggestion} onClick={() => selectFood(f)}>
                {f.name}{f.type ? ` · ${f.type}` : ''}
              </button>
            ))}
            {!exactExists && (
              <button className={`${styles.suggestion} ${styles.createRow}`} onClick={createAndSelect}>
                + Create "{query.trim()}"
              </button>
            )}
          </div>
        )}

        <label className={formStyles.label}>EATEN AT</label>
        <div className={styles.eatenAt}>
          <span className={styles.eatenAtDisplay}>{formatEatenAt(eatenAt)}</span>
          <div className={styles.nudges}>
            <button className={styles.nudgeBtn} onClick={() => nudge(-1440)}>− day</button>
            <button className={styles.nudgeBtn} onClick={() => nudge(1440)}>+ day</button>
            <button className={styles.nudgeBtn} onClick={() => nudge(-15)}>− 15m</button>
            <button className={styles.nudgeBtn} onClick={() => nudge(15)}>+ 15m</button>
          </div>
        </div>

        {error && <p className={modalStyles.desc} style={{ color: 'var(--danger, #B83A3A)' }}>{error}</p>}

        <button className={formStyles.nextBtn} disabled={saving} onClick={handleSave}>
          {saving ? 'Saving…' : editing ? 'Save changes' : picked.length > 1 ? `Log ${picked.length} foods` : 'Log it'}
        </button>
      </div>
    </div>
  )
}
