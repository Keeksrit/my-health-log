import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import styles from './Login.module.css'
import Icon from '../ui/Icon'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) setError(error.message)
    // on success, onAuthStateChange (AuthGate) swaps the view — nothing to do here
  }

  return (
    <div className={styles.wrap}>
      <form onSubmit={handleSubmit} className={styles.card}>
        <div className={styles.brand}><Icon name="brand" size={20} /> My Health Log</div>
        <label className={styles.label}>Email</label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          autoComplete="username"
          className={styles.input}
        />
        <label className={styles.label}>Password</label>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          className={styles.input}
        />
        {error && <div className={styles.error}>{error}</div>}
        <button type="submit" disabled={loading} className={styles.btn}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
