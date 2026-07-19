import type { Entry } from '../../types'
import SevDots from './SevDots'
import CoverageBar from './CoverageBar'
import Icon from './Icon'
import { fmtTime } from '../../lib/utils'
import styles from './EntryCard.module.css'

interface Props {
  entry: Entry
  onDuplicate?: (entry: Entry) => void
}

export default function EntryCard({ entry, onDuplicate }: Props) {
  return (
    <div className={styles.card}>
      <div className={styles.row}>
        <div className={styles.left}>
          <span className={styles.name}>{entry.name}</span>
          {entry.location_label && (
            <span className={styles.locPill}><Icon name="pin" size={12} /> {entry.location_label}</span>
          )}
        </div>
        <div className={styles.right}>
          {entry.severity && <SevDots value={entry.severity} />}
          {entry.coverage && <CoverageBar value={entry.coverage} />}
          <span className={styles.time}>{fmtTime(entry.created_at)}</span>
        </div>
      </div>

      {entry.note && (
        <p className={styles.note}>{entry.note}</p>
      )}

      {entry.photos && entry.photos.length > 0 && (
        <div className={styles.photos}>
          {entry.photos.map((uri, i) => (
            <img key={i} src={uri} alt="" className={styles.photo} />
          ))}
        </div>
      )}

      {onDuplicate && (
        <div className={styles.actions}>
          <button className={styles.dupBtn} onClick={() => onDuplicate(entry)}>
            <Icon name="copy" size={14} /> Duplicate
          </button>
        </div>
      )}
    </div>
  )
}
