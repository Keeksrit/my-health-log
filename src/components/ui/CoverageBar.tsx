import { COVERAGE_BG, COVERAGE_FG } from '../../types'
import styles from './CoverageBar.module.css'

interface Props {
  value: string
}

export default function CoverageBar({ value }: Props) {
  const bg = COVERAGE_BG[value] ?? '#eee'
  const fg = COVERAGE_FG[value] ?? '#888'

  return (
    <span className={styles.pill} style={{ background: bg, color: fg }}>
      {value}
    </span>
  )
}
