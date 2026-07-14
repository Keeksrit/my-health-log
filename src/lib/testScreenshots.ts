import { supabase } from './supabase'

export const BUCKET = 'test-screenshots'

const EXT_RE = /^[a-z0-9]{1,5}$/

/** Safe, lowercase file extension (no dot). Falls back to 'png'. */
export function extForFile(file: { name?: string; type?: string }): string {
  const name = file.name ?? ''
  const dot = name.lastIndexOf('.')
  if (dot > 0 && dot < name.length - 1) {
    const ext = name.slice(dot + 1).toLowerCase()
    if (EXT_RE.test(ext)) return ext
  }
  return 'png'
}

/** `${timestamp}-${rand}.${ext}` — timestamp prefix enables newest-first sort. */
export function buildFileName(originalName: string, timestamp: number, rand: string): string {
  return `${timestamp}-${rand}.${extForFile({ name: originalName })}`
}

/** New array sorted newest-first by the numeric prefix before the first '-'. */
export function sortByNewest(names: string[]): string[] {
  const ts = (n: string): number => {
    const num = Number(n.slice(0, n.indexOf('-')))
    return Number.isFinite(num) ? num : -Infinity
  }
  return names
    .map((n, i) => ({ n, i }))
    .sort((a, b) => ts(b.n) - ts(a.n) || a.i - b.i)
    .map((x) => x.n)
}
