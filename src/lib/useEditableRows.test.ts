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
  it('treats null and undefined as distinct', () => {
    expect(rowsEqual({ id: '1', amount: null }, { id: '1', amount: undefined })).toBe(false)
  })
  it('is true when array fields have identical contents and order', () => {
    expect(rowsEqual({ id: '1', ids: ['a', 'b'] }, { id: '1', ids: ['a', 'b'] })).toBe(true)
  })
  it('is false when array fields differ in order', () => {
    expect(rowsEqual({ id: '1', ids: ['a', 'b'] }, { id: '1', ids: ['b', 'a'] })).toBe(false)
  })
  it('is false when array fields differ in length', () => {
    expect(rowsEqual({ id: '1', ids: ['a'] }, { id: '1', ids: ['a', 'b'] })).toBe(false)
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
  it('does not report a row dirty when its array field was changed then restored', () => {
    const srcWithArr = [{ id: '1', name: 'a', ids: ['x', 'y'] }]
    // simulate: changed ids to ['x'], then restored back to ['x', 'y']
    const workingRestored = [{ id: '1', name: 'a', ids: ['x', 'y'] }]
    expect(computeDirty(srcWithArr, workingRestored)).toEqual([])
  })
})
