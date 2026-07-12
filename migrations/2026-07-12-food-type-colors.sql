-- Per-food-type dot colors. Adds a nullable color column to the food-types
-- table; existing rows stay null and render with the grey fallback until a
-- color is picked in Settings.
--
-- Setting a color UPDATEs an existing row, but the table was only granted
-- select/insert/delete to authenticated (no prior feature updated it), so the
-- update was denied at the grant level before RLS. Grant update as well. The
-- existing "for all" RLS policy already covers updates.
--
-- Run in the Supabase SQL editor. Idempotent: safe to re-run.

alter table health.nutrition_food_types
  add column if not exists color text;

grant update on health.nutrition_food_types to authenticated;
