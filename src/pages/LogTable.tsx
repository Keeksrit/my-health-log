import { useMemo, useState } from 'react'
import type { Food, LogEntry } from '../types/nutrition'
import { LOG_TYPES, LOG_UNITS } from '../types/nutrition'
import { useEditableRows } from '../lib/useEditableRows'
import { updateLogEntries, deleteLogEntry, splitDateTime, combineDateTime } from '../lib/nutrition'
import styles from './Nutrition.module.css'

interface Props {
  log: LogEntry[]
  foods: Food[]
  onSaved: () => void
}

interface LogRow {
  id: string
  date: string
  time: string
  type: string | null
  food_id: string
  foodName: string
  amount: string
  unit: string
}

function toRow(e: LogEntry, foodName: string): LogRow {
  const { date, time } = splitDateTime(e.eaten_at)
  return {
    id: e.id, date, time, type: e.type, food_id: e.food_id, foodName,
    amount: e.amount != null ? String(e.amount) : '',
    unit: e.unit ?? '',
  }
}

export default function LogTable({ log, foods, onSaved }: Props) {
  const nameById = useMemo(() => new Map(foods.map(f => [f.id, f.name])), [foods])
  const source = useMemo(
    () => log.map(e => toRow(e, e.food?.name ?? nameById.get(e.food_id) ?? 'Unknown food')),
    [log, nameById])
  const t = useEditableRows<LogRow>(source)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setSaving(true); setError('')
    try {
      for (const id of t.deletedIds) await deleteLogEntry(id)
      const rows = t.dirtyRows.map(r => {
        const amt = r.amount.trim() ? Number(r.amount) : null
        if (amt != null && !(amt > 0)) throw new Error(`Amount for ${r.foodName} must be positive.`)
        return {
          id: r.id, food_id: r.food_id, amount: amt,
          unit: amt != null ? r.unit : null, type: r.type,
          eaten_at: combineDateTime(r.date, r.time),
        }
      })
      await updateLogEntries(rows)
      onSaved(); t.finish()
    } catch (e: any) {
      setError(e?.message ?? 'Could not save log.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className={styles.tableHead}>
        <span className={styles.sectionLabel}>Log ({log.length})</span>
        <div className={styles.tableActions}>
          {t.editing ? (
            <>
              <button className={styles.tableBtn} disabled={saving} onClick={save}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button className={styles.tableBtn} disabled={saving} onClick={t.cancel}>Cancel</button>
            </>
          ) : (
            log.length > 0 && <button className={styles.tableBtn} onClick={t.begin}>Edit</button>
          )}
        </div>
      </div>
      {error && <p className={styles.tableError}>{error}</p>}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr><th>Date</th><th>Time</th><th>Type</th><th>Food</th><th>Amount</th><th>Unit</th>{t.editing && <th />}</tr>
          </thead>
          <tbody>
            {t.rows.map(r => (
              <tr key={r.id}>
                <td>{t.editing
                  ? <input type="date" className={styles.cellInput} value={r.date}
                      onChange={e => t.setRow(r.id, { date: e.target.value })} />
                  : r.date}</td>
                <td>{t.editing
                  ? <input type="time" className={styles.cellInput} value={r.time}
                      onChange={e => t.setRow(r.id, { time: e.target.value })} />
                  : r.time}</td>
                <td>{t.editing
                  ? <select className={styles.cellSelect} value={r.type ?? ''}
                      onChange={e => t.setRow(r.id, { type: e.target.value || null })}>
                      <option value="">—</option>
                      {LOG_TYPES.map(x => <option key={x} value={x}>{x}</option>)}
                    </select>
                  : (r.type ?? '—')}</td>
                <td>{t.editing
                  ? <select className={styles.cellSelect} value={r.food_id}
                      onChange={e => t.setRow(r.id, {
                        food_id: e.target.value,
                        foodName: nameById.get(e.target.value) ?? '',
                      })}>
                      {foods.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  : r.foodName}</td>
                <td>{t.editing
                  ? <input type="number" min="0" step="any" className={styles.cellInput} value={r.amount}
                      onChange={e => t.setRow(r.id, { amount: e.target.value })} />
                  : (r.amount || '—')}</td>
                <td>{t.editing
                  ? <select className={styles.cellSelect} value={r.unit}
                      onChange={e => t.setRow(r.id, { unit: e.target.value })}>
                      <option value="">—</option>
                      {LOG_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  : (r.unit || '—')}</td>
                {t.editing && (
                  <td><button className={styles.rowDelete} title="Delete"
                    onClick={() => t.removeRow(r.id)}>×</button></td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
