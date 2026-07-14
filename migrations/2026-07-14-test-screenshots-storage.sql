-- Storage bucket for the "Tests" page: screenshots of medical test results.
-- Private bucket (health data) — the app displays images via short-lived signed
-- URLs. No DB table; the bucket's object list is the data.
--
-- Run in the Supabase SQL editor. Idempotent: safe to re-run.

-- 1. Private bucket.
insert into storage.buckets (id, name, public)
values ('test-screenshots', 'test-screenshots', false)
on conflict (id) do nothing;

-- 2. RLS-only security: authenticated-user-only access to objects in this
-- bucket. Only select/insert/delete are used (upload = insert new object,
-- delete = remove; objects are never updated in place), so no update policy.
drop policy if exists test_screenshots_select on storage.objects;
create policy test_screenshots_select
  on storage.objects for select to authenticated
  using (bucket_id = 'test-screenshots' and auth.role() = 'authenticated');

drop policy if exists test_screenshots_insert on storage.objects;
create policy test_screenshots_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'test-screenshots' and auth.role() = 'authenticated');

drop policy if exists test_screenshots_delete on storage.objects;
create policy test_screenshots_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'test-screenshots' and auth.role() = 'authenticated');
