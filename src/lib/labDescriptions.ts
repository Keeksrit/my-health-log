import { supabase } from './supabase'
import type { DescRow, DescSyncPlan } from './labDescriptionsCsv'

export interface AnalyteDescription {
  analyte: string
  description: string | null
  category: string | null
  value_type: string | null
  material: string | null
}

export async function fetchDescriptions(): Promise<AnalyteDescription[]> {
  const { data, error } = await supabase
    .from('lab_analyte_descriptions')
    .select('*')
    .order('analyte')
  if (error) throw error
  return data as AnalyteDescription[]
}

export async function upsertDescription(analyte: string, description: string): Promise<void> {
  const a = analyte.trim()
  if (!a) throw new Error('Analyte name cannot be empty')
  const { error } = await supabase
    .from('lab_analyte_descriptions')
    .upsert({ analyte: a, description }, { onConflict: 'analyte' })
  if (error) throw error
}

export async function deleteDescription(analyte: string): Promise<void> {
  const { error } = await supabase.from('lab_analyte_descriptions').delete().eq('analyte', analyte)
  if (error) throw error
}

export async function applyDescPlan(plan: DescSyncPlan): Promise<void> {
  if (plan.upserts.length) {
    const rows: DescRow[] = plan.upserts
    const { error } = await supabase
      .from('lab_analyte_descriptions')
      .upsert(rows, { onConflict: 'analyte' })
    if (error) throw error
  }
  for (const analyte of plan.deletes) await deleteDescription(analyte)
}

// Seed the dictionary with guessed metadata for analytes not already present.
// ignoreDuplicates keeps any existing (possibly user-corrected) row untouched.
export async function seedAnalyteMeta(
  rows: { analyte: string; material: string | null; category: string | null; value_type: string }[],
): Promise<void> {
  if (!rows.length) return
  const { error } = await supabase
    .from('lab_analyte_descriptions')
    .upsert(rows, { onConflict: 'analyte', ignoreDuplicates: true })
  if (error) throw error
}

// Update classification fields for one analyte (Settings inline edit).
export async function updateAnalyteMeta(
  analyte: string,
  patch: { category?: string | null; value_type?: string | null; material?: string | null },
): Promise<void> {
  const { error } = await supabase
    .from('lab_analyte_descriptions')
    .update(patch)
    .eq('analyte', analyte)
  if (error) throw error
}
