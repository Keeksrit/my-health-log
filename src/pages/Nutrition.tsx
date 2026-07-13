import { useEffect, useState } from 'react'
import type { Food, Ingredient, LogEntry } from '../types/nutrition'
import {
  fetchFoodsWithIngredients,
  fetchIngredients,
  fetchLog,
  deleteLogEntry,
} from '../lib/nutrition'
import { fetchSleep, sleepSegmentsForDay, sleepTooltip } from '../lib/sleep'
import type { SleepNight } from '../lib/sleep'
import { fetchTraining, trainingSegmentsForDay, trainingTooltip } from '../lib/training'
import type { TrainingSession } from '../lib/training'
import { useFoodTypes } from '../lib/useFoodTypes'
import { colorForType, FALLBACK_COLOR } from '../lib/foodTypeColors'
import { fetchIncompleteDays, setDayIncomplete } from '../lib/incompleteDays'
import { entryVisibleByType, filterLog } from '../lib/nutritionFilters'
import AddFoodFlow from './AddFoodFlow'
import AddIngredientModal from './AddIngredientModal'
import LogEntryModal from './LogEntryModal'
import ImportCsvModal from './ImportCsvModal'
import styles from './Nutrition.module.css'
import IngredientsTable from './IngredientsTable'
import FoodsTable from './FoodsTable'
import LogTable from './LogTable'

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
    groups.push({ key, label, dots, maxLevel })
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

// Food types present in the log (for filter chips), each with its dot color,
// plus whether any untyped entries exist (the "No type" chip).
function chipItems(
  entries: LogEntry[],
  foodTypes: Array<{ name: string; color: string | null }>,
): { items: { name: string; color: string }[]; hasUntyped: boolean } {
  const present = new Set<string>()
  let hasUntyped = false
  for (const e of entries) {
    const t = e.food?.type
    if (t) present.add(t); else hasUntyped = true
  }
  const items = foodTypes
    .filter(t => present.has(t.name))
    .map(t => ({ name: t.name, color: colorForType(t.name, foodTypes) }))
  return { items, hasUntyped }
}

export default function Nutrition() {
  const [tab, setTab] = useState<Tab>('log')
  const [foods, setFoods] = useState<Food[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [log, setLog] = useState<LogEntry[]>([])
  const [sleep, setSleep] = useState<SleepNight[]>([])
  const [training, setTraining] = useState<TrainingSession[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<Modal>(null)
  const [editEntry, setEditEntry] = useState<LogEntry | null>(null)
  const [highlightFood, setHighlightFood] = useState<string | null>(null)
  const [logView, setLogView] = useState<'timeline' | 'table'>('timeline')
  const [error, setError] = useState('')
  const { foodTypes } = useFoodTypes()
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set())
  const [hideNoType, setHideNoType] = useState(false)
  const [hideIncomplete, setHideIncomplete] = useState(false)
  const [incompleteDays, setIncompleteDays] = useState<Set<string>>(new Set())

  function toggleType(name: string) {
    setHiddenTypes(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      return next
    })
  }

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
    // Sleep is best-effort: a missing grant/RLS on sports.oura_sleep must
    // never blank the food timeline.
    try {
      setSleep(await fetchSleep())
    } catch (e) {
      console.warn('Sleep data unavailable:', e)
    }
    // Training is best-effort too: a missing grant/RLS on sports.sessions must
    // never blank the food timeline.
    try {
      setTraining(await fetchTraining())
    } catch (e) {
      console.warn('Training data unavailable:', e)
    }
    // Incomplete-day flags are best-effort: a missing table (migration not yet
    // run) must never blank the timeline — the feature is simply inert.
    try {
      setIncompleteDays(await fetchIncompleteDays())
    } catch (e) {
      console.warn('Incomplete-day flags unavailable:', e)
    }
  }
  useEffect(() => { load() }, [])

  function closeModal() { setModal(null); setEditEntry(null) }
  function afterSave() { closeModal(); load() }

  async function toggleDayIncomplete(dayKey: string) {
    const flagged = !incompleteDays.has(dayKey)
    // Optimistic update.
    setIncompleteDays(prev => {
      const next = new Set(prev)
      if (flagged) next.add(dayKey); else next.delete(dayKey)
      return next
    })
    try {
      await setDayIncomplete(dayKey, flagged)
    } catch (e: any) {
      // Roll back on failure.
      setIncompleteDays(prev => {
        const next = new Set(prev)
        if (flagged) next.delete(dayKey); else next.add(dayKey)
        return next
      })
      setError(e?.message ?? 'Could not update the incomplete flag.')
    }
  }

  async function handleDeleteEntry(entry: LogEntry): Promise<boolean> {
    if (!confirm('Delete this log entry?')) return false
    try { await deleteLogEntry(entry.id); await load(); return true }
    catch (e: any) { setError(e?.message ?? 'Could not delete entry.'); return false }
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
          <div className={styles.subToggle}>
            <button className={`${styles.subBtn} ${logView === 'timeline' ? styles.subBtnActive : ''}`}
              onClick={() => setLogView('timeline')}>Timeline</button>
            <button className={`${styles.subBtn} ${logView === 'table' ? styles.subBtnActive : ''}`}
              onClick={() => setLogView('table')}>Table</button>
          </div>
          {(() => {
            const { items, hasUntyped } = chipItems(log, foodTypes)
            return (
              <div className={styles.filterBar}>
                <label className={styles.filterToggle}>
                  <input
                    type="checkbox"
                    checked={hideIncomplete}
                    onChange={e => setHideIncomplete(e.target.checked)}
                  />
                  Hide incomplete days
                </label>
                <div className={styles.chips}>
                  {items.map(item => {
                    const off = hiddenTypes.has(item.name)
                    return (
                      <button
                        key={item.name}
                        className={`${styles.chip} ${off ? styles.chipOff : ''}`}
                        onClick={() => toggleType(item.name)}
                      >
                        <span className={styles.chipSwatch} style={{ background: item.color }} />
                        {item.name}
                      </button>
                    )
                  })}
                  {hasUntyped && (
                    <button
                      className={`${styles.chip} ${hideNoType ? styles.chipOff : ''}`}
                      onClick={() => setHideNoType(v => !v)}
                    >
                      <span className={styles.chipSwatch} style={{ background: FALLBACK_COLOR }} />
                      No type
                    </button>
                  )}
                </div>
              </div>
            )
          })()}
          {(() => {
            // Shared filtered set: drives both the Table view's rows and the
            // sidebar's "Most logged" counts (per spec — the timeline/dots
            // keep all days and hide per-entry visibility separately).
            const filteredLog = filterLog(log, { hideIncomplete, incompleteDays, hiddenTypes, hideNoType })
            return logView === 'table' ? (
            <LogTable
              log={filteredLog}
              foods={foods}
              onSaved={load}
            />
          ) : log.length === 0 ? (
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
              {groupByDay(log)
                .filter(day => !(hideIncomplete && incompleteDays.has(day.key)))
                .map(day => {
                const flagged = incompleteDays.has(day.key)
                return (
                <div key={day.key} className={styles.dayRow}>
                  <div className={`${styles.dayLabel} ${flagged ? styles.dayLabelFlagged : ''}`}>
                    <button
                      className={styles.flagBtn}
                      title={flagged ? 'Marked incomplete — click to clear' : 'Mark day incomplete'}
                      onClick={() => toggleDayIncomplete(day.key)}
                    >
                      {flagged ? '⚠' : '⚑'}
                    </button>
                    {day.label}
                  </div>
                  <div
                    className={styles.track}
                    style={{ paddingTop: 10 + day.maxLevel * 16 }}
                  >
                    {sleepSegmentsForDay(sleep, day.key).map((seg, i) => (
                      <div
                        key={`sleep-${i}`}
                        className={styles.sleepBand}
                        style={{
                          left: `${(seg.startMin / 1440) * 100}%`,
                          width: `${((seg.endMin - seg.startMin) / 1440) * 100}%`,
                        }}
                      >
                        <span className={styles.tooltip}>{sleepTooltip(seg.night)}</span>
                      </div>
                    ))}
                    {trainingSegmentsForDay(training, day.key).map((seg, i) => (
                      <div
                        key={`training-${i}`}
                        className={`${styles.trainingBand} ${seg.estimated ? styles.trainingBandEstimated : ''}`}
                        style={{
                          left: `${(seg.startMin / 1440) * 100}%`,
                          width: `${((seg.endMin - seg.startMin) / 1440) * 100}%`,
                        }}
                      >
                        <span className={styles.tooltip}>{trainingTooltip(seg.session)}</span>
                      </div>
                    ))}
                    {day.dots.map(({ entry, min, level }) => {
                      const name = entry.food?.name ?? 'Unknown food'
                      if (!entryVisibleByType(entry, hiddenTypes, hideNoType)) return null
                      const color = colorForType(entry.food?.type, foodTypes)
                      const dotClass = highlightFood
                        ? (name === highlightFood ? styles.dotActive : styles.dotDim)
                        : ''
                      return (
                      <button
                        key={entry.id}
                        className={`${styles.dot} ${dotClass}`}
                        style={{ left: `${(min / 1440) * 100}%`, bottom: 6 + level * 16, background: color }}
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
                )
              })}
            </div>

            <aside className={styles.sidebar}>
              <p className={styles.sectionLabel}>Most logged</p>
              <ul className={styles.countList}>
                {foodCounts(filteredLog).map(f => (
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
          )
          })()}
        </>
      ) : (
        <>
          <div className={styles.actions}>
            <button className={styles.actionBtn} onClick={() => setModal('food')}>+ Food</button>
            <button className={`${styles.actionBtn} ${styles.actionBtnAlt}`} onClick={() => setModal('ingredient')}>+ Ingredient</button>
            <button className={`${styles.actionBtn} ${styles.actionBtnAlt}`} onClick={() => setModal('import')}>⬆ Import CSV</button>
          </div>

          <FoodsTable foods={foods} allIngredients={ingredients} onSaved={load} />

          <IngredientsTable ingredients={ingredients} onSaved={load} />
        </>
      )}

      {modal === 'food' && (
        <AddFoodFlow
          foods={foods}
          onClose={closeModal}
          onSaved={afterSave}
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
