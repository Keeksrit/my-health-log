import { describe, it, expect } from 'vitest'
import { descriptionsToCsv, parseDescRows, computeDescPlan } from './labDescriptionsCsv'

describe('descriptionsToCsv', () => {
  it('writes a header then rows, quoting commas', () => {
    const csv = descriptionsToCsv([{ analyte: 'IgE', description: 'total, serum' }])
    expect(csv).toBe('analyte,description\r\n"IgE","total, serum"\r\n'.replace('"IgE"', 'IgE'))
  })
})

describe('parseDescRows', () => {
  it('drops the header and trims', () => {
    const rows = parseDescRows([['analyte', 'description'], [' IgE ', ' total ']])
    expect(rows).toEqual([{ analyte: 'IgE', description: 'total' }])
  })
})

describe('computeDescPlan', () => {
  it('sync mode: upserts file rows, deletes DB analytes absent from file', () => {
    const plan = computeDescPlan(
      [{ analyte: 'IgE', description: 'a' }],
      ['IgE', 'CRP'],
      'sync',
    )
    expect(plan.upserts).toEqual([{ analyte: 'IgE', description: 'a' }])
    expect(plan.deletes).toEqual(['CRP'])
  })
  it('add mode: never deletes', () => {
    const plan = computeDescPlan([{ analyte: 'IgE', description: 'a' }], ['CRP'], 'add')
    expect(plan.upserts).toEqual([{ analyte: 'IgE', description: 'a' }])
    expect(plan.deletes).toEqual([])
  })
})
