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
