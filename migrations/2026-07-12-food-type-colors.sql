-- Per-food-type dot colors. Adds a nullable color column to the food-types
-- table; existing rows stay null and render with the grey fallback until a
-- color is picked in Settings. Column inherits the table's existing grants
-- and RLS policy, so no grant/policy change is needed.
--
-- Run in the Supabase SQL editor. Idempotent: safe to re-run.

alter table health.nutrition_food_types
  add column if not exists color text;
