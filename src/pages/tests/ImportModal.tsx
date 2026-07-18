import { useEffect, useState } from 'react'
import { parseSession, type ParsedSession } from '../../lib/labParse'
import { saveSession, fetchSampleIds } from '../../lib/lab'
import styles from './ImportModal.module.css'

interface Entry {
  session?: ParsedSession
  label: string
  status: 'ok' | 'dup' | 'error'
}

export default function ImportModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState('')
  const [entries, setEntries] = useState<Entry[]>([])
  const [knownIds, setKnownIds] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchSampleIds().then(ids => setKnownIds(new Set(ids))).catch(() => setKnownIds(new Set()))
  }, [])

  function queued(): Set<string> {
    return new Set(entries.filter(e => e.session).map(e => e.session!.sample_id))
  }

  function addPaste() {
    if (!text.trim()) return
    try {
      const session = parseSession(text)
      const date = new Date(session.taken_at).toLocaleString()
      const isDup = knownIds.has(session.sample_id) || queued().has(session.sample_id)
      setEntries(prev => [
        ...prev,
        {
          session: isDup ? undefined : session,
          label: `${date} · ${session.material ?? '—'} · ${session.results.length} analytes${isDup ? ' (already saved — skipped)' : ''}`,
          status: isDup ? 'dup' : 'ok',
        },
      ])
    } catch (e: any) {
      setEntries(prev => [...prev, { label: e?.message ?? 'Could not parse paste', status: 'error' }])
    }
    setText('')
  }

  async function done() {
    const toSave = entries.filter(e => e.session).map(e => e.session!)
    if (!toSave.length) { onClose(); return }
    setSaving(true)
    setError(null)
    const savedIds = new Set<string>()
    const failures: string[] = []
    for (const s of toSave) {
      try { await saveSession(s); savedIds.add(s.sample_id) }
      catch (e: any) { failures.push(`${s.sample_id}: ${e?.message ?? 'save failed'}`) }
    }
    setSaving(false)
    if (failures.length) {
      // Drop the sessions that actually saved so a retry only resubmits failures
      // (re-submitting a saved session would hit the duplicate-sample_id error).
      setEntries(prev => prev.filter(e => !(e.session && savedIds.has(e.session.sample_id))))
      setError(`Saved ${savedIds.size}. Failed — ${failures.join('; ')}`)
      return
    }
    onSaved()
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Import lab results</h2>
          <button className={styles.close} onClick={onClose} aria-label="Close">×</button>
        </div>
        <p className={styles.hint}>Paste one sample's results from the portal, then Add. Repeat for more samples.</p>
        <textarea
          className={styles.paste}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Paste here…"
          rows={8}
        />
        <div className={styles.actions}>
          <button className={styles.add} onClick={addPaste} disabled={!text.trim()}>Add paste</button>
        </div>
        <ul className={styles.log}>
          {entries.map((e, i) => (
            <li key={i} className={styles[e.status]}>{e.label}</li>
          ))}
        </ul>
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.footer}>
          <button className={styles.doneBtn} onClick={done} disabled={saving}>
            {saving ? 'Saving…' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  )
}
