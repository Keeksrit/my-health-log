import { parseResultNum, censoredDir } from './labParse'

export interface AnalyteMeta {
  material: string | null
  category: string | null
  value_type: 'number' | 'binary'
}

// First match wins. Estonian portal terms included. Order matters: more specific
// panels/analytes should precede broader ones (e.g. HbA1c before generic).
const CATEGORY_RULES: { category: string; keywords: string[] }[] = [
  { category: 'allergy', keywords: ['ige'] },
  { category: 'hematology', keywords: ['hemogramm', 'leukogramm', 'wbc', 'rbc', 'erü', 'trombo', 'hemoglobiin'] },
  { category: 'infection', keywords: ['parasiit', 'dna paneel'] },
  { category: 'chemistry', keywords: ['glükoos', 'glucose', 'hba1c', 'naatrium', 'kaalium', 'kloriid'] },
  { category: 'liver-kidney', keywords: ['alp', 'alat', 'asat', 'bilirubiin', 'ggt', 'egfr', 'kreatiniin', 'crea'] },
  { category: 'inflammation', keywords: ['crp', 'settereaktsioon'] },
  { category: 'vitamins', keywords: ['vitamiin', 'b12', 'folaat', 'folate', 'ferritiin', 'raud', 'iron'] },
]

function guessCategory(haystack: string): string | null {
  const h = haystack.toLowerCase()
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some(k => h.includes(k))) return rule.category
  }
  return null
}

export function guessMeta(
  input: { analyte: string; panel: string | null; material: string | null; resultRaw: string },
): AnalyteMeta {
  const raw = input.resultRaw.trim()
  const isNumber = parseResultNum(raw) != null || censoredDir(raw) != null
  const value_type: 'number' | 'binary' = !isNumber && raw !== '' ? 'binary' : 'number'
  return {
    material: input.material,
    category: guessCategory(`${input.panel ?? ''} ${input.analyte}`),
    value_type,
  }
}
