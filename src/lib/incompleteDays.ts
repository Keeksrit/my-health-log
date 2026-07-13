import { supabase } from './supabase'

// Days flagged "incomplete / not fully accurate" by the user. A row's presence
// = flagged; `day` is a local YYYY-MM-DD key (see dayKeyOf in nutritionFilters).
export async function fetchIncompleteDays(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('nutrition_incomplete_days')
    .select('day')
  if (error) throw error
  return new Set((data ?? []).map((r: { day: string }) => r.day))
}

// Toggle a day's flag. Insert when flagging, delete when clearing. Insert is
// idempotent (primary key on day) — a duplicate flag is ignored, not an error.
export async function setDayIncomplete(day: string, flagged: boolean): Promise<void> {
  if (flagged) {
    const { error } = await supabase
      .from('nutrition_incomplete_days')
      .upsert({ day }, { onConflict: 'day' })
    if (error) throw error
  } else {
    const { error } = await supabase
      .from('nutrition_incomplete_days')
      .delete()
      .eq('day', day)
    if (error) throw error
  }
}
