# 0005: Rental deals, commission tracking and financial management (Step 5)

- Status: accepted
- Date: 2026-10-14
- Scope: blueprint Phase 6 (commission and reporting), tasks T-038 to T-042

## Decisions

### Reuse and extend existing tables
`rental_deals` and `commissions` already existed. Deals gained terms, the
stored commission arrangement and agent-share arrangement; `commissions`
became the *receivable* (what is owed per payer) and gained invoice and cache
columns. New tables: `commission_transactions` (ledger), `agent_payouts`,
`expenses`, `deal_documents`, `finance_settings`, `financial_audit_log`.

### Money moves only through the ledger
Payments, reversals, adjustments and write-offs are append-only rows. The
balance columns on `commissions` are caches written by a trigger and are not
writable through the API (column privileges). A trigger locks the receivable
row, so concurrent payments are applied one at a time against the real balance
(tested with two real connections). Overpayment is refused.

### The database owns the rules
Commission arithmetic, status transitions, closed-won completeness, payout
eligibility, approval permissions, four-eyes and frozen terms are enforced by
triggers and constraints; TypeScript mirrors only the arithmetic (for the live
preview) and the transition list (to show the right options). Error messages
from the database are mapped to translated codes.

### Statuses
`closed_won`, `closed_lost`, `agreement_pending`, `cancelled`, `lease_expired`
were added. Old values stay in the enum but existing rows were migrated.
Commission progress is no longer encoded in the deal status.

### Earned and eligible are configurable
Two rules live in `finance_settings` and default to the simplest reading
(earned at closed-won; payable in proportion to collection). The agency must
confirm them (docs/finance.md section 7).

### Private documents
Agreements, receipts and expense receipts go to the private `private-docs`
bucket under `deals/<deal_id>/` and `expenses/<expense_id>/`. Storage policies
allow only roles that may read that deal / the expenses; links are signed for
five minutes.

### Reports are SQL, under the caller's RLS
`finance_report()` is SECURITY INVOKER and returns per-currency figures plus
breakdowns; CSV exports read through the user's own session with explicit
column whitelists per role, and every export is audit-logged.

### Upload size
Files are limited to 4 MB because uploads pass through Server Actions on a
host with a 4.5 MB request limit.

## Consequences
- The tests that used legacy deal values and manual commission updates were
  rewritten around the ledger.
- Dashboard "commission earned" now means earned (not cash received); cash is
  "collected" on the finance page.
- Direct-to-storage uploads, batch payouts, invoices, tax and FX are future
  work.
