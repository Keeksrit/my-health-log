import { useState } from 'react'

export function rowsEqual(a: Record<string, any>, b: Record<string, any>): boolean {
  const ak = Object.keys(a)
  const bk = Object.keys(b)
  if (ak.length !== bk.length) return false
  return ak.every(k => a[k] === b[k])
}

export function computeDirty<T extends { id: string }>(source: T[], working: T[]): T[] {
  const byId = new Map(source.map(r => [r.id, r]))
  return working.filter(r => {
    const orig = byId.get(r.id)
    return orig != null && !rowsEqual(orig, r)
  })
}

export function useEditableRows<T extends { id: string }>(source: T[]) {
  const [editing, setEditing] = useState(false)
  const [working, setWorking] = useState<T[]>([])
  const [deletedIds, setDeletedIds] = useState<string[]>([])

  // Outside edit mode, render straight from source so a parent reload is
  // reflected immediately. The working copy lives only while editing.
  const rows = editing ? working : source

  function begin() {
    setWorking(source.map(r => ({ ...r })))
    setDeletedIds([])
    setEditing(true)
  }
  function cancel() { setEditing(false); setDeletedIds([]) }
  function finish() { setEditing(false); setDeletedIds([]) }
  function setRow(id: string, patch: Partial<T>) {
    setWorking(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)))
  }
  function removeRow(id: string) {
    setWorking(prev => prev.filter(r => r.id !== id))
    setDeletedIds(prev => (source.some(r => r.id === id) ? [...prev, id] : prev))
  }

  return {
    editing, rows, begin, cancel, finish, setRow, removeRow,
    dirtyRows: editing ? computeDirty(source, working) : [],
    deletedIds,
  }
}
