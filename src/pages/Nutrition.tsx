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

// ── Timeline helpers ──
// Entries whose times fall within this many minutes of the start of a cluster
// are stacked vertically above each other on the timeline rather than overlapping.
const STACK_THRESHOLD_MIN = 15
const HOUR_TICKS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24]

interface DotPos { entry: LogEntry; min: number; level: number }
interface DayGroup {
  key: string
  label: string
  dots: DotPos[]
  maxLevel: number
  firstMin: number
  lastMin: number
}

function minutesOfDay(d: Date) { return d.getHours() * 60 + d.getMinutes() }

// Group log entries by local day (most recent first), assigning each entry a
// horizontal position (minutes from midnight) and a vertical stack level so that
// entries eaten at nearly the same time sit above one another.
function groupByDay(entries: LogEntry[]): DayGroup[] {
  const map = new Map<string, LogEntry[]>()
  for (const e of entries) {
    const d = new Date(e.eaten_at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(e)
  }

  const groups: DayGroup[] = []
  for (const [key, arr] of map) {
    arr.sort((a, b) => +new Date(a.eaten_at) - +new Date(b.eaten_at))
    const dots: DotPos[] = []
    let clusterStart = -Infinity
    let level = 0
    let maxLevel = 0
    for (const entry of arr) {
      const min = minutesOfDay(new Date(entry.eaten_at))
      if (min - clusterStart < STACK_THRESHOLD_MIN) {
        level++
      } else {
        level = 0
        clusterStart = min
      }
      maxLevel = Math.max(maxLevel, level)
      dots.push({ entry, min, level })
    }
    const label = new Date(key + 'T00:00:00').toLocaleDateString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric',
    })
    const firstMin = dots[0].min
    const lastMin = dots[dots.length - 1].min
    groups.push({ key, label, dots, maxLevel, firstMin, lastMin })
  }

  groups.sort((a, b) => (a.key < b.key ? 1 : -1))
  return groups
}

// Count how often each food appears in the log, most frequent first.
function foodCounts(entries: LogEntry[]): { name: string; count: number }[] {
  const map = new Map<string, number>()
  for (const e of entries) {
    const name = e.food?.name ?? 'Unknown food'
    map.set(name, (map.get(name) ?? 0) + 1)
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

function dotTooltip(e: LogEntry) {
  const time = new Date(e.eaten_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const name = e.food?.name ?? 'Unknown food'
  const amt = e.amount != null ? ` · ${e.amount} ${e.unit ?? ''}`.trimEnd() : ''
  return `${time} · ${name}${amt}`
}

export default function Nutrition() {
  const [tab, setTab] = useState<Tab>('log')
  const [foods, setFoods] = useState<Food[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [log, setLog] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<Modal>(null)
  const [editEntry, setEditEntry] = useState<LogEntry | null>(null)
  const [detailFood, setDetailFood] = useState<Food | null>(null)
  const [highlightFood, setHighlightFood] = useState<string | null>(null)
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

  async function handleDeleteEntry(entry: LogEntry): Promise<boolean> {
    if (!confirm('Delete this log entry?')) return false
    try { await deleteLogEntry(entry.id); await load(); return true }
    catch (e: any) { setError(e?.message ?? 'Could not delete entry.'); return false }
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
            <div className={styles.logLayout}>
            <div className={styles.timeline}>
              <div className={styles.axisRow}>
                <div className={styles.dayLabel} />
                <div className={styles.axis}>
                  {HOUR_TICKS.map(h => (
                    <span key={h} className={styles.axisTick} style={{ left: `${(h / 24) * 100}%` }}>
                      {String(h).padStart(2, '0')}
                    </span>
                  ))}
                </div>
              </div>
              {groupByDay(log).map(day => (
                <div key={day.key} className={styles.dayRow}>
                  <div className={styles.dayLabel}>{day.label}</div>
                  <div
                    className={styles.track}
                    style={{ paddingTop: 10 + day.maxLevel * 16 }}
                  >
                    <div
                      className={styles.fast}
                      style={{ left: 0, width: `${(day.firstMin / 1440) * 100}%` }}
                    />
                    <div
                      className={styles.fast}
                      style={{ left: `${(day.lastMin / 1440) * 100}%`, right: 0 }}
                    />
                    {day.dots.map(({ entry, min, level }) => {
                      const name = entry.food?.name ?? 'Unknown food'
                      const dotClass = highlightFood
                        ? (name === highlightFood ? styles.dotActive : styles.dotDim)
                        : ''
                      return (
                      <button
                        key={entry.id}
                        className={`${styles.dot} ${dotClass}`}
                        style={{ left: `${(min / 1440) * 100}%`, bottom: 6 + level * 16 }}
                        onClick={(ev) => {
                          if (ev.shiftKey) { handleDeleteEntry(entry); return }
                          setEditEntry(entry); setModal('logEntry')
                        }}
                      >
                        <span className={styles.tooltip}>{dotTooltip(entry)}</span>
                      </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            <aside className={styles.sidebar}>
              <p className={styles.sectionLabel}>Most logged</p>
              <ul className={styles.countList}>
                {foodCounts(log).map(f => (
                  <li key={f.name}>
                    <button
                      className={`${styles.countItem} ${highlightFood === f.name ? styles.countItemActive : ''}`}
                      onClick={() => setHighlightFood(highlightFood === f.name ? null : f.name)}
                    >
                      <span className={styles.countName}>{f.name}</span>
                      <span className={styles.countBadge}>{f.count}×</span>
                    </button>
                  </li>
                ))}
              </ul>
              {highlightFood && (
                <button className={styles.clearHighlight} onClick={() => setHighlightFood(null)}>
                  Clear highlight
                </button>
              )}
            </aside>
            </div>
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
        <LogEntryModal
          foods={foods}
          entry={editEntry}
          onClose={closeModal}
          onSaved={afterSave}
          onDelete={editEntry ? async () => { if (await handleDeleteEntry(editEntry)) closeModal() } : undefined}
        />
      )}
      {modal === 'import' && (
        <ImportCsvModal onClose={closeModal} onSaved={load} />
      )}
    </div>
  )
}
