import { describe, it, expect } from 'vitest'
import { rowsEqual, computeDirty } from './useEditableRows'

describe('rowsEqual', () => {
  it('is true for shallow-equal objects', () => {
    expect(rowsEqual({ id: '1', name: 'a' }, { id: '1', name: 'a' })).toBe(true)
  })
  it('is false when a field differs', () => {
    expect(rowsEqual({ id: '1', name: 'a' }, { id: '1', name: 'b' })).toBe(false)
  })
  it('is false when key sets differ', () => {
    expect(rowsEqual({ id: '1' }, { id: '1', name: 'a' })).toBe(false)
  })
})

describe('computeDirty', () => {
  const source = [{ id: '1', name: 'a' }, { id: '2', name: 'b' }]
  it('returns only changed rows that still exist', () => {
    const working = [{ id: '1', name: 'A' }, { id: '2', name: 'b' }]
    expect(computeDirty(source, working)).toEqual([{ id: '1', name: 'A' }])
  })
  it('ignores rows removed from the working copy', () => {
    expect(computeDirty(source, [{ id: '2', name: 'b' }])).toEqual([])
  })
  it('returns empty when nothing changed', () => {
    expect(computeDirty(source, source)).toEqual([])
  })
})
