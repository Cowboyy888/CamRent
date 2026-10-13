# Deals, commissions and finance (Step 5)

This document defines every money figure in the CRM, who may do what, and the
assumptions the agency must confirm. **Nothing here is legal or tax advice.**
No commission rate, tax rate or legal rule is built in; every rate is entered
by the agency and stored on the deal.

## 1. Principles

- **Integer minor units + currency.** Every amount is a whole number of minor
  units (`NUMERIC(18,0)`, columns named `*_minor`) with a currency (USD or KHR)
  next to it. No floating point is used for money.
- **No mixing of currencies.** Totals are shown per currency. There is no
  exchange-rate table, so no figure ever converts or adds USD and KHR.
- **Append-only ledger.** Collections, reversals, write-offs and adjustments
  are rows in `commission_transactions`. They cannot be edited or deleted
  (even by a super admin; a trigger refuses). The balances stored on
  `commissions` are caches rebuilt from the ledger after each entry.
- **Rent and deposits are not revenue.** Monthly rent, security deposit and
  advance rent are recorded on the deal for the agreement, but are never part of
  any agency revenue figure. Agency revenue is **commission collected** only.
- **Audit trail.** Changes to deals, receivables, ledger entries, payouts,
  expenses and finance rules are written by database triggers to
  `financial_audit_log` with user, role, time and the stated reason. Exports
  are logged too. The log is append-only.

## 2. Commission arrangements (stored per deal)

| Method | Expected agency commission |
|---|---|
| Fixed amount | the amount entered |
| Percentage of one month's rent | `monthly rent x rate / 100` |
| Percentage of total contracted rent | `monthly rent x lease months x rate / 100` |
| Custom agreed amount | the amount entered |

- Percentages are `NUMERIC(9,4)` percent values (50 = 50 %), 0 to 100.
- Results are rounded **half up** to the nearest minor unit (500.5 -> 501).
- **Lease months** are whole months from the start date through the end date
  inclusive (1 Jan to 31 Dec = 12). A lease shorter than one month has no whole
  months, so "percentage of total rent" cannot be computed (the deal cannot be
  closed until the dates are fixed).
- The arrangement, rate and the computed expected amount are saved **on the
  deal**. Changing the agency defaults never changes an existing deal, and a
  closed deal's terms are frozen by the database.
- The same arithmetic exists in the database (authority) and in TypeScript
  (for the live preview); tests keep them in step.

### Agent share

Per deal: none, a percentage of the agency commission, or a fixed amount. It
cannot exceed the agency commission. The agent's share is computed separately
from the agency's commission and is never part of agency revenue figures
(it is a payout, see below).

## 3. Definitions

| Figure | Definition |
|---|---|
| **Expected** | Commission agreed by the deal's arrangement, for deals whose reference date (closing date, or creation date while open) is in the period, excluding lost and cancelled deals |
| **Earned** | Under the rule *"when the deal is closed as won"* (default): the expected commission of deals closed as won in the period. Under *"as it is collected"*: the amount collected in the period |
| **Invoiced** | Receivables with an "invoiced on" date |
| **Collected** | Payments recorded in the period minus reversals (cash actually received) |
| **Outstanding** | Amount due (incl. adjustments) - collected - written off, over all receivables, as of today |
| **Overdue** | The part of outstanding whose due date has passed |
| **Written off** | Amounts written off with a reason (no cash) |
| **Agent share (expected)** | The agent's portion of the expected commission |
| **Eligible for payout** | Rule *"in proportion to what is collected"* (default): `share x min(collected, expected) / expected`. Rule *"in full once earned"*: the whole share once the deal is closed |
| **Payout paid** | Payouts recorded as paid (date, method, reference) |
| **Payout outstanding** | Eligible - paid (requested or approved but unpaid payouts are shown separately) |
| **Approved expenses** | Expenses approved, dated in the period |
| **Cash in** | = commission collected |
| **Cash out** | Agent payouts paid in the period + approved expenses with a paid date in the period |
| **Net cashflow** | Cash in - cash out |

Items that are **not** cash: unpaid receivables (outstanding), unapproved
expenses, approved-but-unpaid expenses, requested/approved payouts that are not
yet paid, deposits and advance rent.

## 4. Collection status (derived, never typed)

| Status | When |
|---|---|
| Written off | outstanding is 0 and an amount was written off |
| Paid | outstanding is 0 |
| Overdue | outstanding > 0 and the due date is before today |
| Partially paid | something collected, not overdue |
| Due | nothing collected and the due date is today |
| Not due | nothing collected and no due date, or a future one |

## 5. Deal statuses

Negotiation, Reserved, Agreement pending, Closed won, Closed lost, Cancelled,
Lease expired. Allowed moves are enforced in the database:

```
Negotiation        -> Reserved, Agreement pending, Closed lost, Cancelled
Reserved           -> Negotiation, Agreement pending, Closed lost, Cancelled
Agreement pending  -> Reserved, Closed won, Closed lost, Cancelled
Closed won         -> Lease expired, Cancelled
Closed lost / Cancelled -> Negotiation (re-open)
```

- **Closed won** needs: monthly rent, lease start and end, landlord, closing
  date, agreement reference, a commission arrangement that yields an amount.
  The database rejects the change otherwise; the deal page lists what is
  missing. Closing never assumes that rent, deposit or commission was paid.
- Closed lost and Cancelled need a reason.
- Agents may take a deal up to Agreement pending; managers and super admins
  close, expire and cancel.
- Closing marks the customer's lead as won (logged against the user).
- One live deal per customer and property; two closed-won leases on the same
  property cannot overlap in time.

Earlier statuses (`lease_signed`, `commission_invoiced`,
`commission_collected`, `lost`) were migrated to Closed won / Closed lost.

## 6. Permissions

| Action | Super admin | Manager | Finance | Agent | Marketing |
|---|---|---|---|---|---|
| View deals | all | all | all | own | no |
| Create / edit deals, change status | yes | yes | no | own, up to Agreement pending | no |
| View receivables and ledger | yes | yes | yes | own deals | no |
| Raise a receivable | yes | yes | yes | no | no |
| Record payment, reversal, adjustment, write-off | yes | no | yes | no | no |
| Request an agent payout | yes | yes | yes | no | no |
| Approve / reject a payout | yes | yes (not their own) | no | no | no |
| Record a payout as paid / reverse it | yes | no | yes | no | no |
| View payouts | all | all | all | own | no |
| Create expenses | yes | yes | yes | no | no |
| Approve / reject expenses | yes | yes (not their own) | no | no | no |
| Reports, audit log | yes | yes | yes | no | no |
| Change agency finance rules | yes | no | no | no | no |
| CSV: receivables / payments | yes / yes | yes / no | yes / yes | no | no |
| CSV: payouts / deals | yes | yes | yes | own rows (deals without agency commission) | no |
| CSV: expenses | yes | yes | yes | no | no |

"Not their own": a manager cannot approve a payout they requested or an
expense they created. A sole **super admin** may, so a one-person agency is not
blocked (their action is still logged). Rules are enforced in three places:
the page and Server Action, the database triggers, and Row Level Security with
column privileges (money columns cannot be written through the Data API at
all).

## 7. Configurable assumptions to confirm with the agency

1. When commission is **earned** (default: when the deal is closed as won).
2. When an agent's share is **payable** (default: in proportion to collection).
3. Whether a **manager** should be able to record collections (default: no).
4. Whether **finance** may approve expenses (default: no, to separate duties).
5. Whether deposits or advance rent are ever agency income. The system treats
   them as not agency income; record any agency fee as a commission receivable.
6. Rounding: half up to the minor unit.

## 8. Known limitations

- No exchange rates: multi-currency totals are intentionally not combined.
- No tax/VAT handling and no invoices/PDF generation; "invoiced on" is a date.
- Agent payouts are per deal; there is no batch payout run or withholding.
- Uploaded files are limited to 4 MB (PDF, JPG, PNG) because they pass through
  a Server Action on a host with a 4.5 MB request limit.
- A cancelled closed deal keeps its collected cash; any clawback is a manual
  reversal/adjustment entry.
- Property availability is not changed automatically when a deal closes.
- Expense approval is single-step and there are no budgets or recurring costs.
