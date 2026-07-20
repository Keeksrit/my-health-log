-- Lab classification & smarter charts: additive columns for the /tests tracker.
-- Run once in the Supabase SQL editor. Idempotent (ADD COLUMN IF NOT EXISTS).
-- Builds on migrations/2026-07-18-lab-tracker.sql.

-- Full pasted block per sample, so a bad parse never loses the original.
alter table health.lab_sessions
  add column if not exists raw_text text;

-- Group header above a row (e.g. "Hemogramm 5-osalise leukogrammiga") and the
-- lab caveat line "Tulemuse märkus:". "verdict" keeps "Tulemuse tõlgendus:".
alter table health.lab_results
  add column if not exists panel text;
alter table health.lab_results
  add column if not exists note text;

-- Analyte dictionary grows into a classification table. value_type is
-- 'number' | 'binary' (nullable = unclassified); kept free-text (no CHECK) to
-- avoid migration churn — the UI constrains input via dropdowns.
alter table health.lab_analyte_descriptions
  add column if not exists category text;
alter table health.lab_analyte_descriptions
  add column if not exists value_type text;
alter table health.lab_analyte_descriptions
  add column if not exists material text;

-- No grant/RLS change: lab_sessions & lab_results are insert-only (existing
-- grants cover the new columns); lab_analyte_descriptions already has UPDATE.
