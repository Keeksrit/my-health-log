import { describe, it, expect } from 'vitest'
import { extForFile, buildFileName, sortByNewest } from './testScreenshots'

describe('extForFile', () => {
  it('derives extension from the file name', () => {
    expect(extForFile({ name: 'Screenshot 2026.PNG' })).toBe('png')
    expect(extForFile({ name: 'scan.jpeg' })).toBe('jpeg')
  })

  it('falls back to png when there is no usable extension', () => {
    expect(extForFile({ name: 'noext' })).toBe('png')
    expect(extForFile({})).toBe('png')
    expect(extForFile({ name: '.hidden' })).toBe('png')
  })

  it('strips anything unsafe and lowercases', () => {
    expect(extForFile({ name: 'x.JP G' })).toBe('png') // space => not a clean ext
    expect(extForFile({ name: 'a.b.Webp' })).toBe('webp')
  })
})

describe('buildFileName', () => {
  it('builds timestamp-rand.ext', () => {
    expect(buildFileName('shot.png', 1700000000000, 'ab12')).toBe('1700000000000-ab12.png')
  })

  it('uses png fallback when name has no extension', () => {
    expect(buildFileName('noext', 42, 'zz')).toBe('42-zz.png')
  })
})

describe('sortByNewest', () => {
  it('sorts by leading timestamp descending', () => {
    expect(sortByNewest(['100-a.png', '300-c.png', '200-b.png']))
      .toEqual(['300-c.png', '200-b.png', '100-a.png'])
  })

  it('puts names without a numeric prefix last and does not mutate input', () => {
    const input = ['5-a.png', 'weird.png', '9-b.png']
    const out = sortByNewest(input)
    expect(out).toEqual(['9-b.png', '5-a.png', 'weird.png'])
    expect(input).toEqual(['5-a.png', 'weird.png', '9-b.png'])
  })

  it('treats a numeric name with no hyphen as no-prefix (sorts last)', () => {
    expect(sortByNewest(['20260101', '300-c.png', '100-a.png']))
      .toEqual(['300-c.png', '100-a.png', '20260101'])
  })

  it('treats a name starting with a hyphen as no-prefix (sorts last)', () => {
    expect(sortByNewest(['-x.png', '300-c.png', '100-a.png']))
      .toEqual(['300-c.png', '100-a.png', '-x.png'])
  })
})
