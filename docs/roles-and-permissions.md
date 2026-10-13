# Roles and permission matrix

Enforced in three places; the database is authoritative:

1. **UI**: hides what a role cannot use (convenience only).
2. **Server**: `requireAdminAccess()` / `requireRole()` in every protected page
   and data function (`src/server/auth/admin-access.ts`).
3. **Database**: Row Level Security, column grants and guard triggers
   (`supabase/migrations/20261011090300_security_rls.sql`).

A user's role is read from `public.profiles` on every request, never from
token metadata. A signed-in user with no active profile has no access.
Role changes go only through `public.set_staff_role()` (super admin, not on
self) or trusted server code with the service-role key; there is no column
grant for `role` or `is_active`.

Legend: C create, R read, U update, **own** = assigned to or created by the
user, **assigned** = lead/deal assigned to the user. No role can DELETE
business records.

| Resource | Super admin | Manager | Agent | Marketing | Finance | Public |
|---|---|---|---|---|---|---|
| Staff profiles | R all; change role via RPC | R all | R own; U own name, phone, language | R own; U own | R own; U own | none |
| Landlords (contact, notes) | CRU | CRU | CRU **linked** only; cannot set verification | none | none | none |
| Properties | CRU | CRU | R published + own; CU own; cannot publish, archive, re-assign or re-code | R all (no edit) | R all | **view**: published and available only |
| Translations, media | CRUD | CRUD | R published + own; CRUD own | CRUD (non-archived) | R | **view**: published only |
| Landlord authorisation (`property_ownership`) | CRU | CRU | R own; C as `pending` | none | none | none |
| Leads | CRU | CRU | CRU **assigned**; cannot re-assign | none | none | none |
| Lead activities | CR | CR | CR on assigned leads, as themselves | none | none | none |
| Viewings | CRU | CRU | CRU own, C only for assigned leads | none | none | none |
| Tasks | CRU all | CRU all | CRU assigned/created | CRU assigned/created | CRU assigned/created | none |
| Rental deals | CRU | CRU | R own; C on assigned lead; U own until `lease_signed` | none | R | none |
| Commissions | CRU | CRU, **except** recording payments | R own deals | none | CRU incl. payments | none |
| Storage `property-media` | all | all | read published + own; write own property folder | write (non-archived) | read | read published only |
| Storage `private-docs` | CR | CR | none | none | none | none |
| Notifications, preferences | R/mark read own | R/mark read own | R/mark read own | own | own | none |
| Automation rules, runs, events | R, U rules, run, retry | R, U rules, run, retry | none | none | none | none |
| Generated documents (`generated/<id>/…`) | CR per type | CR per type | CR own types, rows visible to them | listing sheets | statements and deal documents | none |

## CRM screens (Step 4)

| Screen / action | Super admin | Manager | Agent | Marketing | Finance |
|---|---|---|---|---|---|
| Dashboard lead cards and lists | all leads | all leads | own leads | no data | no data |
| Dashboard deal cards | all | all | own deals | none | all |
| Commission earned / outstanding | yes | yes | not shown | none | yes |
| Agent performance table | all agents | all agents | own row | none | none |
| Lead list and detail | all | all | assigned only | 404 | 404 |
| Edit details, requirements, follow-up, status, notes, viewings | yes | yes | assigned only | no | no |
| Assign / reassign | yes | yes | no (read-only) | no | no |

Enforcement: pages call `requireRole(...)`; Server Actions repeat the role
check; the database enforces ownership (RLS) and writes the status and
assignment history itself (trigger), so history cannot be skipped by a client.

## Finance (Step 5)

The full finance matrix (deals, receivables, ledger, payouts, expenses,
reports, CSV) is in [finance.md](finance.md#6-permissions). Summary: finance
records money and payouts; managers and super admins approve payouts and
expenses (never their own, except a sole super admin); agents see their own
deals and payouts; marketing sees nothing.

## Where this differs from the blueprint matrix (section 3.2)

| Blueprint | Now | Follow-up |
|---|---|---|
| Manager scoped to *team* | Whole agency | Add `team_id` when a second team exists |
| Finance: R landlord name/payment details, R lead name on deal | No access to landlords/leads | Add restricted finance views |
| Marketing: aggregated lead counts | No lead access | Add aggregate views with the reporting module |
| Agent: "no delete after 24 h" | No delete at all | Add archive requests with the CRM module |
| Agent R landlord documents (own) | `private-docs` is admin/manager only | Per-record rules with the `documents` table |
| Commission override approval limits | Manager may edit terms; no limit | Approval workflow in Phase 6 |
| Audit log | Not present | Planned with the audit-trigger task |

## Authentication rules

- No public sign-up: disabled in Supabase (`[auth] enable_signup = false`), and
  a user without a `profiles` row has no access even if one were created.
- Staff are invited by a super admin (`inviteStaffMember`) or created in the
  Supabase dashboard; the invitee sets their password from a one-time link.
- Passwords: minimum 12 characters (config and `MIN_PASSWORD_LENGTH`).
- Sign-out ends the Supabase session and clears the cookies.
- Sensitive-operation re-authentication and MFA (blueprint 11) are not part of
  this step.
