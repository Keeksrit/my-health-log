import { useState, useRef, useEffect } from 'react'
import { BODY_PARTS } from '../../types'
import styles from './BodyMap.module.css'

interface Props {
  onSelect: (part: string, side: string | null) => void
}

const FRONT_SVG = `<svg width="140" height="280" viewBox="0 0 140 280" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="70" cy="30" rx="22" ry="26" fill="var(--body-fill)" stroke="var(--body-stroke)" stroke-width="1.5" data-zone="face"/>
  <rect x="62" y="54" width="16" height="10" fill="var(--body-fill)" stroke="var(--body-stroke)" stroke-width="1" data-zone="face"/>
  <path d="M40,64 L100,64 L105,115 L35,115 Z" fill="var(--body-fill)" stroke="var(--body-stroke)" stroke-width="1.5" data-zone="chest"/>
  <path d="M38,116 L102,116 L99,155 L41,155 Z" fill="var(--body-fill)" stroke="var(--body-stroke)" stroke-width="1.5" data-zone="stomach"/>
  <path d="M41,155 L99,155 L96,170 L44,170 Z" fill="var(--body-fill)" stroke="var(--body-stroke)" stroke-width="1" data-zone="bottom"/>
  <path d="M35,65 L18,68 L10,120 L22,122 L30,80 L40,78 Z" fill="var(--body-fill)" stroke="var(--body-stroke)" stroke-width="1.5" data-zone="arm-left"/>
  <path d="M10,120 L8,145 L18,146 L22,122 Z" fill="var(--body-fill)" stroke="var(--body-stroke)" stroke-width="1" data-zone="arm-left"/>
  <path d="M8,145 L6,158 L18,160 L18,146 Z" fill="var(--body-fill)" stroke="var(--body-stroke)" stroke-width="1" data-zone="arm-left"/>
  <path d="M105,65 L122,68 L130,120 L118,122 L110,80 L100,78 Z" fill="var(--body-fill)" stroke="var(--body-stroke)" stroke-width="1.5" data-zone="arm-right"/>
  <path d="M130,120 L132,145 L122,146 L118,122 Z" fill="var(--body-fill)" stroke="var(--body-stroke)" stroke-width="1" data-zone="arm-right"/>
  <path d="M132,145 L134,158 L122,160 L122,146 Z" fill="var(--body-fill)" stroke="var(--body-stroke)" stroke-width="1" data-zone="arm-right"/>
  <path d="M41,156 L68,158 L66,220 L44,220 Z" fill="var(--body-fill)" stroke="var(--body-stroke)" stroke-width="1.5" data-zone="leg-left"/>
  <path d="M44,220 L66,220 L64,260 L42,260 Z" fill="var(--body-fill)" stroke="var(--body-stroke)" stroke-width="1" data-zone="leg-left"/>
  <path d="M99,156 L72,158 L74,220 L96,220 Z" fill="var(--body-fill)" stroke="var(--body-stroke)" stroke-width="1.5" data-zone="leg-right"/>
  <path d="M96,220 L74,220 L76,260 L98,260 Z" fill="var(--body-fill)" stroke="var(--body-stroke)" stroke-width="1" data-zone="leg-right"/>
</svg>`

const BACK_SVG = `<svg width="140" height="280" viewBox="0 0 140 280" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="70" cy="30" rx="22" ry="26" fill="var(--body-fill)" stroke="var(--body-stroke)" stroke-width="1.5" data-zone="face"/>
  <rect x="62" y="54" width="16" height="10" fill="var(--body-fill)" stroke="var(--body-stroke)" stroke-width="1" data-zone="face"/>
  <path d="M40,64 L100,64 L105,155 L35,155 Z" fill="var(--body-fill)" stroke="var(--body-stroke)" stroke-width="1.5" data-zone="back"/>
  <path d="M41,156 L99,156 L96,185 L44,185 Z" fill="var(--body-fill)" stroke="var(--body-stroke)" stroke-width="1.5" data-zone="bottom"/>
  <path d="M35,65 L18,68 L10,120 L22,122 L30,80 L40,78 Z" fill="var(--body-fill)" stroke="var(--body-stroke)" stroke-width="1.5" data-zone="arm-left"/>
  <path d="M10,120 L8,145 L18,146 L22,122 Z" fill="var(--body-fill)" stroke="var(--body-stroke)" stroke-width="1" data-zone="arm-left"/>
  <path d="M8,145 L6,158 L18,160 L18,146 Z" fill="var(--body-fill)" stroke="var(--body-stroke)" stroke-width="1" data-zone="arm-left"/>
  <path d="M105,65 L122,68 L130,120 L118,122 L110,80 L100,78 Z" fill="var(--body-fill)" stroke="var(--body-stroke)" stroke-width="1.5" data-zone="arm-right"/>
  <path d="M130,120 L132,145 L122,146 L118,122 Z" fill="var(--body-fill)" stroke="var(--body-stroke)" stroke-width="1" data-zone="arm-right"/>
  <path d="M132,145 L134,158 L122,160 L122,146 Z" fill="var(--body-fill)" stroke="var(--body-stroke)" stroke-width="1" data-zone="arm-right"/>
  <path d="M41,186 L66,186 L64,260 L42,260 Z" fill="var(--body-fill)" stroke="var(--body-stroke)" stroke-width="1.5" data-zone="leg-left"/>
  <path d="M99,186 L74,186 L76,260 L98,260 Z" fill="var(--body-fill)" stroke="var(--body-stroke)" stroke-width="1.5" data-zone="leg-right"/>
</svg>`

const FACE_SVG = `<svg width="160" height="200" viewBox="0 0 160 200" xmlns="http://www.w3.org/2000/svg">
  <path d="M80,5 Q120,5 130,40 L130,70 Q80,60 30,70 L30,40 Q40,5 80,5 Z" fill="var(--body-fill)" stroke="var(--body-stroke)" stroke-width="1.5" data-zone="Scalp"/>
  <path d="M35,70 Q80,62 125,70 L122,95 Q80,88 38,95 Z" fill="var(--body-fill)" stroke="var(--body-stroke)" stroke-width="1.5" data-zone="Forehead"/>
  <ellipse cx="22" cy="115" rx="10" ry="16" fill="var(--body-fill)" stroke="var(--body-stroke)" stroke-width="1.5" data-zone="Ear"/>
  <ellipse cx="138" cy="115" rx="10" ry="16" fill="var(--body-fill)" stroke="var(--body-stroke)" stroke-width="1.5" data-zone="Ear"/>
  <path d="M32,95 L60,95 L58,140 L30,138 Z" fill="var(--body-fill)" stroke="var(--body-stroke)" stroke-width="1.5" data-zone="Cheek"/>
  <path d="M128,95 L100,95 L102,140 L130,138 Z" fill="var(--body-fill)" stroke="var(--body-stroke)" stroke-width="1.5" data-zone="Cheek"/>
  <path d="M72,95 L68,125 L72,130 L88,130 L92,125 L88,95 Z" fill="var(--body-fill)" stroke="var(--body-stroke)" stroke-width="1.5" data-zone="Nose"/>
  <path d="M60,140 Q80,150 100,140 Q80,158 60,140 Z" fill="var(--body-fill)" stroke="var(--body-stroke)" stroke-width="1.5" data-zone="Lips"/>
  <path d="M58,158 Q80,175 102,158 L100,168 Q80,182 60,168 Z" fill="var(--body-fill)" stroke="var(--body-stroke)" stroke-width="1.5" data-zone="Chin"/>
  <path d="M30,138 L58,158 L60,168 L36,175 Z" fill="var(--body-fill)" stroke="var(--body-stroke)" stroke-width="1.5" data-zone="Jaw"/>
  <path d="M130,138 L102,158 L100,168 L124,175 Z" fill="var(--body-fill)" stroke="var(--body-stroke)" stroke-width="1.5" data-zone="Jaw"/>
  <path d="M60,168 L100,168 L98,195 L62,195 Z" fill="var(--body-fill)" stroke="var(--body-stroke)" stroke-width="1.5" data-zone="Neck"/>
</svg>`

function highlightZone(container: HTMLDivElement, zone: string) {
  container.querySelectorAll<SVGElement>('[data-zone]').forEach(el => {
    const isHit = el.getAttribute('data-zone') === zone
    el.style.fill   = isHit ? 'var(--accent)' : 'var(--body-fill)'
    el.style.stroke = isHit ? 'var(--accent)' : 'var(--body-stroke)'
  })
}

function attachClicks(container: HTMLDivElement, cb: (zone: string) => void) {
  container.querySelectorAll<SVGElement>('[data-zone]').forEach(el => {
    el.style.cursor = 'pointer'
    const handler = () => cb(el.getAttribute('data-zone')!)
    el.addEventListener('click', handler)
    el.addEventListener('touchend', (e) => { e.preventDefault(); handler() })
  })
}

type View = 'front' | 'back' | 'face'

export default function BodyMap({ onSelect }: Props) {
  const [view, setView] = useState<View>('front')
  const [selected, setSelected] = useState<string | null>(null)
  const svgRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!svgRef.current) return
    svgRef.current.innerHTML = view === 'front' ? FRONT_SVG : view === 'back' ? BACK_SVG : FACE_SVG
    if (selected) highlightZone(svgRef.current, selected)

    attachClicks(svgRef.current, zone => {
      setSelected(zone)
      if (view !== 'face') highlightZone(svgRef.current!, zone)
      if (view === 'face') {
        // face zones are already subparts — go straight to select
        onSelect('face', null)
        return
      }
      if (zone === 'face') { setView('face'); return }
    })
  }, [view])

  useEffect(() => {
    if (!svgRef.current || !selected) return
    highlightZone(svgRef.current, selected)
  }, [selected])

  function handleContinue() {
    if (!selected || selected === 'face') return
    const base = selected.includes('-') ? selected.split('-')[0] : selected
    const side = selected.includes('-left') ? 'Left' : selected.includes('-right') ? 'Right' : null
    onSelect(base, side)
  }

  function handlePill(zone: string) {
    setSelected(zone)
    if (zone === 'face') { setView('face'); return }
    if (svgRef.current) highlightZone(svgRef.current, zone)
  }

  if (view === 'face') {
    return (
      <div className={styles.wrap}>
        <p className={styles.hint}>Tap area on face</p>
        <div ref={svgRef} className={styles.svgWrap} />
        <button className={styles.backLink} onClick={() => { setView('front'); setSelected(null) }}>
          ← Back to body
        </button>
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.viewToggle}>
        <button className={`${styles.toggleBtn} ${view === 'front' ? styles.active : ''}`} onClick={() => { setView('front'); setSelected(null) }}>Front</button>
        <button className={`${styles.toggleBtn} ${view === 'back'  ? styles.active : ''}`} onClick={() => { setView('back');  setSelected(null) }}>Back</button>
      </div>
      <p className={styles.hint}>Tap a zone on the body</p>
      <div ref={svgRef} className={styles.svgWrap} />
      {selected && selected !== 'face' && (
        <button className={styles.continueBtn} onClick={handleContinue}>Continue →</button>
      )}
      <div className={styles.pills}>
        {Object.entries(BODY_PARTS).flatMap(([key, val]) => {
          const zones = val.side ? [`${key}-left`, `${key}-right`] : [key]
          return zones.map(z => (
            <button
              key={z}
              className={`${styles.pill} ${selected === z ? styles.pillActive : ''}`}
              onClick={() => handlePill(z)}
            >
              {val.side ? (z.includes('left') ? `L ${val.label}` : `R ${val.label}`) : val.label}
            </button>
          ))
        })}
      </div>
    </div>
  )
}
