import { useState } from 'react'
import { useUnits } from '../lib/useUnits'
import { addUnit, deleteUnit } from '../lib/units'
import styles from './Settings.module.css'

export default function Settings() {
  const { units, reload } = useUnits()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await addUnit(name)
      setName('')
      await reload()
    } catch (err: any) {
      setError(err?.message ?? 'Could not add unit.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(id: string) {
    setError(null)
    try {
      await deleteUnit(id)
      await reload()
    } catch (err: any) {
      setError(err?.message ?? 'Could not delete unit.')
    }
  }

  return (
    <div className={styles.page}>
      <h2 className={styles.heading}>Units</h2>
      <p className={styles.hint}>
        Units available when logging food. Deleting one keeps it on past entries.
      </p>

      <ul className={styles.list}>
        {units.map(u => (
          <li key={u.id} className={styles.item}>
            <span>{u.name}</span>
            <button
              className={styles.remove}
              onClick={() => handleDelete(u.id)}
              aria-label={`Delete ${u.name}`}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <form className={styles.addRow} onSubmit={handleAdd}>
        <input
          className={styles.input}
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Add a unit (e.g. tbsp)"
        />
        <button className={styles.add} type="submit" disabled={busy}>Add</button>
      </form>

      {error && <p className={styles.error}>{error}</p>}
    </div>
  )
}
