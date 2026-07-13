-- Per-day "incomplete / not fully accurate" flag for the nutrition log.
-- Presence of a row for a given local calendar day = that day is flagged
-- incomplete (the user forgot to log some foods). Toggling on inserts a row,
-- toggling off deletes it; the flag is never updated in place.
--
-- Run in the Supabase SQL editor. Idempotent: safe to re-run.

create table if not exists health.nutrition_incomplete_days (
  day        date primary key,
  created_at timestamptz not null default now()
);

-- RLS-only security model: authenticated needs explicit table grants
-- (RLS filters rows only AFTER grant checks pass), plus an authenticated-only
-- policy so the anon key is blocked. Only select/insert/delete are used — the
-- flag is never updated in place — so no update grant.
grant select, insert, delete on health.nutrition_incomplete_days to authenticated;

alter table health.nutrition_incomplete_days enable row level security;

drop policy if exists nutrition_incomplete_days_authenticated on health.nutrition_incomplete_days;
create policy nutrition_incomplete_days_authenticated
  on health.nutrition_incomplete_days
  for all
  to authenticated
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
