import { useEffect, useState } from 'react'
import type { Food, Ingredient, LogEntry } from '../types/nutrition'
import {
  fetchFoodsWithIngredients,
  fetchIngredients,
  fetchLog,
  deleteLogEntry,
  distinctIngredientTypes,
} from '../lib/nutrition'
import AddFoodFlow from './AddFoodFlow'
import AddIngredientModal from './AddIngredientModal'
import LogEntryModal from './LogEntryModal'
import ImportCsvModal from './ImportCsvModal'
import styles from './Nutrition.module.css'

type Tab = 'log' | 'library'
type Modal = null | 'food' | 'ingredient' | 'logEntry' | 'import'

export default function Nutrition() {
  const [tab, setTab] = useState<Tab>('log')
  const [foods, setFoods] = useState<Food[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [log, setLog] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<Modal>(null)
  const [editEntry, setEditEntry] = useState<LogEntry | null>(null)
  const [detailFood, setDetailFood] = useState<Food | null>(null)
  const [error, setError] = useState('')

  async function load() {
    try {
      const [f, i, l] = await Promise.all([
        fetchFoodsWithIngredients(),
        fetchIngredients(),
        fetchLog(),
      ])
      setFoods(f)
      setIngredients(i)
      setLog(l)
    } catch (e: any) {
      setError(e?.message ?? 'Could not load nutrition data.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  function closeModal() { setModal(null); setEditEntry(null) }
  function afterSave() { closeModal(); load() }

  async function handleDeleteEntry(entry: LogEntry) {
    if (!confirm('Delete this log entry?')) return
    try { await deleteLogEntry(entry.id); await load() }
    catch (e: any) { setError(e?.message ?? 'Could not delete entry.') }
  }

  // ── Food detail view ──
  if (detailFood) {
    const types = distinctIngredientTypes(detailFood.ingredients ?? [])
    return (
      <div className={styles.page}>
        <button className={styles.backBtn} onClick={() => setDetailFood(null)}>←</button>
        <p className={styles.foodName}>{detailFood.name}</p>
        {detailFood.type && <p className={styles.meta}>{detailFood.type}</p>}

        <p className={styles.sectionLabel}>Ingredients</p>
        {detailFood.ingredients?.length ? (
          <ul>
            {detailFood.ingredients.map(i => (
              <li key={i.id} style={{ fontSize: 14 }}>{i.name}{i.type ? ` · ${i.type}` : ''}</li>
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>No ingredients recorded.</p>
        )}

        {types.length > 0 && (
          <>
            <p className={styles.sectionLabel}>Types</p>
            <div className={styles.tagRow}>
              {types.map(t => <span key={t} className={styles.tag}>{t}</span>)}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.tabs}>
        <button className={`${styles.tab} ${tab === 'log' ? styles.tabActive : ''}`} onClick={() => setTab('log')}>Log</button>
        <button className={`${styles.tab} ${tab === 'library' ? styles.tabActive : ''}`} onClick={() => setTab('library')}>Library</button>
      </div>

      {error && <p className={styles.empty} style={{ color: 'var(--danger, #B83A3A)' }}>{error}</p>}

      {loading ? (
        <p className={styles.empty}>Loading…</p>
      ) : tab === 'log' ? (
        <>
          <div className={styles.actions}>
            <button className={styles.actionBtn} onClick={() => { setEditEntry(null); setModal('logEntry') }}>+ Log entry</button>
          </div>
          {log.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>🥗</div>
              <h2>Nothing logged yet</h2>
              <p>Tap + Log entry to record what you ate.</p>
            </div>
          ) : (
            log.map(e => (
              <div key={e.id} className={styles.card}>
                <div className={styles.cardRow}>
                  <span className={styles.foodName}>{e.food?.name ?? 'Unknown food'}</span>
                  <span className={styles.meta}>{e.amount} {e.unit}</span>
                </div>
                <div className={styles.cardRow}>
                  <span className={styles.meta}>{new Date(e.eaten_at).toLocaleString()}</span>
                  <span className={styles.rowActions}>
                    <button className={styles.linkBtn} onClick={() => { setEditEntry(e); setModal('logEntry') }}>Edit</button>
                    <button className={styles.linkBtn} onClick={() => handleDeleteEntry(e)}>Delete</button>
                  </span>
                </div>
              </div>
            ))
          )}
        </>
      ) : (
        <>
          <div className={styles.actions}>
            <button className={styles.actionBtn} onClick={() => setModal('food')}>+ Food</button>
            <button className={`${styles.actionBtn} ${styles.actionBtnAlt}`} onClick={() => setModal('ingredient')}>+ Ingredient</button>
            <button className={`${styles.actionBtn} ${styles.actionBtnAlt}`} onClick={() => setModal('import')}>⬆ Import CSV</button>
          </div>

          <p className={styles.sectionLabel}>Foods ({foods.length})</p>
          {foods.length === 0 ? (
            <p className={styles.empty}>No foods yet.</p>
          ) : foods.map(f => (
            <div key={f.id} className={styles.card}>
              <div className={styles.cardRow}>
                <span className={styles.foodName}>{f.name}</span>
                <button className={styles.linkBtn} onClick={() => setDetailFood(f)}>Open →</button>
              </div>
              <div className={styles.meta}>
                {f.type ? `${f.type} · ` : ''}{f.ingredients?.length ?? 0} ingredient(s)
              </div>
            </div>
          ))}

          <p className={styles.sectionLabel}>Ingredients ({ingredients.length})</p>
          {ingredients.length === 0 ? (
            <p className={styles.empty}>No ingredients yet.</p>
          ) : ingredients.map(i => (
            <div key={i.id} className={styles.card}>
              <div className={styles.cardRow}>
                <span className={styles.foodName} style={{ fontSize: 14 }}>{i.name}</span>
                <span className={styles.meta}>{i.type ?? '—'}</span>
              </div>
            </div>
          ))}
        </>
      )}

      {modal === 'food' && (
        <AddFoodFlow
          foods={foods}
          onClose={closeModal}
          onSaved={afterSave}
          onOpenFood={(f) => { closeModal(); setDetailFood(f) }}
        />
      )}
      {modal === 'ingredient' && (
        <AddIngredientModal onClose={closeModal} onSaved={afterSave} />
      )}
      {modal === 'logEntry' && (
        <LogEntryModal foods={foods} entry={editEntry} onClose={closeModal} onSaved={afterSave} />
      )}
      {modal === 'import' && (
        <ImportCsvModal onClose={closeModal} onSaved={load} />
      )}
    </div>
  )
}
