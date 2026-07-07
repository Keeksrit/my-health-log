-- Editable log-entry units. Replaces the hardcoded LOG_UNITS array with a
-- user-managed table. Units are stored as plain strings on log entries, so
-- deleting a unit here never alters historical entries.
--
-- Run in the Supabase SQL editor. Idempotent: safe to re-run.

create table if not exists health.nutrition_units (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

-- Seed the units that used to live in the LOG_UNITS const.
insert into health.nutrition_units (name)
values ('g'), ('ml'), ('serving'), ('piece')
on conflict (name) do nothing;

-- RLS-only security model: authenticated needs explicit table grants
-- (RLS filters rows only AFTER grant checks pass), plus an authenticated-only
-- policy so the anon key is blocked.
grant select, insert, delete on health.nutrition_units to authenticated;

alter table health.nutrition_units enable row level security;

drop policy if exists nutrition_units_authenticated on health.nutrition_units;
create policy nutrition_units_authenticated
  on health.nutrition_units
  for all
  to authenticated
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
