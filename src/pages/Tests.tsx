import { useCallback, useEffect, useState } from 'react'
import { fetchSessions, deleteSession, type LabSession } from '../lib/lab'
import { fetchEvents, type LabEvent } from '../lib/labEvents'
import { useLabDescriptions } from '../lib/useLabDescriptions'
import ImportModal from './tests/ImportModal'
import { TableView } from './tests/TableView'
import { GraphView } from './tests/GraphView'
import styles from './Tests.module.css'

type View = 'graph' | 'table'

export default function Tests() {
  const [sessions, setSessions] = useState<LabSession[]>([])
  const [events, setEvents] = useState<LabEvent[]>([])
  const [view, setView] = useState<View>('graph')
  const [importing, setImporting] = useState(false)
  const { descriptions } = useLabDescriptions()

  const reload = useCallback(async () => {
    try { setSessions(await fetchSessions()) } catch (e) { console.warn('fetchSessions failed', e); setSessions([]) }
    try { setEvents(await fetchEvents()) } catch (e) { console.warn('fetchEvents failed', e); setEvents([]) }
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    try { await deleteSession(id); await reload() }
    catch (e) { console.warn('deleteSession failed', e) }
  }, [reload])

  useEffect(() => { reload() }, [reload])

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <h1 className={styles.title}>Tests</h1>
        <div className={styles.toggle}>
          <button className={view === 'graph' ? styles.toggleActive : ''} onClick={() => setView('graph')}>Graph</button>
          <button className={view === 'table' ? styles.toggleActive : ''} onClick={() => setView('table')}>Table</button>
        </div>
        <button className={styles.importBtn} onClick={() => setImporting(true)}>Import</button>
      </div>

      {view === 'graph'
        ? <GraphView sessions={sessions} events={events} descriptions={descriptions} />
        : <TableView sessions={sessions} descriptions={descriptions} onDelete={handleDelete} />}

      {importing && (
        <ImportModal
          onClose={() => setImporting(false)}
          onSaved={() => { setImporting(false); reload() }}
        />
      )}
    </div>
  )
}
