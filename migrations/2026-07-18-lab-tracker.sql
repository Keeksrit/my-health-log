-- Lab tracker: structured lab-results tracker for /tests.
-- Run once in the Supabase SQL editor. Idempotent (IF NOT EXISTS).

create table if not exists health.lab_sessions (
  id         uuid primary key default gen_random_uuid(),
  sample_id  text unique not null,
  material   text,
  taken_at   timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists health.lab_results (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references health.lab_sessions(id) on delete cascade,
  analyte    text not null,
  result_raw text not null,
  result_num double precision,
  unit       text,
  ref        text,
  ref_min    double precision,
  ref_max    double precision,
  verdict    text
);
create index if not exists lab_results_session_id_idx on health.lab_results(session_id);

create table if not exists health.lab_analyte_descriptions (
  analyte     text primary key,
  description text
);

create table if not exists health.lab_events (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  event_date date not null,
  color      text
);

-- Grants. select/insert/delete on all; UPDATE only on the two edited-in-place tables.
grant select, insert, delete on health.lab_sessions             to authenticated;
grant select, insert, delete on health.lab_results              to authenticated;
grant select, insert, delete, update on health.lab_analyte_descriptions to authenticated;
grant select, insert, delete, update on health.lab_events       to authenticated;

-- RLS: authenticated-only, matching the rest of the health schema.
alter table health.lab_sessions             enable row level security;
alter table health.lab_results              enable row level security;
alter table health.lab_analyte_descriptions enable row level security;
alter table health.lab_events               enable row level security;

create policy lab_sessions_auth on health.lab_sessions
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy lab_results_auth on health.lab_results
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy lab_analyte_descriptions_auth on health.lab_analyte_descriptions
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy lab_events_auth on health.lab_events
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
