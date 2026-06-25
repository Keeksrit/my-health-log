import { useState } from 'react'
import type { Ingredient } from '../types/nutrition'
import { INGREDIENT_TYPES } from '../types/nutrition'
import { insertIngredient } from '../lib/nutrition'
import modalStyles from './Modal.module.css'
import formStyles from './AddMedicationFlow.module.css'

interface Props {
  onClose: () => void
  onSaved: (ingredient: Ingredient) => void
  initialName?: string
}

export default function AddIngredientModal({ onClose, onSaved, initialName = '' }: Props) {
  const [name, setName] = useState(initialName)
  const [type, setType] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!name.trim()) { setError('Name is required.'); return }
    setSaving(true)
    setError('')
    try {
      const created = await insertIngredient({ name: name.trim(), type: type || null })
      onSaved(created)
    } catch (e: any) {
      if (e?.code === '23505') setError(`An ingredient named "${name.trim()}" already exists.`)
      else setError(e?.message ?? 'Something went wrong.')
      setSaving(false)
    }
  }

  return (
    <div className={modalStyles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={modalStyles.sheet}>
        <div className={modalStyles.handle} />
        <div className={formStyles.header}>
          <h2 className={modalStyles.title}>Add ingredient</h2>
          <button className={formStyles.cancelBtn} onClick={onClose}>Cancel</button>
        </div>

        <label className={formStyles.label}>NAME *</label>
        <input
          className={formStyles.input}
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Coconut milk"
          autoFocus
        />

        <label className={formStyles.label}>TYPE <span className={formStyles.optional}>(optional)</span></label>
        <select className={formStyles.input} value={type} onChange={e => setType(e.target.value)}>
          <option value="">— none —</option>
          {INGREDIENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        {error && <p className={modalStyles.desc} style={{ color: 'var(--danger, #B83A3A)' }}>{error}</p>}

        <button className={formStyles.nextBtn} disabled={saving || !name.trim()} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save ingredient'}
        </button>
      </div>
    </div>
  )
}
