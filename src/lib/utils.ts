export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

export function dateKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10)
}

export function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export function fmtDateLong(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

export function fmtDateShort(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short',
  })
}

export function sevColor(v: number): string {
  if (v <= 2) return 'var(--accent)'
  if (v === 3) return 'var(--amber)'
  return 'var(--red)'
}
