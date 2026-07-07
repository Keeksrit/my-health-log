-- Nutrition feature schema (health schema)
-- Run in the Supabase SQL editor.

create table if not exists health.nutrition_ingredients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        text,
  created_at  timestamptz not null default now()
);
create unique index if not exists nutrition_ingredients_name_lower_idx
  on health.nutrition_ingredients (lower(name));

create table if not exists health.nutrition_foods (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);
create unique index if not exists nutrition_foods_name_lower_idx
  on health.nutrition_foods (lower(name));

create table if not exists health.nutrition_food_ingredients (
  food_id        uuid not null references health.nutrition_foods(id) on delete cascade,
  ingredient_id  uuid not null references health.nutrition_ingredients(id) on delete restrict,
  primary key (food_id, ingredient_id)
);

create table if not exists health.nutrition_consumption_log (
  id          uuid primary key default gen_random_uuid(),
  food_id     uuid not null references health.nutrition_foods(id) on delete restrict,
  amount      numeric,
  unit        text,
  type        text,
  eaten_at    timestamptz not null,
  created_at  timestamptz not null default now()
);
create index if not exists nutrition_consumption_log_eaten_at_idx
  on health.nutrition_consumption_log (eaten_at desc);

-- Grants: the app authenticates as the `anon` role (VITE_SUPABASE_ANON_KEY).
-- Without these, querying the tables fails with "permission denied for table ...".
-- This mirrors the access the existing medication_* tables already have.
grant usage on schema health to anon, authenticated;
grant select, insert, update, delete on
  health.nutrition_ingredients,
  health.nutrition_foods,
  health.nutrition_food_ingredients,
  health.nutrition_consumption_log
to anon, authenticated;
-- No sequence grants needed: primary keys use gen_random_uuid(), not serial.

-- Migration (2026-06-27): relocate `type` from foods to the log.
-- Run once on an existing database:
--   alter table health.nutrition_consumption_log add column if not exists type text;
--   alter table health.nutrition_foods drop column if exists type;

-- RLS: require an authenticated JWT for the nutrition tables (mirrors the
-- health-schema lockdown in migrations/2026-07-07-auth-rls.sql). The anon grants
-- above remain but are blocked by these policies. Idempotent via drop-if-exists.
-- For existing databases, use migrations/2026-07-07-auth-rls.sql (drops all prior policies by name).
do $$
declare tbl text;
begin
  for tbl in select unnest(array[
    'nutrition_ingredients',
    'nutrition_foods',
    'nutrition_food_ingredients',
    'nutrition_consumption_log'
  ])
  loop
    execute format('alter table health.%I enable row level security;', tbl);
    execute format('drop policy if exists "Authenticated only" on health.%I;', tbl);
    execute format(
      'create policy "Authenticated only" on health.%I '
      'for all using (auth.role() = ''authenticated'') '
      'with check (auth.role() = ''authenticated'');',
      tbl
    );
  end loop;
end $$;
