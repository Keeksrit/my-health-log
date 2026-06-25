import { Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import { fetchEntries } from './lib/supabase'
import type { Entry } from './types'
import Header from './components/layout/Header'
import BottomNav from './components/layout/BottomNav'
import Stats from './pages/Stats'
import Today from './pages/Today'
import Calendar from './pages/Calendar'
import LogSymptom from './pages/LogSymptom'
import Medications from './pages/Medications'
import Nutrition from './pages/Nutrition'
import styles from './App.module.css'

export default function App() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    try {
      const data = await fetchEntries()
      setEntries(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  return (
    <div className={styles.app}>
      <Header />
      <main className={styles.main}>
        {loading ? (
          <div className={styles.loader}>
            <div className={styles.spinner} />
            <p>Loading…</p>
          </div>
        ) : (
          <Routes>
            <Route path="/"          element={<Navigate to="/stats" replace />} />
            <Route path="/stats"     element={<Stats entries={entries} />} />
            <Route path="/today"     element={<Today entries={entries} onReload={reload} />} />
            <Route path="/calendar"  element={<Calendar entries={entries} onReload={reload} />} />
            <Route path="/log"         element={<LogSymptom onSaved={reload} />} />
            <Route path="/medications" element={<Medications />} />
            <Route path="/nutrition"   element={<Nutrition />} />
          </Routes>
        )}
      </main>
      <BottomNav />
    </div>
  )
}
