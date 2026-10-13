# Automation, tasks and notifications

Step 6. Everything here runs on the server (in the database and, optionally,
through one HTTP route). Nothing depends on a browser being open, and **no rule
ever contacts a customer**: rules create internal tasks and in-app
notifications for staff only.

## Rules

| Code | What it does | Settings (defaults) |
|---|---|---|
| `new_inquiry_task` | A task for the assigned agent to contact a new inquiry | `due_hours` 2, `lookback_days` 7 |
| `unassigned_inquiry_notify` | Notifies managers when an inquiry still has no agent | `after_minutes` 30, `lookback_days` 7 |
| `no_contact_sla` | Flags the lead (`leads.sla_breached_at`) and notifies agent and managers when no contact is recorded in time | `sla_hours` 24, `lookback_days` 14 |
| `viewing_confirmation_task` | A task to confirm each scheduled viewing | `hours_before` 24, `lookback_days` 14 |
| `viewing_completed_prompt` | A task to record the result once the viewing time has passed | `grace_minutes` 60, `lookback_days` 14 |
| `negotiation_followup` | A follow-up task every N days while a deal is in negotiation | `interval_days` 3, `due_hours` 24 |
| `overdue_task_reminder` | Reminds the assignee of an overdue task (repeats) | `repeat_hours` 24, `lookback_days` 30 |
| `upcoming_viewing_reminder` | Notifies the agent before a viewing | `hours_before` 24 |
| `lease_expiry_renewal` | A renewal task and notification at each period before a signed lease ends | `reminder_days` [90, 30] |

Settings are stored in `automation_rules.config` and validated by a database
trigger (ranges and unknown keys are rejected, so no client can store nonsense).
A disabled rule does nothing; its history is kept.

## Idempotency

- `automation_events.idempotency_key` is unique. `claim_event()` inserts the key
  or, only when the previous attempt **failed**, takes it over for a retry.
- Automatic tasks carry `tasks.automation_key` (unique partial index).
- Notifications are unique on `(recipient_id, dedupe_key)`.
- Each candidate runs in its own subtransaction: one bad record is recorded as a
  failed event (`SQLSTATE:constraint`, never customer data) and the run goes on.
- A run that overlaps another is recorded as `skipped`.

## Scheduling

Two interchangeable entry points call the same function
(`private.run_automation`):

1. **pg_cron** (default): the migration schedules `run_automation_scheduled()`
   every 10 minutes. Verified locally.
2. **HTTP**: `GET /api/cron/automation` with `Authorization: Bearer $CRON_SECRET`
   (for example a Vercel Cron entry). The route is disabled while `CRON_SECRET`
   is unset or shorter than 16 characters, compares in constant time and returns
   only the run id, status and counts.

Using both is safe. Managers can also press **Run now** in
`/{locale}/dashboard/settings/automation`, and **Retry** a failed item (same
key, so nothing is duplicated).

On hosted Supabase make sure the `pg_cron` extension is enabled for the project;
otherwise use the HTTP route.

## Notifications

Types: lead assigned / reassigned / unassigned, SLA breached, viewing scheduled /
upcoming / rescheduled, task assigned / overdue, payout and commission status,
lease expiring. They are created by database triggers and rules, are visible
only to the recipient (RLS), and contain no customer details: the page looks the
name up through the viewer's own permissions. Users can switch types off in
their preferences.

Email and Telegram are **not** implemented: there is no existing integration to
configure safely, and notification text would need to avoid personal data.
