import { useState } from 'react'
import type { Ingredient } from '../types/nutrition'
import { INGREDIENT_TYPES } from '../types/nutrition'
import { useEditableRows } from '../lib/useEditableRows'
import { updateIngredient, deleteIngredient } from '../lib/nutrition'
import { ingredientsToCsv } from '../lib/nutritionCsv'
import { downloadCsv } from '../lib/utils'
import styles from './Nutrition.module.css'

interface Props {
  ingredients: Ingredient[]
  onSaved: () => void
}

export default function IngredientsTable({ ingredients, onSaved }: Props) {
  const t = useEditableRows<Ingredient>(ingredients)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setSaving(true); setError('')
    try {
      for (const id of t.deletedIds) await deleteIngredient(id)
      for (const r of t.dirtyRows) await updateIngredient(r.id, { name: r.name.trim(), type: r.type })
      onSaved(); t.finish()
    } catch (e: any) {
      setError(e?.message ?? 'Could not save ingredients.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className={styles.tableHead}>
        <span className={styles.sectionLabel}>Ingredients ({ingredients.length})</span>
        <div className={styles.tableActions}>
          {t.editing ? (
            <>
              <button className={styles.tableBtn} disabled={saving} onClick={save}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button className={styles.tableBtn} disabled={saving} onClick={t.cancel}>Cancel</button>
            </>
          ) : (
            <>
              {ingredients.length > 0 && <button className={styles.tableBtn} onClick={t.begin}>Edit</button>}
              <button className={styles.tableBtn} onClick={() => downloadCsv('ingredients.csv', ingredientsToCsv(ingredients))}>⬇ Export</button>
            </>
          )}
        </div>
      </div>
      {error && <p className={styles.tableError}>{error}</p>}
      {ingredients.length === 0 ? (
        <p className={styles.empty}>No ingredients yet.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Name</th><th>Type</th>{t.editing && <th />}</tr>
            </thead>
            <tbody>
              {t.rows.map(r => (
                <tr key={r.id}>
                  <td>
                    {t.editing
                      ? <input className={styles.cellInput} value={r.name}
                          onChange={e => t.setRow(r.id, { name: e.target.value })} />
                      : r.name}
                  </td>
                  <td>
                    {t.editing
                      ? <select className={styles.cellSelect} value={r.type ?? ''}
                          onChange={e => t.setRow(r.id, { type: e.target.value || null })}>
                          <option value="">—</option>
                          {INGREDIENT_TYPES.map(x => <option key={x} value={x}>{x}</option>)}
                        </select>
                      : (r.type ?? '—')}
                  </td>
                  {t.editing && (
                    <td><button className={styles.rowDelete} title="Delete"
                      onClick={() => t.removeRow(r.id)}>×</button></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
