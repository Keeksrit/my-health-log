import { useEffect, useState } from 'react'
import { fetchUnits, type Unit } from './units'

// Module-level cache shared across all useUnits() consumers so switching pages
// doesn't refetch. reload() refreshes it and notifies every mounted hook.
let cache: Unit[] | null = null
let inflight: Promise<Unit[]> | null = null
const listeners = new Set<(u: Unit[]) => void>()

async function load(force = false): Promise<Unit[]> {
  if (cache && !force) return cache
  if (!inflight || force) {
    inflight = fetchUnits().then(u => {
      cache = u
      inflight = null
      listeners.forEach(fn => fn(u))
      return u
    }).catch(err => {
      inflight = null
      throw err
    })
  }
  return inflight
}

export function useUnits(): { units: Unit[]; loading: boolean; reload: () => Promise<void> } {
  const [units, setUnits] = useState<Unit[]>(cache ?? [])
  const [loading, setLoading] = useState(cache === null)

  useEffect(() => {
    const listener = (u: Unit[]) => setUnits(u)
    listeners.add(listener)
    load().then(() => setLoading(false)).catch(() => setLoading(false))
    return () => { listeners.delete(listener) }
  }, [])

  async function reload() {
    await load(true)
  }

  return { units, loading, reload }
}
