import { sevColor } from '../../lib/utils'
import styles from './SevDots.module.css'

interface Props {
  value: number
  size?: number
}

export default function SevDots({ value, size = 9 }: Props) {
  return (
    <div className={styles.dots}>
      {[1, 2, 3, 4, 5].map(i => (
        <div
          key={i}
          className={styles.dot}
          style={{
            width: size,
            height: size,
            backgroundColor: i <= value ? sevColor(value) : 'var(--border)',
          }}
        />
      ))}
    </div>
  )
}
