# 0002: Supabase database and authentication (Step 2)

- Status: accepted
- Date: 2026-10-11
- Scope: blueprint Phase 2, backlog tasks T-002, T-005 to T-011 (core), T-014 (auth part)

## Decisions

### Session handling: `@supabase/ssr`, verified with `getClaims()`

- `src/proxy.ts` refreshes the session cookie for `/admin/*` (Server Components
  cannot write cookies) and redirects requests without a verified session.
- Server code creates one client per request (`src/lib/supabase/server.ts`).
- Identity is established with `auth.getClaims()` (JWT signature verified),
  never `getSession()` on the raw cookie.
- The proxy is an optimistic check only. Pages and Server Actions call
  `requireAdminAccess()` / `requireRole()`, and RLS is the authoritative layer.

### Roles from the database, not the token

`private.auth_role()` reads `public.profiles` (SECURITY DEFINER, requires
`is_active`). `user_metadata` is user-editable and is never consulted. Role
changes use `public.set_staff_role()`; `role` and `is_active` are not
updatable through the Data API.

### Staff-only accounts

Public sign-up is off in Supabase and a user without a profile has no access
(defence in depth). Staff are invited with `inviteStaffMember()` (service-role
key, server only, caller verified as super admin first).

### Email links use the token-hash flow

Invitation and reset emails link to `/auth/confirm?token_hash=...&type=...`
(templates in `supabase/templates`). The Route Handler verifies the one-time
token server-side and starts the session. Only `invite` and `recovery` are
accepted. This works for invitations (which cannot use PKCE) and does not
depend on the browser that requested the reset.

### Public data through views; private storage

`anon` has no table privileges; three owner-run views expose a fixed column
set of published listings. Buckets are private and storage policies follow the
same publication rule, so files of unpublished listings are not reachable even
with a known path.

### Money as NUMERIC integer minor units

The brief asked for NUMERIC; the project rules require integer minor units.
Both hold: `NUMERIC(18,0)` columns named `*_minor`.

### Enums over CHECK lists

Postgres enums give generated TypeScript unions. Adding a value is
`ALTER TYPE ... ADD VALUE`; removing one needs a migration, which is rare for
these domains.

### Removed: admin preview mode

`CAMRENT_ADMIN_PREVIEW` was a Step 1 stand-in for missing authentication. It
bypassed the guard in development, which is a liability once real data exists,
so it was removed together with `/admin/login` (staff sign in at
`/{locale}/login`).

## Consequences and known limits

- The Step 1 `owner` role is now `super_admin` (the brief's name).
- Manager scope is agency-wide until teams exist; finance and marketing have no
  lead/landlord access until restricted views are added (see
  `docs/roles-and-permissions.md`).
- No `audit_log` yet; role changes are not recorded beyond `updated_at`.
- Next.js 16.4.0 logs an internal invariant when a page that reads cookies is
  re-rendered inside a **no-JavaScript** form POST in development mode. The
  JavaScript path and production builds were tested and are unaffected.
- Local verification used Supabase CLI 2.120 images; the hosted project must be
  created and the migrations applied by the owner (docs/supabase-setup.md).
