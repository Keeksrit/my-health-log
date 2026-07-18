import { useState, useEffect, useRef } from 'react'
import { useUnits } from '../lib/useUnits'
import { addUnit, deleteUnit } from '../lib/units'
import { useFoodTypes } from '../lib/useFoodTypes'
import { addFoodType, deleteFoodType, updateFoodTypeColor } from '../lib/foodTypes'
import { PALETTE } from '../lib/foodTypeColors'
import { useLabDescriptions } from '../lib/useLabDescriptions'
import { upsertDescription, deleteDescription, applyDescPlan } from '../lib/labDescriptions'
import { descriptionsToCsv, parseDescRows, computeDescPlan } from '../lib/labDescriptionsCsv'
import { fetchEvents, addEvent, updateEvent, deleteEvent, type LabEvent } from '../lib/labEvents'
import { parseCsv } from '../lib/nutrition'
import styles from './Settings.module.css'

export default function Settings() {
  return (
    <div className={styles.page}>
      <UnitsSection />
      <FoodTypesSection />
      <LabDescriptionsSection />
      <LabEventsSection />
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

function LabDescriptionsSection() {
  const { descriptions, reload } = useLabDescriptions()
  const [analyte, setAnalyte] = useState('')
  const [desc, setDesc] = useState('')
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try { await upsertDescription(analyte, desc); setAnalyte(''); setDesc(''); await reload() }
    catch (err: any) { setError(err?.message ?? 'Could not save description.') }
  }
  async function handleDelete(a: string) {
    setError(null)
    try { await deleteDescription(a); await reload() }
    catch (err: any) { setError(err?.message ?? 'Could not delete.') }
  }
  function handleExport() {
    const csv = descriptionsToCsv(descriptions.map(d => ({ analyte: d.analyte, description: d.description ?? '' })))
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = 'analyte-descriptions.csv'; a.click()
    URL.revokeObjectURL(url)
  }
  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setError(null)
    try {
      const cells = parseCsv(await file.text())
      const plan = computeDescPlan(parseDescRows(cells), descriptions.map(d => d.analyte), 'sync')
      await applyDescPlan(plan)
      await reload()
    } catch (err: any) { setError(err?.message ?? 'Import failed.') }
  }

  return (
    <>
      <h2 className={styles.heading}>Analyte descriptions</h2>
      <p className={styles.hint}>What each analyte means. Shown in the Tests table &amp; charts. Edit here or via CSV.</p>
      <div className={styles.addRow}>
        <button className={styles.add} type="button" onClick={handleExport}>⬇ Export CSV</button>
        <button className={styles.add} type="button" onClick={() => fileRef.current?.click()}>⬆ Import CSV (sync)</button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={handleImport} />
      </div>
      <ul className={styles.list}>
        {descriptions.map(d => (
          <li key={d.analyte} className={styles.item}>
            <span><strong>{d.analyte}</strong> — {d.description}</span>
            <button className={styles.remove} onClick={() => handleDelete(d.analyte)} aria-label={`Delete ${d.analyte}`}>×</button>
          </li>
        ))}
      </ul>
      <form className={styles.addRow} onSubmit={handleAdd}>
        <input className={styles.input} value={analyte} onChange={e => setAnalyte(e.target.value)} placeholder="Analyte" />
        <input className={styles.input} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description" />
        <button className={styles.add} type="submit">Save</button>
      </form>
      {error && <p className={styles.error}>{error}</p>}
    </>
  )
}

function LabEventsSection() {
  const [events, setEvents] = useState<LabEvent[]>([])
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [error, setError] = useState<string | null>(null)

  const reload = async () => {
    try { setEvents(await fetchEvents()) } catch { setEvents([]) }
  }
  useEffect(() => { reload() }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try { await addEvent(name, date, PALETTE[0]); setName(''); setDate(''); await reload() }
    catch (err: any) { setError(err?.message ?? 'Could not add event.') }
  }
  async function handleColor(id: string, color: string) {
    setError(null)
    try { await updateEvent(id, { color }); await reload() }
    catch (err: any) { setError(err?.message ?? 'Could not set color.') }
  }
  async function handleDelete(id: string) {
    setError(null)
    try { await deleteEvent(id); await reload() }
    catch (err: any) { setError(err?.message ?? 'Could not delete.') }
  }

  return (
    <>
      <h2 className={styles.heading}>Events</h2>
      <p className={styles.hint}>Drawn as vertical lines across the Tests trend charts.</p>
      <ul className={styles.list}>
        {events.map(ev => (
          <li key={ev.id} className={styles.item}>
            <span>{ev.event_date} — {ev.name}</span>
            <span className={styles.swatches}>
              {PALETTE.map(c => (
                <button key={c} type="button"
                  className={`${styles.swatch} ${ev.color === c ? styles.swatchActive : ''}`}
                  style={{ background: c }} onClick={() => handleColor(ev.id, c)}
                  aria-label={`Set ${ev.name} color ${c}`} />
              ))}
            </span>
            <button className={styles.remove} onClick={() => handleDelete(ev.id)} aria-label={`Delete ${ev.name}`}>×</button>
          </li>
        ))}
      </ul>
      <form className={styles.addRow} onSubmit={handleAdd}>
        <input className={styles.input} value={name} onChange={e => setName(e.target.value)} placeholder="Event name" />
        <input className={styles.input} type="date" value={date} onChange={e => setDate(e.target.value)} required />
        <button className={styles.add} type="submit">Add</button>
      </form>
      {error && <p className={styles.error}>{error}</p>}
    </>
  )
}
