import { useState } from 'react'
import { useUnits } from '../lib/useUnits'
import { addUnit, deleteUnit } from '../lib/units'
import { useFoodTypes } from '../lib/useFoodTypes'
import { addFoodType, deleteFoodType, updateFoodTypeColor } from '../lib/foodTypes'
import { PALETTE } from '../lib/foodTypeColors'
import styles from './Settings.module.css'

export default function Settings() {
  return (
    <div className={styles.page}>
      <UnitsSection />
      <FoodTypesSection />
    </div>
  )
}

function UnitsSection() {
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
    <>
      <h2 className={styles.heading}>Units</h2>
      <p className={styles.hint}>
        Units available when logging food. Deleting one keeps it on past entries.
      </p>
      <ul className={styles.list}>
        {units.map(u => (
          <li key={u.id} className={styles.item}>
            <span>{u.name}</span>
            <button className={styles.remove} onClick={() => handleDelete(u.id)} aria-label={`Delete ${u.name}`}>×</button>
          </li>
        ))}
      </ul>
      <form className={styles.addRow} onSubmit={handleAdd}>
        <input className={styles.input} value={name} onChange={e => setName(e.target.value)} placeholder="Add a unit (e.g. tbsp)" />
        <button className={styles.add} type="submit" disabled={busy}>Add</button>
      </form>
      {error && <p className={styles.error}>{error}</p>}
    </>
  )
}

function FoodTypesSection() {
  const { foodTypes, reload } = useFoodTypes()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await addFoodType(name)
      setName('')
      await reload()
    } catch (err: any) {
      setError(err?.message ?? 'Could not add food type.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(id: string) {
    setError(null)
    try {
      await deleteFoodType(id)
      await reload()
    } catch (err: any) {
      setError(err?.message ?? 'Could not delete food type.')
    }
  }

  async function handleColor(id: string, color: string) {
    setError(null)
    try {
      await updateFoodTypeColor(id, color)
      await reload()
    } catch (err: any) {
      setError(err?.message ?? 'Could not set color.')
    }
  }

  return (
    <>
      <h2 className={styles.heading}>Food types</h2>
      <p className={styles.hint}>
        Categories available when adding a food. Deleting one keeps it on existing foods.
      </p>
      <ul className={styles.list}>
        {foodTypes.map(t => (
          <li key={t.id} className={styles.item}>
            <span>{t.name}</span>
            <span className={styles.swatches}>
              {PALETTE.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`${styles.swatch} ${t.color === c ? styles.swatchActive : ''}`}
                  style={{ background: c }}
                  onClick={() => handleColor(t.id, c)}
                  aria-label={`Set ${t.name} color ${c}`}
                />
              ))}
            </span>
            <button className={styles.remove} onClick={() => handleDelete(t.id)} aria-label={`Delete ${t.name}`}>×</button>
          </li>
        ))}
      </ul>
      <form className={styles.addRow} onSubmit={handleAdd}>
        <input className={styles.input} value={name} onChange={e => setName(e.target.value)} placeholder="Add a food type (e.g. dessert)" />
        <button className={styles.add} type="submit" disabled={busy}>Add</button>
      </form>
      {error && <p className={styles.error}>{error}</p>}
    </>
  )
}
