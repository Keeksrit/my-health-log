import { supabase } from '../../lib/supabase'
import styles from './Header.module.css'

export default function Header() {
  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <header className={styles.header}>
      <div className={styles.row}>
        <div>
          <h1 className={styles.title}>My Health Log</h1>
          <p className={styles.date}>{today}</p>
        </div>
        <button className={styles.signout} onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>
    </header>
  )
}
