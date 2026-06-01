import { NavLink, useNavigate } from 'react-router-dom'
import styles from './BottomNav.module.css'

export default function BottomNav() {
  const navigate = useNavigate()

  return (
    <nav className={styles.nav}>
      <NavLink to="/stats"        className={({ isActive }) => `${styles.btn} ${isActive ? styles.active : ''}`}>
        <span className={styles.icon}>📊</span>
        <span className={styles.label}>Stats</span>
      </NavLink>
      <NavLink to="/today"        className={({ isActive }) => `${styles.btn} ${isActive ? styles.active : ''}`}>
        <span className={styles.icon}>📋</span>
        <span className={styles.label}>Today</span>
      </NavLink>
      <NavLink to="/calendar"     className={({ isActive }) => `${styles.btn} ${isActive ? styles.active : ''}`}>
        <span className={styles.icon}>📅</span>
        <span className={styles.label}>Calendar</span>
      </NavLink>
      <NavLink to="/medications"  className={({ isActive }) => `${styles.btn} ${isActive ? styles.active : ''}`}>
        <span className={styles.icon}>💊</span>
        <span className={styles.label}>Meds</span>
      </NavLink>
      <button className={`${styles.btn} ${styles.symptomBtn}`} onClick={() => navigate('/log')}>
        <span className={styles.icon}>🩹</span>
        <span className={styles.label}>Symptom</span>
      </button>
    </nav>
  )
}
