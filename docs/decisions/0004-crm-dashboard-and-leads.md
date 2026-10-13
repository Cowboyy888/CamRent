# 0004: CRM dashboard, lead management, assignment and follow-ups (Step 4)

- Status: accepted
- Date: 2026-10-13
- Scope: blueprint Phase 5 (CRM and agent workflows), tasks T-029 (partly), T-030 to T-034

## Decisions

### The CRM moves to `/{locale}/dashboard`
The brief asks for `/[locale]/dashboard`, so the Step 1-3 `/admin` area was
removed and `/admin` redirects (308) to the dashboard in the visitor's
language. To keep the public header and footer off the CRM, `[locale]/layout`
now only renders `<html>`/`<body>`; the public chrome moved to a `(site)` route
group and the CRM chrome to `(crm)/dashboard/layout`. URLs did not change.
The CRM is localised (en, km, zh) because every user-facing string must be in
the dictionaries; Khmer and Chinese are drafts that need native review.

### No duplicate tables
Existing tables are reused: `leads`, `lead_activities`, `viewing_appointments`,
`rental_deals`, `commissions`, `profiles`. Additions are columns only
(requirements on `leads`; `from_stage`, `to_stage`, `from_agent_id`,
`to_agent_id` on `lead_activities`) and read-only views.

### Statuses
Pipeline: new inquiry, contacted, viewing scheduled, negotiation, reserved,
closed won (`won`). Side statuses: lost, unresponsive, on hold, cancelled.
`qualified` and `viewed` remain in the enum for old rows but are not offered.
"Active" means not won, lost, cancelled, unresponsive or on hold (the same list
lives in TypeScript and in SQL). Lost requires a reason (database constraint).

### History is written by the database
An AFTER trigger on `leads` inserts a `lead_activities` row for every stage or
assignment change, attributed to `auth.uid()`. Clients cannot skip or forge it,
and `lead_activities` stays append-only. Updates without a user (service role,
migrations) are not attributed and are not logged.

### Dashboard figures: SQL functions with the caller's RLS
`crm_dashboard_summary()` and `crm_agent_performance()` are SECURITY INVOKER,
so an agent's numbers cover only their own leads, and the app cannot
accidentally show agency-wide totals to the wrong role. Commission totals are
per currency and never summed across currencies. "Today" and "this month" are
Phnom Penh time (UTC+7).

### Staff names
`staff_names` (id, full name, role of active staff) lets an agent see who
assigned or noted something without exposing `profiles` (phone numbers).

### Forms keep what was typed
React 19 clears form fields after an action, even on a validation error. CRM
and public forms use `useActionForm`, which intercepts submit and dispatches the
action itself, so fields survive an error. `action=` is still set, so forms
work without JavaScript.

## Known limits
- Staff cannot yet create a lead by hand (website inquiries arrive
  unassigned); no bulk assignment; no automatic round-robin.
- Follow-ups are one date per lead; there is no task list or reminder
  notification yet (the `tasks` table is unused by the UI).
- Deals and commissions are displayed on the dashboard but cannot be created
  in the UI yet, so those cards read zero until that module exists.
- Viewing status changes (completed, cancelled, no-show) have no screen yet.
- Marketing and finance have no lead access; finance sees deal and commission
  figures only.
