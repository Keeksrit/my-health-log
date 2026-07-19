import styles from './Loader.module.css'

interface Props {
  label?: string
}

export default function Loader({ label = 'Loading…' }: Props) {
  return (
    <div className={styles.loader} role="status" aria-live="polite">
      <div className={styles.spinner} />
      <p>{label}</p>
    </div>
  )
}
