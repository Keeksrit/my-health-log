-- Auth RLS migration — require an authenticated JWT for EVERY table in the
-- health schema. Run in the Supabase SQL editor AFTER creating your user and
-- disabling sign-ups.
--
-- Before this, the anon key had explicit select/insert/update/delete grants on
-- the health tables and there were no RLS policies, so anyone with the bundled
-- anon key could read/write/delete freely. After this, every request must carry
-- a valid logged-in JWT (auth.role() = 'authenticated'); the anon role is
-- blocked by RLS even though its grants remain.
--
-- Covers every table in the health schema dynamically (not a hardcoded list, so
-- new tables are caught too) and drops ALL existing policies on each table
-- before creating the authenticated-only policy — a leftover permissive policy
-- under any name would otherwise still grant anon access (Postgres ORs
-- permissive policies together).
--
-- Idempotent: safe to re-run.

-- PRE-FLIGHT: verify authenticated grants first
--
-- RLS only filters rows AFTER table-level GRANT checks pass. If a table has
-- a grant to anon but NOT to authenticated, logged-in users will get
-- "permission denied" even though RLS would allow them. Verify and add missing
-- grants BEFORE running this migration:
--
-- select grantee, table_name, privilege_type
--   from information_schema.role_table_grants
--  where table_schema = 'health' and grantee = 'authenticated'
--  order by table_name;
--
-- If authenticated is missing select/insert/update/delete on any table
-- (especially entries and medication_*), run:
--   grant select, insert, update, delete on health.<table> to authenticated;
-- for each missing table BEFORE running this migration — otherwise logged-in
-- access to those tables will fail with "permission denied".

do $$
declare
  tbl text;
  pol text;
begin
  for tbl in
    select tablename from pg_tables where schemaname = 'health'
  loop
    execute format('alter table health.%I enable row level security;', tbl);

    for pol in
      select policyname from pg_policies
      where schemaname = 'health' and tablename = tbl
    loop
      execute format('drop policy %I on health.%I;', pol, tbl);
    end loop;

    execute format(
      'create policy "Authenticated only" on health.%I '
      'for all using (auth.role() = ''authenticated'') '
      'with check (auth.role() = ''authenticated'');',
      tbl
    );
  end loop;
end $$;
