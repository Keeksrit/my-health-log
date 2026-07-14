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
    const idx = n.indexOf('-')
    if (idx <= 0) return -Infinity
    const num = Number(n.slice(0, idx))
    return Number.isFinite(num) ? num : -Infinity
  }
  return names
    .map((n, i) => ({ n, i }))
    .sort((a, b) => ts(b.n) - ts(a.n) || a.i - b.i)
    .map((x) => x.n)
}

export type Screenshot = { path: string; url: string }

const SIGNED_URL_TTL = 60 * 60 // 1 hour

/** Short random suffix (no Math.random dependency issues in tests — this is runtime-only). */
function randSuffix(): string {
  return Math.random().toString(36).slice(2, 8)
}

export async function uploadScreenshot(file: File): Promise<void> {
  const name = buildFileName(file.name, Date.now(), randSuffix())
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(name, file, { contentType: file.type || `image/${extForFile(file)}` })
  if (error) throw error
}

export async function listScreenshots(): Promise<Screenshot[]> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list('', { limit: 1000, sortBy: { column: 'name', order: 'desc' } })
  if (error) throw error
  const names = sortByNewest((data ?? []).map((o) => o.name))
  const out: Screenshot[] = []
  for (const path of names) {
    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL)
    if (signErr || !signed) continue
    out.push({ path, url: signed.signedUrl })
  }
  return out
}

export async function deleteScreenshot(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) throw error
}
