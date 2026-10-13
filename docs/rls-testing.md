# Testing Row Level Security and authentication

## Database security tests

`tests/rls/` runs real SQL against a **local** Supabase database. Each test
opens a transaction, loads fixture rows, switches to a role (`anon`, or
`authenticated` with a user id in the JWT claims, exactly as PostgREST does)
and asserts what that identity can read, write or is refused; then rolls
everything back. Nothing persists.

```bash
npx supabase start       # once
npm run test:rls
```

`npm test` and `npm run check` also include these files but **skip** them when
no database is configured, and Vitest reports them as skipped (not passed).

To point at another local database use
`RLS_TEST_DATABASE_URL=postgresql://... npx vitest run tests/rls`. The harness
refuses any host other than localhost/127.0.0.1, because the tests insert
(and roll back) data.

What is covered (109 tests across `access.test.ts`, `crm.test.ts`, `finance.test.ts`, `automation.test.ts` and `public-queries.test.ts`):

- RLS is enabled on every table in `public`.
- Anonymous visitors: no access to any base table; cannot insert leads or call
  `set_staff_role`; see only published + available + non-archived listings; the
  public views expose no private column; translations, media and storage files
  follow publication; private documents are unreachable.
- Signed-in users with no profile, and deactivated staff: no data, cannot insert.
- Cross-agent isolation: leads, activities, landlords, ownership, draft
  properties, deals, commissions, profiles; cannot steal, hand over, publish,
  re-assign or approve; cannot forge an activity author.
- `landlord_submissions`: readable by super admin and manager only; cannot be
  written through the public API.
- Public queries (`public-queries.test.ts`, needs the development seed): search,
  filters, sorting, pagination, translation fallback, detail visibility, similar
  properties, and that landlords, leads and base tables are unreachable.
- CRM (`crm.test.ts`): stage changes and assignments are written to
  `lead_activities` by the database with the signed-in staff member; agents
  cannot reassign or edit history; the new statuses are accepted; `staff_names`
  exposes only id, name and role; `crm_lead_list` follows each caller's RLS;
  dashboard aggregates count only visible rows and never mix currencies;
  agent performance lists every agent for a manager but only self for an agent.
- Finance (`finance.test.ts`): all four commission methods incl. half-up
  rounding and lease months; deal status transitions, closed-won completeness,
  duplicate and overlapping deals, frozen terms; the ledger (partial payments,
  overpayment, reversal, adjustment, write-off, append-only, currency forced,
  who may write); agent payouts (eligibility, partial payouts, approval
  permissions, four-eyes, paid details); expenses (approval, separation of
  duties, edits after decision); audit trail; report totals reconciled against
  the ledger per currency; a real two-connection concurrency test.
- Automation and notifications (`automation.test.ts`): notifications are
  recipient-only and can only be marked read; preferences are per user and
  respected; every rule creates its task/notification once and never again on
  re-run (idempotency keys); disabled rules do nothing and keep history;
  settings are validated by the database; only managers can change rules, run
  automation or retry; a failed item is recorded with a safe error code and
  retried without duplicates; overlapping runs are recorded as skipped; lease
  expiry reminders fire once per configured period; generated documents are
  private per role, numbered by the database, and cannot be deleted.
- Role behaviour for manager, marketing, finance and super admin; role change
  rules; immediate loss of access on deactivation; append-only history; no
  hard deletes; data-model constraints.

When you add a table or policy, add a test for each role. A table without a
policy is invisible (RLS default deny), but a test proves it.

Quick self-check that the suite bites: disable RLS on one table in the local
database (`alter table public.leads disable row level security;`), run
`npm run test:rls` and expect failures, then re-enable it.

## Application tests

| Command | Covers |
|---|---|
| `npm run check` | ESLint, `tsc`, unit tests: env validation, access decision (`resolveAdminAccess`), redirect sanitising, role list, i18n key parity |
| `npm run build` | Production build and type-check |

## Manual / end-to-end sign-in check

With the local stack and `npm run dev` running and the two `NEXT_PUBLIC_SUPABASE_*`
variables set:

1. Open `/en/dashboard` signed out: you land on `/en/login?next=...`.
2. Enter a wrong password: an inline error appears, no session is created.
3. Sign in as `dev-agent1@camrent.test`: you land in the CRM and your name and
   role show in the header.
4. Press **Sign out**: you return to login and the dashboard is protected again.
5. **Forgot password** for any address always shows the same confirmation. For a
   real account the email appears in http://127.0.0.1:55324; its link sets a new
   password and signs you in.
6. Create a user in Studio without a profile and sign in: you are refused with
   "does not have access".
