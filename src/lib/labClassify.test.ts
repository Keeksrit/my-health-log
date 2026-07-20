import { describe, it, expect } from 'vitest'
import { guessMeta } from './labClassify'

const base = { panel: null, material: 'VERI', resultRaw: '5' }

describe('guessMeta value_type', () => {
  it('numbers are number', () => {
    expect(guessMeta({ ...base, analyte: 'Hemoglobiin', resultRaw: '145' }).value_type).toBe('number')
  })
  it('censored values are number', () => {
    expect(guessMeta({ ...base, analyte: 'CRP', resultRaw: '<0.6' }).value_type).toBe('number')
  })
  it('non-censored words are binary', () => {
    expect(guessMeta({ ...base, analyte: 'Giardia lamblia DNA', resultRaw: 'negatiivne' }).value_type).toBe('binary')
  })
})

describe('guessMeta category', () => {
  const cases: [string, string | null, string | null][] = [
    // analyte, panel, expected category
    ['t1 Timothy IgE', null, 'allergy'],
    ['Hemoglobiin', 'Hemogramm 5-osalise leukogrammiga', 'hematology'],
    ['Giardia lamblia DNA roojas', 'Soole parasiitide DNA paneel roojas', 'infection'],
    ['HbA1c (IFCC)', null, 'chemistry'],
    ['ALP', null, 'liver-kidney'],
    ['eGFR (Crea, CKD-EPI)', null, 'liver-kidney'],
    ['CRP', null, 'inflammation'],
    ['Vitamiin D (25-OH)', null, 'vitamins'],
    ['Ferritiin', null, 'vitamins'],
    ['Mystery analyte', null, null],
  ]
  it.each(cases)('%s → %s', (analyte, panel, expected) => {
    expect(guessMeta({ analyte, panel, material: null, resultRaw: '1' }).category).toBe(expected)
  })
})

describe('guessMeta material', () => {
  it('passes material through', () => {
    expect(guessMeta({ ...base, analyte: 'CRP' }).material).toBe('VERI')
  })
})
