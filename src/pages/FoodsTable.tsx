import { useMemo, useState } from 'react'
import type { Food, Ingredient } from '../types/nutrition'
import { useEditableRows } from '../lib/useEditableRows'
import { useFoodTypes } from '../lib/useFoodTypes'
import { updateFood, setFoodIngredients, deleteFood } from '../lib/nutrition'
import { foodsToCsv } from '../lib/nutritionCsv'
import { downloadCsv } from '../lib/utils'
import styles from './Nutrition.module.css'
import ft from './FoodsTable.module.css'

interface Props {
  foods: Food[]
  allIngredients: Ingredient[]
  onSaved: () => void
}

interface FoodRow { id: string; name: string; type: string | null; ingredientIds: string[] }

function toRow(f: Food): FoodRow {
  return { id: f.id, name: f.name, type: f.type, ingredientIds: (f.ingredients ?? []).map(i => i.id) }
}

export default function FoodsTable({ foods, allIngredients, onSaved }: Props) {
  const source = useMemo(() => foods.map(toRow), [foods])
  const t = useEditableRows<FoodRow>(source)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const { foodTypes } = useFoodTypes()
  const nameById = useMemo(
    () => new Map(allIngredients.map(i => [i.id, i.name])), [allIngredients])

  async function save() {
    setSaving(true); setError('')
    try {
      for (const id of t.deletedIds) await deleteFood(id)
      for (const r of t.dirtyRows) {
        await updateFood(r.id, { name: r.name.trim(), type: r.type })
        await setFoodIngredients(r.id, r.ingredientIds)
      }
      onSaved(); t.finish()
    } catch (e: any) {
      setError(e?.message ?? 'Could not save foods.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className={styles.tableHead}>
        <span className={styles.sectionLabel}>Foods ({foods.length})</span>
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
              {foods.length > 0 && <button className={styles.tableBtn} onClick={t.begin}>Edit</button>}
              <button className={styles.tableBtn} onClick={() => downloadCsv('foods.csv', foodsToCsv(foods))}>⬇ Export</button>
            </>
          )}
        </div>
      </div>
      {error && <p className={styles.tableError}>{error}</p>}
      {foods.length === 0 ? (
        <p className={styles.empty}>No foods yet.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Food name</th><th>Type</th><th>Ingredients</th>{t.editing && <th />}</tr>
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
                          {foodTypes.map(x => <option key={x.id} value={x.name}>{x.name}</option>)}
                        </select>
                      : (r.type ?? '—')}
                  </td>
                  <td>
                    {t.editing
                      ? <IngredientCell
                          ids={r.ingredientIds}
                          all={allIngredients}
                          onChange={ids => t.setRow(r.id, { ingredientIds: ids })} />
                      : <span className={ft.ingList}>
                          {r.ingredientIds.map(id => nameById.get(id) ?? '?').join(', ') || '—'}
                        </span>}
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

function IngredientCell(
  { ids, all, onChange }: { ids: string[]; all: Ingredient[]; onChange: (ids: string[]) => void }
) {
  const [query, setQuery] = useState('')
  const byId = useMemo(() => new Map(all.map(i => [i.id, i])), [all])
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return all.filter(i => i.name.toLowerCase().includes(q) && !ids.includes(i.id)).slice(0, 8)
  }, [query, all, ids])

  return (
    <div className={ft.ingEditor}>
      <div className={ft.chips}>
        {ids.map(id => (
          <span key={id} className={ft.chip}>
            {byId.get(id)?.name ?? '?'}
            <button className={ft.chipRemove} aria-label="Remove ingredient" onClick={() => onChange(ids.filter(x => x !== id))}>×</button>
          </span>
        ))}
      </div>
      <input className={styles.cellInput} value={query}
        placeholder="Add ingredient…" onChange={e => setQuery(e.target.value)} />
      {query.trim() && suggestions.length > 0 && (
        <div className={ft.suggestions}>
          {suggestions.map(i => (
            <button key={i.id} className={ft.suggestion}
              onClick={() => { onChange([...ids, i.id]); setQuery('') }}>
              {i.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
