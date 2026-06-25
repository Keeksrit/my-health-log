import { useEffect, useMemo, useState } from 'react'
import type { Food, Ingredient } from '../types/nutrition'
import { FOOD_TYPES } from '../types/nutrition'
import { fetchIngredients, insertFood, matchFoodByIngredientSet } from '../lib/nutrition'
import AddIngredientModal from './AddIngredientModal'
import modalStyles from './Modal.module.css'
import formStyles from './AddMedicationFlow.module.css'
import styles from './AddFoodFlow.module.css'

interface Props {
  foods: Food[]
  onClose: () => void
  onSaved: () => void
  onOpenFood: (food: Food) => void
}

export default function AddFoodFlow({ foods, onClose, onSaved, onOpenFood }: Props) {
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([])
  const [picked, setPicked] = useState<Ingredient[]>([])
  const [query, setQuery] = useState('')
  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)

  async function loadIngredients() {
    try { setAllIngredients(await fetchIngredients()) }
    catch (e: any) { setError(e?.message ?? 'Could not load ingredients.') }
  }
  useEffect(() => { loadIngredients() }, [])

  const pickedIds = picked.map(i => i.id)

  const match = useMemo(
    () => (picked.length ? matchFoodByIngredientSet(foods, pickedIds) : null),
    [foods, picked]
  )

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return allIngredients
      .filter(i => i.name.toLowerCase().includes(q) && !pickedIds.includes(i.id))
      .slice(0, 8)
  }, [query, allIngredients, picked])

  const exactExists = allIngredients.some(i => i.name.toLowerCase() === query.trim().toLowerCase())

  function addIngredient(ing: Ingredient) {
    if (!pickedIds.includes(ing.id)) setPicked([...picked, ing])
    setQuery('')
  }
  function removeIngredient(id: string) {
    setPicked(picked.filter(i => i.id !== id))
  }

  async function handleSave() {
    if (!name.trim()) { setError('A name is required.'); return }
    setSaving(true)
    setError('')
    try {
      await insertFood({ name: name.trim(), type: type || null }, pickedIds)
      onSaved()
    } catch (e: any) {
      if (e?.code === '23505') setError(`A food named "${name.trim()}" already exists.`)
      else setError(e?.message ?? 'Something went wrong.')
      setSaving(false)
    }
  }

  return (
    <div className={modalStyles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={modalStyles.sheet}>
        <div className={modalStyles.handle} />
        <div className={formStyles.header}>
          <h2 className={modalStyles.title}>Add food</h2>
          <button className={formStyles.cancelBtn} onClick={onClose}>Cancel</button>
        </div>

        <label className={formStyles.label}>INGREDIENTS <span className={formStyles.optional}>(optional)</span></label>
        {picked.length > 0 && (
          <div className={styles.chips}>
            {picked.map(i => (
              <span key={i.id} className={styles.chip}>
                {i.name}
                <button className={styles.chipRemove} onClick={() => removeIngredient(i.id)}>×</button>
              </span>
            ))}
          </div>
        )}
        <input
          className={formStyles.input}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Type to search ingredients…"
        />
        {query.trim() && (
          <div className={styles.suggestions}>
            {suggestions.map(i => (
              <button key={i.id} className={styles.suggestion} onClick={() => addIngredient(i)}>
                {i.name}{i.type ? ` · ${i.type}` : ''}
              </button>
            ))}
            {!exactExists && (
              <button className={`${styles.suggestion} ${styles.createRow}`} onClick={() => setCreateOpen(true)}>
                + Create "{query.trim()}"
              </button>
            )}
          </div>
        )}

        {match && (
          <div className={styles.matchBanner}>
            This is <strong>{match.name}</strong> — a food with exactly these ingredients already exists.
            <div>
              <button className={styles.openMatchBtn} onClick={() => onOpenFood(match)}>Open it instead</button>
            </div>
          </div>
        )}

        <label className={formStyles.label}>NAME *</label>
        <input
          className={formStyles.input}
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Pepperoni Pasta"
        />

        <label className={formStyles.label}>MEAL TYPE <span className={formStyles.optional}>(optional)</span></label>
        <select className={formStyles.input} value={type} onChange={e => setType(e.target.value)}>
          <option value="">— none —</option>
          {FOOD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        {error && <p className={modalStyles.desc} style={{ color: 'var(--danger, #B83A3A)' }}>{error}</p>}

        <button className={formStyles.nextBtn} disabled={saving || !name.trim()} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save food'}
        </button>
      </div>

      {createOpen && (
        <AddIngredientModal
          initialName={query.trim()}
          onClose={() => setCreateOpen(false)}
          onSaved={(ing) => {
            setCreateOpen(false)
            setAllIngredients(prev => [...prev, ing])
            addIngredient(ing)
          }}
        />
      )}
    </div>
  )
}
