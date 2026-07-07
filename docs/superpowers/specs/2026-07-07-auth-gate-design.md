# Auth gate for Health Log — design

**Date:** 2026-07-07
**Status:** Approved for planning

Ports the approved Sports Hub auth pattern
(`sports-hub/docs/superpowers/specs/2026-07-01-auth-gate-design.md`) to the
Health Log app.

## Problem

The app ships `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` into the frontend
bundle (the `VITE_` prefix inlines them into client JS). The `health` schema
grants full `select, insert, update, delete` directly to the `anon` role
(`db/nutrition_schema.sql:43-48`) and has no RLS policies. This is a bigger hole
than Sports Hub had: anyone who loads the deployed site — or extracts the URL +
anon key from the bundle — can read, overwrite, or delete all health data with no
login.

## Goal

Secure the single-user app so only the authenticated owner can read or write
data. Scope is **auth-for-security only** — NOT multi-tenancy. No `user_id`
columns, no per-row ownership. That remains a possible future extension.

## Decisions

- **Sign-in method:** email + password (`supabase.auth.signInWithPassword`).
- **Gate scope:** whole app behind login. Nothing mounts until authenticated, so
  no data queries fire for an unauthenticated visitor.
- **Sign-ups:** disabled. The login screen only signs in, never registers. The
  single user is provisioned manually in the Supabase dashboard.
- **Logout placement:** top-right of the persistent `Header` (Health Log has no
  sidebar, unlike Sports Hub).
- **Lockdown method:** RLS with an authenticated-only policy on every `health`
  table (mirrors Sports Hub). The existing anon table grants are left in place —
  RLS blocks anon regardless of the grant. Revoking the anon grants is out of
  scope (defense-in-depth deferred).

## Architecture

### 1. `AuthGate` component (new) — `src/components/auth/AuthGate.tsx`

Wraps `<App>` in `main.tsx`. To guarantee no route/page mounts pre-auth, the
gate encloses `<BrowserRouter>` (i.e. `AuthGate` is the outermost app element
after `StrictMode`).

Behavior:
- On mount, call `supabase.auth.getSession()`; subscribe to
  `supabase.auth.onAuthStateChange`. Unsubscribe on unmount.
- While the initial session check is pending → render a minimal loading state
  (avoids a login-form flash for already-logged-in users).
- **No session →** render `<Login>`. Nothing else mounts.
- **Session present →** render the existing app unchanged.
- Fail closed: a session-check error shows the login form.

Direct port of Sports Hub's `AuthGate`, using Health Log's `supabase` client
(`src/lib/supabase.ts`).

### 2. `Login` component (new) — `src/components/auth/Login.tsx`

- Email + password form. Submit calls `supabase.auth.signInWithPassword`.
- On error, show the message inline (e.g. "Invalid login credentials"). No
  registration link, no password-reset link (out of scope).
- Branded header: **"🩺 My Health Log"** (Sports Hub used "⚡ Sports Hub").
- Styled with a new `Login.module.css` to match Health Log's CSS-modules
  convention (Sports Hub used inline styles; this codebase uses modules).
- On success, `onAuthStateChange` fires and `AuthGate` swaps to the app; the
  component does not manually redirect.

### 3. Logout control — `src/components/layout/Header.tsx`

- Add a small "Sign out" button pinned top-right of the existing `Header`
  (which currently shows the app title + today's date).
- Calls `supabase.auth.signOut()`; `onAuthStateChange` returns the user to
  `<Login>`.
- Style added to `Header.module.css`.

### 4. RLS migration (the actual lock) — `migrations/2026-07-07-auth-rls.sql`

New migration SQL, same dynamic approach as Sports Hub but over the `health`
schema. For every table in `health`:
- enable row level security,
- drop ALL existing policies (a leftover permissive policy under any name would
  still grant access — Postgres ORs permissive policies together),
- create one policy:

```sql
create policy "Authenticated only" on health.<table>
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
```

Iterates `pg_tables where schemaname = 'health'` so new tables are covered too.
Idempotent — safe to re-run.

`db/nutrition_schema.sql` is updated to enable RLS and add the authenticated-only
policy for its tables, so a fresh setup is secure from the start.

After this migration, the bare anon key can no longer read or delete anything —
requests must carry a valid logged-in JWT.

## Data flow

Pages are unchanged. They keep calling `supabase.from(...)` /
`fetchEntries()` etc. directly. The only difference: once logged in, the Supabase
client attaches the user's JWT to every request, which the new RLS policies
require. No page-level code changes needed.

## Session persistence

Supabase's client persists the session in `localStorage` by default. The user
stays logged in across refreshes and only re-authenticates when the token
expires / refresh fails. No extra work.

## Manual steps (owner, outside code)

These cannot be done from the codebase and must happen for the feature to work:

1. Supabase dashboard → Authentication → Users → create the single user
   (email + password).
2. Supabase dashboard → Auth settings → disable "Allow new users to sign up".
3. Run `migrations/2026-07-07-auth-rls.sql` in the Supabase SQL editor.

The code changes are inert until these run: without step 1 you cannot log in;
without step 3 the data hole stays open. The implementation plan will surface
these as explicit checklist items.

## Error handling

- Bad credentials → inline error on the login form.
- Session-check network failure on mount → show login form (fail closed).
- Expired token mid-session → `onAuthStateChange` fires `SIGNED_OUT`; user is
  returned to login. In-flight writes may fail; acceptable for a single-user app.

## Out of scope (YAGNI)

- Multi-user / per-row ownership (`user_id` columns, `auth.uid()` policies).
- Revoking the anon role's table grants (RLS-only lockdown was chosen).
- Password reset, email verification, magic links, OAuth.
- Role tiers / permissions.

## Files touched

- `src/main.tsx` — wire in `AuthGate`.
- `src/components/auth/AuthGate.tsx` — new.
- `src/components/auth/Login.tsx` — new.
- `src/components/auth/Login.module.css` — new.
- `src/components/layout/Header.tsx` — add logout button.
- `src/components/layout/Header.module.css` — logout button style.
- `migrations/2026-07-07-auth-rls.sql` — new.
- `db/nutrition_schema.sql` — add RLS + authenticated-only policy.
