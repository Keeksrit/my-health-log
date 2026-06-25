import { useState } from 'react'
import { LOG_UNITS } from '../types/nutrition'
import {
  parseCsv,
  insertIngredient,
  getOrCreateIngredientByName,
  insertFood,
  getOrCreateFoodByName,
  insertLogEntry,
} from '../lib/nutrition'
import modalStyles from './Modal.module.css'
import formStyles from './AddMedicationFlow.module.css'

type Format = 'ingredients' | 'foods' | 'log'

interface Props {
  onClose: () => void
  onSaved: () => void
}

interface Summary {
  inserted: number
  stubs: string[]
  errors: string[]
}

// Treat the first row as a header only if it looks like one (non-numeric first cell
// matching a known column name). To stay lenient we simply drop a row whose first
// cell equals the expected header keyword.
function dropHeader(rows: string[][], firstHeader: string): string[][] {
  if (rows.length && rows[0][0]?.trim().toLowerCase() === firstHeader) return rows.slice(1)
  return rows
}

export default function ImportCsvModal({ onClose, onSaved }: Props) {
  const [format, setFormat] = useState<Format>('ingredients')
  const [text, setText] = useState('')
  const [rows, setRows] = useState<string[][] | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setText(String(reader.result ?? ''))
    reader.readAsText(file)
  }

  function preview() {
    setError('')
    const parsed = parseCsv(text.trim())
    if (!parsed.length) { setError('Nothing to parse.'); return }
    setRows(parsed)
  }

  async function runImport() {
    if (!rows) return
    setBusy(true)
    setError('')
    const sum: Summary = { inserted: 0, stubs: [], errors: [] }
    try {
      if (format === 'ingredients') {
        for (const r of dropHeader(rows, 'name')) {
          const [name, type] = r
          if (!name?.trim()) { sum.errors.push(`Empty name in row: ${r.join(',')}`); continue }
          await insertIngredient({ name: name.trim(), type: type?.trim() || null })
          sum.inserted++
        }
      } else if (format === 'foods') {
        for (const r of dropHeader(rows, 'name')) {
          const [name, type, ingredientsCell] = r
          if (!name?.trim()) { sum.errors.push(`Empty name in row: ${r.join(',')}`); continue }
          const ingNames = (ingredientsCell ?? '')
            .split(',').map(s => s.trim()).filter(Boolean)
          const ids: string[] = []
          for (const ingName of ingNames) {
            const existing = await getOrCreateIngredientByName(ingName)
            // getOrCreateIngredientByName creates a stub when missing; flag new stubs.
            if (existing.type === null) sum.stubs.push(`ingredient: ${existing.name}`)
            ids.push(existing.id)
          }
          await insertFood({ name: name.trim(), type: type?.trim() || null }, ids)
          sum.inserted++
        }
      } else {
        for (const r of dropHeader(rows, 'food')) {
          const [foodName, amount, unit, eatenAt] = r
          if (!foodName?.trim()) { sum.errors.push(`Empty food in row: ${r.join(',')}`); continue }
          const amt = Number(amount)
          if (!(amt > 0)) { sum.errors.push(`Bad amount "${amount}" for ${foodName}`); continue }
          const u = (unit ?? '').trim()
          if (!LOG_UNITS.includes(u as any)) { sum.errors.push(`Bad unit "${unit}" for ${foodName}`); continue }
          const when = eatenAt?.trim() ? new Date(eatenAt.trim()) : new Date()
          if (isNaN(when.getTime())) { sum.errors.push(`Bad date "${eatenAt}" for ${foodName}`); continue }
          const food = await getOrCreateFoodByName(foodName.trim())
          if (!food.ingredients?.length) sum.stubs.push(`food: ${food.name}`)
          await insertLogEntry({ food_id: food.id, amount: amt, unit: u, eaten_at: when.toISOString() })
          sum.inserted++
        }
      }
      setSummary(sum)
      onSaved()
    } catch (e: any) {
      setError(e?.message ?? 'Import failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={modalStyles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={modalStyles.sheet}>
        <div className={modalStyles.handle} />
        <div className={formStyles.header}>
          <h2 className={modalStyles.title}>Import CSV</h2>
          <button className={formStyles.cancelBtn} onClick={onClose}>Cancel</button>
        </div>

        {summary ? (
          <div>
            <p className={modalStyles.desc}>Imported {summary.inserted} row(s).</p>
            {summary.stubs.length > 0 && (
              <>
                <label className={formStyles.label}>STUBS CREATED ({summary.stubs.length})</label>
                <ul>{summary.stubs.map((s, i) => <li key={i} style={{ fontSize: 13 }}>{s}</li>)}</ul>
              </>
            )}
            {summary.errors.length > 0 && (
              <>
                <label className={formStyles.label}>SKIPPED ROWS ({summary.errors.length})</label>
                <ul>{summary.errors.map((s, i) => <li key={i} style={{ fontSize: 13, color: 'var(--danger, #B83A3A)' }}>{s}</li>)}</ul>
              </>
            )}
            <button className={formStyles.nextBtn} onClick={onClose}>Done</button>
          </div>
        ) : (
          <div>
            <label className={formStyles.label}>FORMAT</label>
            <select className={formStyles.input} value={format} onChange={e => { setFormat(e.target.value as Format); setRows(null) }}>
              <option value="ingredients">Ingredients — name, type</option>
              <option value="foods">Foods — name, type, ingredients</option>
              <option value="log">Log — food, amount, unit, eaten_at</option>
            </select>

            <label className={formStyles.label}>UPLOAD .CSV</label>
            <input className={formStyles.input} type="file" accept=".csv,text/csv" onChange={onFile} />

            <label className={formStyles.label}>…OR PASTE</label>
            <textarea
              className={formStyles.input}
              rows={6}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Paste CSV rows here"
            />

            {error && <p className={modalStyles.desc} style={{ color: 'var(--danger, #B83A3A)' }}>{error}</p>}

            {rows ? (
              <>
                <label className={formStyles.label}>PREVIEW ({rows.length} row(s))</label>
                <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 12 }}>
                  <table style={{ fontSize: 12, borderCollapse: 'collapse', width: '100%' }}>
                    <tbody>
                      {rows.slice(0, 20).map((r, ri) => (
                        <tr key={ri}>
                          {r.map((c, ci) => (
                            <td key={ci} style={{ border: '1px solid var(--border)', padding: '4px 6px' }}>{c}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button className={formStyles.nextBtn} disabled={busy} onClick={runImport}>
                  {busy ? 'Importing…' : `Import ${rows.length} row(s)`}
                </button>
              </>
            ) : (
              <button className={formStyles.nextBtn} disabled={!text.trim()} onClick={preview}>
                Preview
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
