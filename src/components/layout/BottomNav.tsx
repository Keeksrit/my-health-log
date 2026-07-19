import { NavLink, useNavigate } from 'react-router-dom'
import Icon from '../ui/Icon'
import styles from './BottomNav.module.css'

export default function BottomNav() {
  const navigate = useNavigate()

  return (
    <nav className={styles.nav}>
      <NavLink to="/stats"        className={({ isActive }) => `${styles.btn} ${isActive ? styles.active : ''}`}>
        <Icon name="stats" size={22} className={styles.icon} />
        <span className={styles.label}>Stats</span>
      </NavLink>
      <NavLink to="/today"        className={({ isActive }) => `${styles.btn} ${isActive ? styles.active : ''}`}>
        <Icon name="today" size={22} className={styles.icon} />
        <span className={styles.label}>Today</span>
      </NavLink>
      <NavLink to="/calendar"     className={({ isActive }) => `${styles.btn} ${isActive ? styles.active : ''}`}>
        <Icon name="calendar" size={22} className={styles.icon} />
        <span className={styles.label}>Calendar</span>
      </NavLink>
      <NavLink to="/medications"  className={({ isActive }) => `${styles.btn} ${isActive ? styles.active : ''}`}>
        <Icon name="meds" size={22} className={styles.icon} />
        <span className={styles.label}>Meds</span>
      </NavLink>
      <NavLink to="/nutrition"    className={({ isActive }) => `${styles.btn} ${isActive ? styles.active : ''}`}>
        <Icon name="nutrition" size={22} className={styles.icon} />
        <span className={styles.label}>Nutrition</span>
      </NavLink>
      <NavLink to="/tests"        className={({ isActive }) => `${styles.btn} ${isActive ? styles.active : ''}`}>
        <Icon name="tests" size={22} className={styles.icon} />
        <span className={styles.label}>Tests</span>
      </NavLink>
      <button className={`${styles.btn} ${styles.symptomBtn}`} onClick={() => navigate('/log')}>
        <Icon name="symptom" size={22} className={styles.icon} />
        <span className={styles.label}>Symptom</span>
      </button>
    </nav>
  )
}
