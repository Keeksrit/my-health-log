import { useState } from 'react'
import { useUnits } from '../lib/useUnits'
import { parseCsv, syncIngredients, syncFoods, syncLog, type ImportSummary } from '../lib/nutrition'
import {
  parseIngredientRows, parseFoodRows, parseLogRows, type SyncMode,
} from '../lib/nutritionCsv'
import modalStyles from './Modal.module.css'
import formStyles from './AddMedicationFlow.module.css'

type Format = 'ingredients' | 'foods' | 'log'

interface Props {
  onClose: () => void
  onSaved: () => void
}

export default function ImportCsvModal({ onClose, onSaved }: Props) {
  const [format, setFormat] = useState<Format>('ingredients')
  const [mode, setMode] = useState<SyncMode>('add')
  const [text, setText] = useState('')
  const [rows, setRows] = useState<string[][] | null>(null)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { units, loading } = useUnits()

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
    if (format === 'log' && (loading || units.length === 0)) {
      setError('Units are still loading — try again in a moment.')
      return
    }
    setBusy(true)
    setError('')
    try {
      let result: ImportSummary
      if (format === 'ingredients') {
        result = await syncIngredients(parseIngredientRows(rows), mode)
      } else if (format === 'foods') {
        result = await syncFoods(parseFoodRows(rows), mode)
      } else {
        result = await syncLog(parseLogRows(rows), mode, new Set(units.map(u => u.name)))
      }
      setSummary(result)
      if (result.inserted + result.updated + result.deleted > 0) onSaved()
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
            <p className={modalStyles.desc}>
              Inserted {summary.inserted} · Updated {summary.updated} · Deleted {summary.deleted}
            </p>
            {summary.blocked.length > 0 && (
              <>
                <label className={formStyles.label}>COULD NOT DELETE ({summary.blocked.length})</label>
                <ul>{summary.blocked.map((s, i) => <li key={i} style={{ fontSize: 13, color: 'var(--danger, #B83A3A)' }}>{s}</li>)}</ul>
              </>
            )}
            {summary.stubs.length > 0 && (
              <>
                <label className={formStyles.label}>STUBS CREATED ({summary.stubs.length})</label>
                <ul>{summary.stubs.map((s, i) => <li key={i} style={{ fontSize: 13 }}>{s}</li>)}</ul>
              </>
            )}
            {summary.skipped.length > 0 && (
              <>
                <label className={formStyles.label}>SKIPPED ({summary.skipped.length})</label>
                <ul>{summary.skipped.map((s, i) => <li key={i} style={{ fontSize: 13, color: 'var(--danger, #B83A3A)' }}>{s}</li>)}</ul>
              </>
            )}
            <button className={formStyles.nextBtn} onClick={onClose}>Done</button>
          </div>
        ) : (
          <div>
            <label className={formStyles.label}>FORMAT</label>
            <select className={formStyles.input} value={format} onChange={e => { setFormat(e.target.value as Format); setRows(null) }}>
              <option value="ingredients">Ingredients — id, name, type</option>
              <option value="foods">Foods — id, name, type, ingredients</option>
              <option value="log">Log — id, food, amount, unit, eaten_at</option>
            </select>

            <label className={formStyles.label}>MODE</label>
            <select className={formStyles.input} value={mode} onChange={e => setMode(e.target.value as SyncMode)}>
              <option value="add">Add new only — insert rows with a blank id, skip the rest</option>
              <option value="sync">Full sync — mirror the file: update matched ids, insert new rows, delete DB rows not in the file</option>
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
                <button className={formStyles.nextBtn} disabled={busy || loading} onClick={runImport}>
                  {loading ? 'Loading units…' : busy ? 'Importing…' : `Import ${rows.length} row(s)`}
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
