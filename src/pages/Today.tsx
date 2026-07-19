import { useState } from 'react'
import type { Entry } from '../types'
import { dateKey, todayKey, uid } from '../lib/utils'
import { insertEntry, deleteEntry } from '../lib/supabase'
import EntryCard from '../components/ui/EntryCard'
import Icon from '../components/ui/Icon'
import DuplicateDayModal from './DuplicateDayModal'
import styles from './Today.module.css'

interface Props {
  entries: Entry[]
  onReload: () => void
}

export default function Today({ entries, onReload }: Props) {
  const [dupOpen, setDupOpen] = useState(false)

  const todayEntries = entries
    .filter(e => dateKey(e.created_at) === todayKey())
    .sort((a, b) => b.created_at - a.created_at)

  async function handleDuplicate(entry: Entry) {
    await insertEntry({ ...entry, id: uid(), created_at: Date.now(), entry_date: todayKey() })
    onReload()
  }

  return (
    <div className={styles.page}>
      <div className={styles.secRow}>
        <p className={styles.sec}>Today's entries</p>
        {todayEntries.length > 0 && (
          <button className={styles.dupDayBtn} onClick={() => setDupOpen(true)}>
            <Icon name="copy" size={14} /> Duplicate day
          </button>
        )}
      </div>

      {todayEntries.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}><Icon name="leaf" size={40} /></div>
          <h2>Nothing logged yet</h2>
          <p>Tap Symptom below<br />to start logging.</p>
        </div>
      ) : (
        todayEntries.map(e => (
          <EntryCard key={e.id} entry={e} onDuplicate={handleDuplicate} />
        ))
      )}

      <DuplicateDayModal
        open={dupOpen}
        sourceDay={todayKey()}
        entries={entries}
        onClose={() => setDupOpen(false)}
        onDone={onReload}
      />
    </div>
  )
}
