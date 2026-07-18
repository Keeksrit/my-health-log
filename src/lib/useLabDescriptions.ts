import { useEffect, useState } from 'react'
import { fetchDescriptions, type AnalyteDescription } from './labDescriptions'

let cache: AnalyteDescription[] | null = null
let inflight: Promise<AnalyteDescription[]> | null = null
const listeners = new Set<(d: AnalyteDescription[]) => void>()

async function load(force = false): Promise<AnalyteDescription[]> {
  if (cache && !force) return cache
  if (!inflight || force) {
    inflight = fetchDescriptions().then(d => {
      cache = d
      inflight = null
      listeners.forEach(fn => fn(d))
      return d
    }).catch(err => { inflight = null; throw err })
  }
  return inflight
}

export function useLabDescriptions(): {
  descriptions: AnalyteDescription[]; loading: boolean; reload: () => Promise<void>
} {
  const [descriptions, setDescriptions] = useState<AnalyteDescription[]>(cache ?? [])
  const [loading, setLoading] = useState(cache === null)

  useEffect(() => {
    const listener = (d: AnalyteDescription[]) => setDescriptions(d)
    listeners.add(listener)
    load().then(() => setLoading(false)).catch(() => setLoading(false))
    return () => { listeners.delete(listener) }
  }, [])

  async function reload() { await load(true) }
  return { descriptions, loading, reload }
}
