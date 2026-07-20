import { describe, it, expect } from 'vitest'
import { descriptionsToCsv, parseDescRows, computeDescPlan } from './labDescriptionsCsv'
import { parseCsv } from './nutrition'

const row = { analyte: 'CRP', category: 'inflammation', value_type: 'number', material: 'VERI', description: 'C-reactive protein' }

describe('descriptions CSV round-trip', () => {
  it('is lossless across all five columns', () => {
    const csv = descriptionsToCsv([row])
    const back = parseDescRows(csv.trim().split(/\r?\n/).map(l => l.split(',').map(c => c.replace(/^"|"$/g, ''))))
    expect(back).toEqual([row])
  })
  it('round-trips a field containing a comma via the real CSV parser', () => {
    const commaRow = { analyte: 'IgE', category: 'allergy', value_type: 'number', material: 'VERI', description: 'total, serum' }
    const csv = descriptionsToCsv([commaRow])
    expect(parseDescRows(parseCsv(csv))).toEqual([commaRow])
  })
  it('drops the header row and trims', () => {
    const rows = parseDescRows([
      ['analyte', 'category', 'value_type', 'material', 'description'],
      [' CRP ', ' inflammation ', ' number ', ' VERI ', ' C-reactive protein '],
    ])
    expect(rows).toEqual([row])
  })
})

describe('computeDescPlan', () => {
  it('sync mode deletes DB analytes absent from the file', () => {
    const plan = computeDescPlan([row], ['CRP', 'ALP'], 'sync')
    expect(plan.upserts).toEqual([row])
    expect(plan.deletes).toEqual(['ALP'])
  })
})
