import { useEffect, useState } from 'react'
import { fetchFoodTypes, type FoodType } from './foodTypes'

// Module-level cache shared across all useFoodTypes() consumers so switching pages
// doesn't refetch. reload() refreshes it and notifies every mounted hook.
let cache: FoodType[] | null = null
let inflight: Promise<FoodType[]> | null = null
const listeners = new Set<(t: FoodType[]) => void>()

async function load(force = false): Promise<FoodType[]> {
  if (cache && !force) return cache
  if (!inflight || force) {
    inflight = fetchFoodTypes().then(t => {
      cache = t
      inflight = null
      listeners.forEach(fn => fn(t))
      return t
    }).catch(err => {
      inflight = null
      throw err
    })
  }
  return inflight
}

export function useFoodTypes(): { foodTypes: FoodType[]; loading: boolean; reload: () => Promise<void> } {
  const [foodTypes, setFoodTypes] = useState<FoodType[]>(cache ?? [])
  const [loading, setLoading] = useState(cache === null)

  useEffect(() => {
    const listener = (t: FoodType[]) => setFoodTypes(t)
    listeners.add(listener)
    load().then(() => setLoading(false)).catch(() => setLoading(false))
    return () => { listeners.delete(listener) }
  }, [])

  async function reload() {
    await load(true)
  }

  return { foodTypes, loading, reload }
}
