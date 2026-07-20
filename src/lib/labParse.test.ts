import { describe, it, expect } from 'vitest'
import { parseResultNum, parseRefBounds, parseSession, censoredDir } from './labParse'

describe('parseResultNum', () => {
  it('parses a plain decimal', () => {
    expect(parseResultNum('5.2')).toBe(5.2)
  })
  it('accepts comma decimals', () => {
    expect(parseResultNum('5,2')).toBe(5.2)
  })
  it('returns the numeric bound for censored (</>) values', () => {
    expect(parseResultNum('<0.10')).toBe(0.10)
    expect(parseResultNum('> 100')).toBe(100)
  })
  it('returns null for non-numeric text', () => {
    expect(parseResultNum('Negatiivne')).toBeNull()
    expect(parseResultNum('')).toBeNull()
  })
})

describe('censoredDir', () => {
  it('reads the censoring direction from the raw string', () => {
    expect(censoredDir('<0.6')).toBe('<')
    expect(censoredDir('> 100')).toBe('>')
  })
  it('returns null for plain numbers and words', () => {
    expect(censoredDir('5.2')).toBeNull()
    expect(censoredDir('Negatiivne')).toBeNull()
    expect(censoredDir('')).toBeNull()
  })
})

describe('parseRefBounds', () => {
  it('parses a two-sided range', () => {
    expect(parseRefBounds('2.0-4.5')).toEqual({ min: 2.0, max: 4.5 })
  })
  it('parses comma-decimal ranges with spaces', () => {
    expect(parseRefBounds('2,0 - 4,5')).toEqual({ min: 2.0, max: 4.5 })
  })
  it('parses a less-than bound', () => {
    expect(parseRefBounds('<5')).toEqual({ min: null, max: 5 })
  })
  it('parses a greater-than bound', () => {
    expect(parseRefBounds('>1')).toEqual({ min: 1, max: null })
  })
  it('returns nulls for qualitative/empty refs', () => {
    expect(parseRefBounds('Negatiivne')).toEqual({ min: null, max: null })
    expect(parseRefBounds('')).toEqual({ min: null, max: null })
  })
})

const SAMPLE = [
  'Proovimaterjal: SEERUM, Proovinõu ID: L26070702301, Võetud: 07.07.2026 15:13',
  'Seerum - 07.07.2026 15:13',
  'Analüüs\tTulemus\tÜhik\tRef.väärtus',
  'd1 Dermatophagoides pteronyssinus\t<0.10\tkU/L\t<0.35',
  'Tulemuse tõlgendus: Negatiivne',
  'Kolesterool\t5,2\tmmol/L\t2.0-5.0',
  'Tulemuse tõlgendus: Kõrge',
].join('\n')

describe('parseSession', () => {
  it('extracts session metadata', () => {
    const s = parseSession(SAMPLE)
    expect(s.sample_id).toBe('L26070702301')
    expect(s.material).toBe('SEERUM')
    expect(s.taken_at).toBe(new Date(2026, 6, 7, 15, 13).toISOString())
  })
  it('parses each analyte row and skips the header + restated material line', () => {
    const s = parseSession(SAMPLE)
    expect(s.results).toHaveLength(2)
    expect(s.results[0]).toEqual({
      analyte: 'd1 Dermatophagoides pteronyssinus',
      result_raw: '<0.10', result_num: 0.10, unit: 'kU/L',
      ref: '<0.35', ref_min: null, ref_max: 0.35, verdict: 'Negatiivne',
    })
    expect(s.results[1]).toEqual({
      analyte: 'Kolesterool',
      result_raw: '5,2', result_num: 5.2, unit: 'mmol/L',
      ref: '2.0-5.0', ref_min: 2.0, ref_max: 5.0, verdict: 'Kõrge',
    })
  })
  it('throws when the sample id is missing', () => {
    expect(() => parseSession('Analüüs\tTulemus\nKolesterool\t5\tmmol/L\t2-5')).toThrow(/sample/i)
  })
})
