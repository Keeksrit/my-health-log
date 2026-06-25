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
  type        text,
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
  amount      numeric not null,
  unit        text not null,
  eaten_at    timestamptz not null,
  created_at  timestamptz not null default now()
);
