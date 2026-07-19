import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Entry, BodyPartInfo } from '../types'
import Icon from '../components/ui/Icon'
import { COVERAGE, COVERAGE_BG, COVERAGE_FG, BODY_PARTS } from '../types'
import { uid, todayKey } from '../lib/utils'
import { insertEntries } from '../lib/supabase'
import BodyMap from '../components/ui/BodyMap'
import styles from './LogSymptom.module.css'

interface Props {
  onSaved: () => void
}

type Step = 'body' | 'subpart' | 'form'

export default function LogSymptom({ onSaved }: Props) {
  const navigate  = useNavigate()
  const [step, setStep]         = useState<Step>('body')
  const [partInfo, setPartInfo] = useState<BodyPartInfo | null>(null)
  const [subparts, setSubparts] = useState<string[]>([])

  // form state
  const [symptomName, setSymptomName] = useState('')
  const [severity, setSeverity]       = useState(3)
  const [coverage, setCoverage]       = useState(0)
  const [note, setNote]               = useState('')
  const [photos, setPhotos]           = useState<string[]>([])
  const [saveMode, setSaveMode]       = useState<'combined'|'separate'>('combined')
  const [saving, setSaving]           = useState(false)

  const camRef = useRef<HTMLInputElement>(null)
  const galRef = useRef<HTMLInputElement>(null)

  function handleBodySelect(part: string, side: string | null) {
    setPartInfo({ part, side, subparts: [] })
    setSubparts([])
    setStep('subpart')
  }

  function toggleSubpart(s: string) {
    setSubparts(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  function handleSubpartContinue() {
    setPartInfo(prev => prev ? { ...prev, subparts } : prev)
    setStep('form')
  }

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    Array.from(e.target.files ?? []).forEach(file => {
      const reader = new FileReader()
      reader.onload = ev => setPhotos(p => [...p, ev.target!.result as string])
      reader.readAsDataURL(file)
    })
  }

  async function handleSave() {
    if (!symptomName.trim()) { alert('Please enter a symptom name.'); return }
    if (!partInfo) return
    setSaving(true)

    const targets = subparts.length > 0 ? subparts : [null]
    const base: Omit<Entry, 'id' | 'location_label' | 'body_subpart'> = {
      type: 'symptom',
      name: symptomName.trim(),
      note: note.trim() || null,
      severity,
      coverage: COVERAGE[coverage],
      photos: photos.length > 0 ? photos : null,
      entry_date: todayKey(),
      created_at: Date.now(),
      body_part: partInfo.part,
      body_side: partInfo.side,
    }

    let rows: Entry[]
    if (saveMode === 'separate' && targets.length > 1) {
      rows = targets.map(sub => ({
        ...base,
        id: uid(),
        body_subpart: sub,
        location_label: [partInfo.side, sub ?? BODY_PARTS[partInfo.part]?.label].filter(Boolean).join(' '),
        created_at: Date.now() + Math.random(),
      }))
    } else {
      const loc = targets
        .map(s => [partInfo.side, s ?? BODY_PARTS[partInfo.part]?.label].filter(Boolean).join(' '))
        .join(', ')
      rows = [{
        ...base,
        id: uid(),
        body_subpart: targets.filter(Boolean).join(', ') || null,
        location_label: loc,
      }]
    }

    await insertEntries(rows)
    setSaving(false)
    onSaved()
    navigate('/today')
  }

  const stepTitles: Record<Step, string> = {
    body:    'Where is the symptom?',
    subpart: 'Which area?',
    form:    'Symptom details',
  }

  const locDisplay = partInfo
    ? (subparts.length > 0 ? subparts : [BODY_PARTS[partInfo.part]?.label ?? partInfo.part])
        .map(s => [partInfo.side, s].filter(Boolean).join(' ')).join(', ')
    : ''

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.topBar}>
        <button
          className={styles.backBtn}
          onClick={() => {
            if (step === 'body')    navigate(-1)
            if (step === 'subpart') setStep('body')
            if (step === 'form')    setStep('subpart')
          }}
        >
          ←
        </button>
        <h2 className={styles.title}>{stepTitles[step]}</h2>
        <button className={styles.cancelBtn} onClick={() => navigate(-1)}>Cancel</button>
      </div>

      <div className={styles.content}>
        {/* ── Step 1: Body map ── */}
        {step === 'body' && (
          <BodyMap onSelect={handleBodySelect} />
        )}

        {/* ── Step 2: Subpart ── */}
        {step === 'subpart' && partInfo && (
          <div>
            <p className={styles.formLabel}>
              {partInfo.side ? `${partInfo.side.toUpperCase()} ` : ''}{partInfo.part.toUpperCase()} — SUBPART{' '}
              <span className={styles.optional}>(optional)</span>
            </p>
            <div className={styles.subpartGrid}>
              {BODY_PARTS[partInfo.part]?.sub.map(s => (
                <button
                  key={s}
                  className={`${styles.subpartBtn} ${subparts.includes(s) ? styles.subpartActive : ''}`}
                  onClick={() => toggleSubpart(s)}
                >
                  {s}
                </button>
              ))}
            </div>
            <button className={styles.saveBtn} onClick={handleSubpartContinue}>
              {subparts.length > 0 ? `Continue with ${subparts.length} selected` : 'Skip — no subpart'}
            </button>
          </div>
        )}

        {/* ── Step 3: Form ── */}
        {step === 'form' && partInfo && (
          <div>
            {/* Location tag */}
            <div className={styles.locRow}>
              <span className={styles.locPill}><Icon name="pin" size={12} /> {locDisplay}</span>
              <button className={styles.changeBtn} onClick={() => setStep('subpart')}>Change</button>
            </div>

            {/* Symptom name */}
            <label className={styles.formLabel}>SYMPTOM</label>
            <input
              className={styles.input}
              type="text"
              value={symptomName}
              onChange={e => setSymptomName(e.target.value)}
              placeholder="e.g. Rash, Pain, Swelling…"
              autoFocus
            />

            {/* Severity */}
            <label className={styles.formLabel}>SEVERITY</label>
            <div className={styles.sevRow}>
              {[1,2,3,4,5].map(v => (
                <button
                  key={v}
                  className={`${styles.sevBtn} ${severity === v ? styles[`sev${v}` as keyof typeof styles] : ''}`}
                  style={severity === v ? {
                    background: v <= 2 ? 'var(--accent)' : v === 3 ? 'var(--amber)' : 'var(--red)',
                    borderColor: 'transparent', color: '#fff'
                  } : {}}
                  onClick={() => setSeverity(v)}
                >
                  {v}
                </button>
              ))}
            </div>

            {/* Coverage */}
            <label className={styles.formLabel}>COVERAGE</label>
            <div className={styles.sevRow}>
              {COVERAGE.map((label, i) => (
                <button
                  key={label}
                  className={styles.covBtn}
                  style={coverage === i ? {
                    background: COVERAGE_BG[label],
                    borderColor: COVERAGE_FG[label],
                    color: COVERAGE_FG[label],
                  } : {}}
                  onClick={() => setCoverage(i)}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Save mode — only show if multiple subparts */}
            {subparts.length > 1 && (
              <>
                <label className={styles.formLabel}>SAVE AS</label>
                <div className={styles.toggleRow}>
                  <button className={`${styles.toggleBtn} ${saveMode === 'combined' ? styles.toggleActive : ''}`} onClick={() => setSaveMode('combined')}>One entry</button>
                  <button className={`${styles.toggleBtn} ${saveMode === 'separate' ? styles.toggleActive : ''}`} onClick={() => setSaveMode('separate')}>Separate per part</button>
                </div>
              </>
            )}

            {/* Notes */}
            <label className={styles.formLabel}>NOTES</label>
            <textarea
              className={styles.textarea}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Details, triggers, context…"
            />

            {/* Photos */}
            <label className={styles.formLabel}>PHOTOS</label>
            <div className={styles.photoBtns}>
              <button className={styles.photoBtn} onClick={() => camRef.current?.click()}><Icon name="camera" size={16} /> Camera</button>
              <button className={styles.photoBtn} onClick={() => galRef.current?.click()}><Icon name="image" size={16} /> Gallery</button>
            </div>
            <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }} onChange={handlePhoto} />
            <input ref={galRef} type="file" accept="image/*" multiple style={{ display:'none' }} onChange={handlePhoto} />
            {photos.length > 0 && (
              <div className={styles.photoPreview}>
                {photos.map((uri, i) => (
                  <div key={i} className={styles.photoWrap}>
                    <img src={uri} alt="" className={styles.photoThumb} />
                    <button className={styles.photoRemove} onClick={() => setPhotos(p => p.filter((_, j) => j !== i))}>✕</button>
                  </div>
                ))}
              </div>
            )}

            <button className={styles.saveBtn} disabled={saving} onClick={handleSave}>
              {saving ? 'Saving…' : 'Save Symptom'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
