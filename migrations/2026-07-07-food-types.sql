-- Move consumption "type" from the log onto foods (a food's category is intrinsic:
-- "salty snack" is always a salty snack regardless of when it was eaten). Food types
-- become a user-managed list, mirroring nutrition_units. Types are plain strings on
-- foods, so deleting a type here never alters existing foods.
--
-- Run in the Supabase SQL editor. Idempotent: safe to re-run.

-- 1. Foods gain a free-string type column.
alter table health.nutrition_foods add column if not exists type text;

-- 2. Editable food-type list (same shape as nutrition_units).
create table if not exists health.nutrition_food_types (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

insert into health.nutrition_food_types (name)
values ('salty snack'), ('sweet snack'), ('drink'), ('main'), ('sports'), ('fermented')
on conflict (name) do nothing;

grant select, insert, delete on health.nutrition_food_types to authenticated;

alter table health.nutrition_food_types enable row level security;

drop policy if exists nutrition_food_types_authenticated on health.nutrition_food_types;
create policy nutrition_food_types_authenticated
  on health.nutrition_food_types
  for all
  to authenticated
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- 3. Backfill each food's type from the most frequent non-null type across its log
--    entries, so existing categorization survives the column drop.
update health.nutrition_foods f
set type = sub.type
from (
  select distinct on (food_id) food_id, type
  from (
    select food_id, type, count(*) as n
    from health.nutrition_consumption_log
    where type is not null
    group by food_id, type
  ) counts
  order by food_id, n desc, type
) sub
where sub.food_id = f.id
  and f.type is null;

-- 4. Drop the log's type column.
alter table health.nutrition_consumption_log drop column if exists type;
