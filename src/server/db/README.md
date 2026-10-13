# Database layer

- `admin-client.ts`: service-role Supabase client (bypasses RLS). `server-only`;
  use only from trusted server code after authorising the caller.
- Browser and server clients (RLS applies): `src/lib/supabase/`.
- Schema, policies, views and seeds: `/supabase` (see `docs/database.md`).
- Typed rows: `src/types/database.ts`, generated with `npm run db:types`.

Rules carried over from the blueprint:

- Money is stored as integer minor units plus an ISO currency code.
- Public pages read only from the `public_*` views, never the base tables.
- Business records are soft-archived; financial and activity history is
  append-only or restricted from deletion.
- Every data function calls `requireAdminAccess()` / `requireRole()` before
  querying; RLS is the second, authoritative line.
