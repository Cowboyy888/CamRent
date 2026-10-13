"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Textarea } from "@/components/forms/form-parts";
import { useActionForm } from "@/components/forms/use-action-form";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import type { Locale } from "@/i18n/config";
import { interpolate, type Dictionary } from "@/i18n/dictionaries";
import { formatMoney } from "@/lib/format";
import {
  expectedAgentShare,
  expectedCommission,
  leaseMonths,
  minorToMajorString,
  parseMajorToMinor,
  type AgentShareMethod,
  type CommissionMethod,
} from "@/lib/finance/money";
import {
  changeDealStageAction,
  createDealAction,
  createExpenseAction,
  attachReceiptAction,
  decideExpenseAction,
  decidePayoutAction,
  raiseReceivableAction,
  recordLedgerEntryAction,
  requestPayoutAction,
  updateDealTermsAction,
  updateFinanceSettingsAction,
  updateReceivableTermsAction,
  uploadDealDocumentAction,
  type FinanceFormState,
} from "@/server/finance/actions";
import { dashboardPath } from "@/server/auth/constants";
import type { DealFieldValues } from "@/lib/finance/deal-form";

const idle: FinanceFormState = { status: "idle" };

function Feedback({ state, dict }: { state: FinanceFormState; dict: Dictionary }) {
  if (state.status === "error" && state.error) {
    return (
      <p role="alert" className="rounded-control bg-danger-50 p-3 text-sm text-danger">
        {dict.fin.errors[state.error]}
      </p>
    );
  }
  if (state.status === "success" && state.message) {
    return (
      <p role="status" className="rounded-control bg-success-50 p-3 text-sm text-success">
        {dict.fin.messages[state.message]}
      </p>
    );
  }
  return null;
}

const bad = (state: FinanceFormState, name: string) => state.fields?.includes(name) || undefined;

function Submit({ pending, label, dict }: { pending: boolean; label: string; dict: Dictionary }) {
  return (
    <Button type="submit" disabled={pending} aria-busy={pending}>
      {pending ? dict.fin.common.working : label}
    </Button>
  );
}

function Locale_({ locale }: { locale: Locale }) {
  return <input type="hidden" name="locale" value={locale} />;
}

function Opt<T extends string>({ values, labels }: { values: readonly T[]; labels: Record<T, string> }) {
  return (
    <>
      {values.map((v) => (
        <option key={v} value={v}>
          {labels[v]}
        </option>
      ))}
    </>
  );
}

/** Calls the right action and clears the form after a success, without a page reload. */
function useResettingForm(
  action: Parameters<typeof useActionForm<FinanceFormState>>[0],
) {
  const form = useActionForm<FinanceFormState>(action, idle);
  const ref = useRef<HTMLFormElement>(null);
  const { state } = form;
  useEffect(() => {
    if (state.status === "success") ref.current?.reset();
  }, [state]);
  return [form, ref] as const;
}

// ------------------------------------------------------------- deal fields

const commissionMethodList = [
  "fixed_amount",
  "percent_of_monthly_rent",
  "percent_of_total_rent",
  "custom_amount",
] as const;
const shareMethodList = ["none", "percent_of_commission", "fixed_amount"] as const;

/** Terms and arrangement fields with a live preview that uses the same maths as the database. */
function DealFields({
  dict,
  state,
  landlords,
  initial,
  prefix,
  hint,
}: {
  dict: Dictionary;
  state: FinanceFormState;
  landlords: Array<{ id: string; label: string }>;
  initial: DealFieldValues;
  prefix: string;
  hint?: ReactNode;
}) {
  const t = dict.fin.deals.form;
  const [v, setV] = useState(initial);
  const set = (key: keyof DealFieldValues) => (event: { target: { value: string } }) =>
    setV((current) => ({ ...current, [key]: event.target.value }));
  const id = (n: string) => `${prefix}-${n}`;

  const rent = parseMajorToMinor(v.rent);
  const months = v.leaseStart && v.leaseEnd ? leaseMonths(v.leaseStart, v.leaseEnd) : null;
  const method = v.commissionMethod as CommissionMethod | "";
  const percentage = method === "percent_of_monthly_rent" || method === "percent_of_total_rent";
  const expected = method
    ? expectedCommission(
        { method, rate: v.commissionRate, fixedMinor: parseMajorToMinor(v.commissionFixed) },
        rent,
        months,
      )
    : null;
  const share = expectedAgentShare(
    {
      method: v.shareMethod as AgentShareMethod,
      rate: v.shareRate,
      fixedMinor: parseMajorToMinor(v.shareFixed),
    },
    expected,
  );
  const show = (minor: number | null) =>
    minor === null ? dict.fin.common.notSet : formatMoney({ amountMinor: minor, currency: v.currency });

  return (
    <>
      {hint}
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-base font-bold">{t.termsTitle}</legend>
        <Field id={id("landlord")} label={t.landlord}>
          <Select id={id("landlord")} name="landlordId" value={v.landlordId} onChange={set("landlordId")} aria-invalid={bad(state, "landlordId")}>
            <option value="">{dict.fin.common.selectPlaceholder}</option>
            {landlords.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={id("currency")} label={dict.fin.common.currency}>
          <Select id={id("currency")} name="currency" value={v.currency} onChange={set("currency")}>
            <option value="USD">USD</option>
            <option value="KHR">KHR</option>
          </Select>
        </Field>
        <Field id={id("rent")} label={t.rent}>
          <Input id={id("rent")} name="rent" inputMode="decimal" value={v.rent} onChange={set("rent")} aria-invalid={bad(state, "rent")} />
        </Field>
        <Field id={id("agreement")} label={t.agreementRef}>
          <Input id={id("agreement")} name="agreementRef" maxLength={120} value={v.agreementRef} onChange={set("agreementRef")} />
        </Field>
        <Field id={id("start")} label={t.leaseStart}>
          <Input id={id("start")} name="leaseStart" type="date" value={v.leaseStart} onChange={set("leaseStart")} aria-invalid={bad(state, "leaseStart")} />
        </Field>
        <Field id={id("end")} label={t.leaseEnd}>
          <Input id={id("end")} name="leaseEnd" type="date" value={v.leaseEnd} onChange={set("leaseEnd")} aria-invalid={bad(state, "leaseEnd")} />
        </Field>
        <Field id={id("deposit")} label={t.deposit} hint={t.depositHint}>
          <Input id={id("deposit")} name="deposit" inputMode="decimal" value={v.deposit} onChange={set("deposit")} aria-describedby={`${id("deposit")}-hint`} />
        </Field>
        <Field id={id("advance")} label={t.advance} hint={t.advanceHint}>
          <Input id={id("advance")} name="advance" inputMode="decimal" value={v.advance} onChange={set("advance")} aria-describedby={`${id("advance")}-hint`} />
        </Field>
        <Field id={id("closing")} label={t.closingDate}>
          <Input id={id("closing")} name="closingDate" type="date" value={v.closingDate} onChange={set("closingDate")} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-base font-bold">{t.commissionTitle}</legend>
        <Field id={id("cmethod")} label={t.commissionMethod}>
          <Select id={id("cmethod")} name="commissionMethod" value={v.commissionMethod} onChange={set("commissionMethod")} aria-invalid={bad(state, "commissionMethod")}>
            <option value="">{dict.fin.common.selectPlaceholder}</option>
            <Opt values={commissionMethodList} labels={dict.fin.commissionMethods} />
          </Select>
        </Field>
        {method ? (
          percentage ? (
            <Field id={id("crate")} label={t.commissionRate}>
              <Input id={id("crate")} name="commissionRate" inputMode="decimal" value={v.commissionRate} onChange={set("commissionRate")} aria-invalid={bad(state, "commissionRate")} />
            </Field>
          ) : (
            <Field id={id("cfixed")} label={t.commissionFixed}>
              <Input id={id("cfixed")} name="commissionFixed" inputMode="decimal" value={v.commissionFixed} onChange={set("commissionFixed")} aria-invalid={bad(state, "commissionFixed")} />
            </Field>
          )
        ) : null}
        <Field id={id("smethod")} label={t.shareMethod}>
          <Select id={id("smethod")} name="shareMethod" value={v.shareMethod} onChange={set("shareMethod")}>
            <Opt values={shareMethodList} labels={dict.fin.shareMethods} />
          </Select>
        </Field>
        {v.shareMethod === "percent_of_commission" ? (
          <Field id={id("srate")} label={t.shareRate}>
            <Input id={id("srate")} name="shareRate" inputMode="decimal" value={v.shareRate} onChange={set("shareRate")} aria-invalid={bad(state, "shareRate")} />
          </Field>
        ) : null}
        {v.shareMethod === "fixed_amount" ? (
          <Field id={id("sfixed")} label={t.shareFixed}>
            <Input id={id("sfixed")} name="shareFixed" inputMode="decimal" value={v.shareFixed} onChange={set("shareFixed")} aria-invalid={bad(state, "shareFixed")} />
          </Field>
        ) : null}
      </fieldset>

      <section aria-label={t.previewTitle} className="rounded-card bg-mekong-50 p-4 text-sm">
        <h3 className="font-bold">{t.previewTitle}</h3>
        {expected === null && !method ? (
          <p className="mt-1 text-muted">{t.previewIncomplete}</p>
        ) : (
          <dl className="mt-2 grid gap-1 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted">{t.previewMonths}</dt>
              <dd className="font-semibold">
                {months === null ? dict.fin.common.notSet : interpolate(t.months, { count: months })}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t.previewExpected}</dt>
              <dd className="font-semibold tabular-nums">{show(expected)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t.previewShare}</dt>
              <dd className="font-semibold tabular-nums">{show(share)}</dd>
            </div>
          </dl>
        )}
        <p className="mt-2 text-xs text-muted">{t.historyNote}</p>
      </section>

      <Field id={id("notes")} label={t.notes}>
        <Textarea id={id("notes")} name="notes" maxLength={2000} value={v.notes} onChange={set("notes")} />
      </Field>
    </>
  );
}

// -------------------------------------------------------------- new deal

export function NewDealForm({
  locale,
  dict,
  leads,
  landlords,
  agents,
  canChooseAgent,
  initial,
  defaultsApplied,
  defaultLeadId,
}: {
  locale: Locale;
  dict: Dictionary;
  leads: Array<{ id: string; label: string }>;
  landlords: Array<{ id: string; label: string }>;
  agents: Array<{ id: string; label: string }>;
  canChooseAgent: boolean;
  initial: DealFieldValues;
  defaultsApplied: boolean;
  defaultLeadId: string;
}) {
  const { state, formAction, onSubmit, pending } = useActionForm(createDealAction, idle);
  const t = dict.fin.deals.form;

  return (
    <form action={formAction} onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <Locale_ locale={locale} />
      <Feedback state={state} dict={dict} />
      {state.status === "success" && state.id ? (
        <a
          href={dashboardPath(locale, `/deals/${state.id}`)}
          className="font-semibold text-mekong-700 hover:underline"
        >
          {dict.fin.common.view} →
        </a>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="nd-lead" label={t.lead}>
          <Select id="nd-lead" name="leadId" defaultValue={defaultLeadId} required aria-invalid={bad(state, "leadId")}>
            <option value="">{dict.fin.common.selectPlaceholder}</option>
            {leads.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="nd-property" label={t.property} hint={t.propertyHint}>
          <Input id="nd-property" name="propertyRef" maxLength={60} aria-invalid={bad(state, "propertyRef")} aria-describedby="nd-property-hint" />
        </Field>
        {canChooseAgent ? (
          <Field id="nd-agent" label={t.agent}>
            <Select id="nd-agent" name="agentId" defaultValue="" aria-invalid={bad(state, "agentId")}>
              <option value="">{dict.fin.common.selectPlaceholder}</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </div>
      <DealFields
        dict={dict}
        state={state}
        landlords={landlords}
        initial={initial}
        prefix="nd"
        hint={defaultsApplied ? <p className="text-sm text-muted">{t.defaultsApplied}</p> : null}
      />
      <div>
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? t.submitting : t.submit}
        </Button>
      </div>
    </form>
  );
}

export function DealTermsForm({
  id,
  locale,
  dict,
  landlords,
  initial,
}: {
  id: string;
  locale: Locale;
  dict: Dictionary;
  landlords: Array<{ id: string; label: string }>;
  initial: DealFieldValues;
}) {
  const { state, formAction, onSubmit, pending } = useActionForm(updateDealTermsAction, idle);
  return (
    <form action={formAction} onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <Locale_ locale={locale} />
      <input type="hidden" name="id" value={id} />
      <Feedback state={state} dict={dict} />
      <DealFields dict={dict} state={state} landlords={landlords} initial={initial} prefix="dt" />
      <div>
        <Submit pending={pending} label={dict.fin.deals.form.saveTerms} dict={dict} />
      </div>
    </form>
  );
}

// ------------------------------------------------------------ deal status

export function DealStatusForm({
  id,
  locale,
  dict,
  options,
}: {
  id: string;
  locale: Locale;
  dict: Dictionary;
  options: string[];
}) {
  const [{ state, formAction, onSubmit, pending }, ref] = useResettingForm(changeDealStageAction);
  const d = dict.fin.deals.detail;
  if (options.length === 0) return null;
  return (
    <form ref={ref} action={formAction} onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Locale_ locale={locale} />
      <input type="hidden" name="id" value={id} />
      <Feedback state={state} dict={dict} />
      <Field id="ds-stage" label={d.newStatus}>
        <Select id="ds-stage" name="stage" defaultValue={options[0]}>
          {options.map((o) => (
            <option key={o} value={o}>
              {dict.fin.dealStages[o as keyof typeof dict.fin.dealStages]}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="ds-reason" label={d.statusReason}>
        <Input id="ds-reason" name="reason" maxLength={500} aria-invalid={bad(state, "reason")} />
      </Field>
      <div>
        <Submit pending={pending} label={d.updateStatus} dict={dict} />
      </div>
    </form>
  );
}

// ----------------------------------------------------------- receivables

const todayIso = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

export function RaiseReceivableForm({
  dealId,
  locale,
  dict,
  currency,
  suggestedMinor,
}: {
  dealId: string;
  locale: Locale;
  dict: Dictionary;
  currency: "USD" | "KHR";
  suggestedMinor: number;
}) {
  const [{ state, formAction, onSubmit, pending }, ref] = useResettingForm(raiseReceivableAction);
  const d = dict.fin.deals.detail;
  return (
    <form ref={ref} action={formAction} onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Locale_ locale={locale} />
      <input type="hidden" name="dealId" value={dealId} />
      <Feedback state={state} dict={dict} />
      <p className="text-xs text-muted">{d.raiseHint}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="rr-payer" label={d.payer}>
          <Select id="rr-payer" name="payer" defaultValue="landlord">
            <Opt values={["landlord", "tenant", "other"] as const} labels={dict.fin.payers} />
          </Select>
        </Field>
        <Field id="rr-amount" label={`${d.amountDue} (${currency})`}>
          <Input id="rr-amount" name="amount" inputMode="decimal" defaultValue={minorToMajorString(suggestedMinor)} aria-invalid={bad(state, "amount")} />
        </Field>
        <Field id="rr-due" label={d.dueDate}>
          <Input id="rr-due" name="dueDate" type="date" />
        </Field>
        <Field id="rr-inv" label={d.invoicedOn}>
          <Input id="rr-inv" name="invoicedOn" type="date" />
        </Field>
      </div>
      <div>
        <Submit pending={pending} label={d.raiseSubmit} dict={dict} />
      </div>
    </form>
  );
}

export function ReceivableTermsForm({
  id,
  locale,
  dict,
  dueDate,
  invoicedOn,
  notes,
}: {
  id: string;
  locale: Locale;
  dict: Dictionary;
  dueDate: string;
  invoicedOn: string;
  notes: string;
}) {
  const { state, formAction, onSubmit, pending } = useActionForm(updateReceivableTermsAction, idle);
  const d = dict.fin.deals.detail;
  return (
    <form action={formAction} onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Locale_ locale={locale} />
      <input type="hidden" name="id" value={id} />
      <Feedback state={state} dict={dict} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="rt-due" label={d.dueDate}>
          <Input id="rt-due" name="dueDate" type="date" defaultValue={dueDate} />
        </Field>
        <Field id="rt-inv" label={d.invoicedOn}>
          <Input id="rt-inv" name="invoicedOn" type="date" defaultValue={invoicedOn} />
        </Field>
      </div>
      <Field id="rt-notes" label={dict.fin.common.notes}>
        <Textarea id="rt-notes" name="notes" defaultValue={notes} maxLength={1000} className="min-h-20" />
      </Field>
      <div>
        <Submit pending={pending} label={dict.fin.commissions.detail.saveTerms} dict={dict} />
      </div>
    </form>
  );
}

const entryTypeList = ["payment", "reversal", "write_off", "adjustment_up", "adjustment_down"] as const;
const methodList = ["cash", "bank_transfer", "aba", "wing", "other"] as const;

export function LedgerEntryForm({
  commissionId,
  locale,
  dict,
  currency,
  payments,
}: {
  commissionId: string;
  locale: Locale;
  dict: Dictionary;
  currency: "USD" | "KHR";
  payments: Array<{ id: string; label: string }>;
}) {
  const [{ state, formAction, onSubmit, pending }, ref] = useResettingForm(recordLedgerEntryAction);
  const [type, setType] = useState<(typeof entryTypeList)[number]>("payment");
  const d = dict.fin.commissions.detail;
  return (
    <form ref={ref} action={formAction} onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Locale_ locale={locale} />
      <input type="hidden" name="commissionId" value={commissionId} />
      <Feedback state={state} dict={dict} />
      <p className="text-xs text-muted">{d.recordHint}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="le-type" label={d.entryType}>
          <Select id="le-type" name="entryType" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <Opt values={entryTypeList} labels={dict.fin.entryTypes} />
          </Select>
        </Field>
        <Field id="le-amount" label={`${dict.fin.common.amount} (${currency})`}>
          <Input id="le-amount" name="amount" inputMode="decimal" aria-invalid={bad(state, "amount")} />
        </Field>
        <Field id="le-date" label={d.occurredOn}>
          <Input id="le-date" name="occurredOn" type="date" defaultValue={todayIso()} max={todayIso()} aria-invalid={bad(state, "occurredOn")} />
        </Field>
        {type === "payment" ? (
          <>
            <Field id="le-method" label={dict.fin.common.method}>
              <Select id="le-method" name="method" defaultValue="cash" aria-invalid={bad(state, "method")}>
                <Opt values={methodList} labels={dict.fin.paymentMethods} />
              </Select>
            </Field>
            <Field id="le-ref" label={dict.fin.common.reference}>
              <Input id="le-ref" name="reference" maxLength={120} />
            </Field>
          </>
        ) : null}
        {type === "reversal" ? (
          <Field id="le-rev" label={d.reverses}>
            <Select id="le-rev" name="reversesId" defaultValue="" aria-invalid={bad(state, "reversesId")}>
              <option value="">{d.reversesNone}</option>
              {payments.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </div>
      {type !== "payment" ? (
        <Field id="le-reason" label={d.reasonLabel}>
          <Input id="le-reason" name="reason" maxLength={500} aria-invalid={bad(state, "reason")} />
        </Field>
      ) : null}
      <div>
        <Submit pending={pending} label={d.recordSubmit} dict={dict} />
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ payouts

export function RequestPayoutForm({
  dealId,
  locale,
  dict,
  currency,
  eligibleMinor,
}: {
  dealId: string;
  locale: Locale;
  dict: Dictionary;
  currency: "USD" | "KHR";
  eligibleMinor: number;
}) {
  const [{ state, formAction, onSubmit, pending }, ref] = useResettingForm(requestPayoutAction);
  const d = dict.fin.deals.detail;
  return (
    <form ref={ref} action={formAction} onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Locale_ locale={locale} />
      <input type="hidden" name="dealId" value={dealId} />
      <Feedback state={state} dict={dict} />
      <p className="text-xs text-muted">{d.requestHint}</p>
      <Field id="rp-amount" label={`${dict.fin.common.amount} (${currency})`}>
        <Input id="rp-amount" name="amount" inputMode="decimal" defaultValue={minorToMajorString(eligibleMinor)} aria-invalid={bad(state, "amount")} />
      </Field>
      <div>
        <Submit pending={pending} label={d.requestSubmit} dict={dict} />
      </div>
    </form>
  );
}

/** Approve / reject / cancel / pay / reverse a payout, with the fields each needs. */
export function PayoutActions({
  id,
  status,
  locale,
  dict,
  allowed,
}: {
  id: string;
  status: string;
  locale: Locale;
  dict: Dictionary;
  allowed: { approve: boolean; pay: boolean; cancel: boolean };
}) {
  const [{ state, formAction, onSubmit, pending }, ref] = useResettingForm(decidePayoutAction);
  const a = dict.fin.payouts.actions;
  const choices: Array<{ value: string; label: string }> = [];
  if (status === "pending_approval") {
    if (allowed.approve) choices.push({ value: "approve", label: a.approve }, { value: "reject", label: a.reject });
    if (allowed.cancel) choices.push({ value: "cancel", label: a.cancel });
  }
  if (status === "approved") {
    if (allowed.pay) choices.push({ value: "pay", label: a.pay });
    if (allowed.approve) choices.push({ value: "cancel", label: a.cancel });
  }
  if (status === "paid" && allowed.pay) choices.push({ value: "reverse", label: a.reverse });
  const [decision, setDecision] = useState(choices[0]?.value ?? "");
  if (choices.length === 0) return null;

  return (
    <form ref={ref} action={formAction} onSubmit={onSubmit} className="flex flex-col gap-2" noValidate>
      <Locale_ locale={locale} />
      <input type="hidden" name="id" value={id} />
      <Feedback state={state} dict={dict} />
      <Select
        aria-label={dict.fin.common.status}
        name="decision"
        value={decision}
        onChange={(e) => setDecision(e.target.value)}
      >
        {choices.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </Select>
      {decision === "pay" ? (
        <>
          <Input aria-label={a.paidOn} name="paidOn" type="date" defaultValue={todayIso()} max={todayIso()} aria-invalid={bad(state, "paidOn")} />
          <Select aria-label={dict.fin.common.method} name="method" defaultValue="bank_transfer" aria-invalid={bad(state, "method")}>
            <Opt values={methodList} labels={dict.fin.paymentMethods} />
          </Select>
          <Input aria-label={dict.fin.common.reference} placeholder={dict.fin.common.reference} name="reference" maxLength={120} aria-invalid={bad(state, "reference")} />
        </>
      ) : null}
      {decision === "reject" || decision === "cancel" || decision === "reverse" ? (
        <Input aria-label={a.reasonLabel} placeholder={a.reasonLabel} name="reason" maxLength={500} aria-invalid={bad(state, "reason")} />
      ) : null}
      <Button type="submit" size="sm" disabled={pending} aria-busy={pending}>
        {pending ? dict.fin.common.working : a.confirm}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------- expenses

const expenseCategories = [
  "advertising",
  "transportation",
  "office_rent",
  "staff_costs",
  "marketing_materials",
  "utilities",
  "other",
] as const;

export function ExpenseForm({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const [{ state, formAction, onSubmit, pending }, ref] = useResettingForm(createExpenseAction);
  const f = dict.fin.expenses.form;
  return (
    <form ref={ref} action={formAction} onSubmit={onSubmit} className="flex flex-col gap-4" noValidate encType="multipart/form-data">
      <Locale_ locale={locale} />
      <Feedback state={state} dict={dict} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field id="ex-date" label={f.date}>
          <Input id="ex-date" name="date" type="date" defaultValue={todayIso()} max={todayIso()} aria-invalid={bad(state, "date")} />
        </Field>
        <Field id="ex-cat" label={f.category}>
          <Select id="ex-cat" name="category" defaultValue="other">
            <Opt values={expenseCategories} labels={dict.fin.expenseCategories} />
          </Select>
        </Field>
        <Field id="ex-vendor" label={f.vendor}>
          <Input id="ex-vendor" name="vendor" maxLength={200} />
        </Field>
        <Field id="ex-amount" label={f.amount}>
          <Input id="ex-amount" name="amount" inputMode="decimal" aria-invalid={bad(state, "amount")} />
        </Field>
        <Field id="ex-cur" label={f.currency}>
          <Select id="ex-cur" name="currency" defaultValue="USD">
            <option value="USD">USD</option>
            <option value="KHR">KHR</option>
          </Select>
        </Field>
        <Field id="ex-method" label={f.method}>
          <Select id="ex-method" name="method" defaultValue="">
            <option value="">{dict.fin.common.notSet}</option>
            <Opt values={methodList} labels={dict.fin.paymentMethods} />
          </Select>
        </Field>
        <Field id="ex-desc" label={f.description} className="sm:col-span-2">
          <Input id="ex-desc" name="description" maxLength={500} aria-invalid={bad(state, "description")} />
        </Field>
        <Field id="ex-receipt" label={f.receipt}>
          <Input id="ex-receipt" name="receipt" type="file" accept="application/pdf,image/jpeg,image/png" aria-invalid={bad(state, "receipt")} />
        </Field>
      </div>
      <div>
        <Submit pending={pending} label={f.submit} dict={dict} />
      </div>
    </form>
  );
}

export function ExpenseActions({
  id,
  status,
  paidOn,
  hasReceipt,
  locale,
  dict,
  canApprove,
  canPay,
}: {
  id: string;
  status: string;
  paidOn: string | null;
  hasReceipt: boolean;
  locale: Locale;
  dict: Dictionary;
  canApprove: boolean;
  canPay: boolean;
}) {
  const [decide, decideRef] = useResettingForm(decideExpenseAction);
  const [attach, attachRef] = useResettingForm(attachReceiptAction);
  const a = dict.fin.expenses.actions;
  const [decision, setDecision] = useState<"approve" | "reject" | "paid">(
    status === "pending" ? "approve" : "paid",
  );
  const options: Array<{ value: "approve" | "reject" | "paid"; label: string }> = [];
  if (status === "pending" && canApprove) {
    options.push({ value: "approve", label: a.approve }, { value: "reject", label: a.reject });
  }
  if (status === "approved" && !paidOn && canPay) options.push({ value: "paid", label: a.markPaid });

  return (
    <div className="flex min-w-48 flex-col gap-3">
      {options.length > 0 ? (
        <form ref={decideRef} action={decide.formAction} onSubmit={decide.onSubmit} className="flex flex-col gap-2" noValidate>
          <Locale_ locale={locale} />
          <input type="hidden" name="id" value={id} />
          <Feedback state={decide.state} dict={dict} />
          <Select aria-label={dict.fin.common.status} name="decision" value={decision} onChange={(e) => setDecision(e.target.value as typeof decision)}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          {decision === "paid" ? (
            <Input aria-label={a.paidOn} name="paidOn" type="date" defaultValue={todayIso()} max={todayIso()} />
          ) : null}
          {decision === "reject" ? (
            <Input aria-label={a.reason} placeholder={a.reason} name="reason" maxLength={500} aria-invalid={bad(decide.state, "reason")} />
          ) : null}
          <Button type="submit" size="sm" disabled={decide.pending}>
            {decide.pending ? dict.fin.common.working : dict.fin.payouts.actions.confirm}
          </Button>
        </form>
      ) : null}
      {!hasReceipt ? (
        <form ref={attachRef} action={attach.formAction} onSubmit={attach.onSubmit} className="flex flex-col gap-2" noValidate encType="multipart/form-data">
          <Locale_ locale={locale} />
          <input type="hidden" name="id" value={id} />
          <Feedback state={attach.state} dict={dict} />
          <Input aria-label={a.attach} name="receipt" type="file" accept="application/pdf,image/jpeg,image/png" />
          <Button type="submit" size="sm" variant="secondary" disabled={attach.pending}>
            {a.attach}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

// --------------------------------------------------------------- documents

export function DocumentForm({ dealId, locale, dict }: { dealId: string; locale: Locale; dict: Dictionary }) {
  const [{ state, formAction, onSubmit, pending }, ref] = useResettingForm(uploadDealDocumentAction);
  const d = dict.fin.deals.detail;
  return (
    <form ref={ref} action={formAction} onSubmit={onSubmit} className="flex flex-col gap-4" noValidate encType="multipart/form-data">
      <Locale_ locale={locale} />
      <input type="hidden" name="dealId" value={dealId} />
      <Feedback state={state} dict={dict} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="dd-kind" label={d.uploadKind}>
          <Select id="dd-kind" name="kind" defaultValue="agreement">
            <Opt values={["agreement", "receipt", "other"] as const} labels={dict.fin.docKinds} />
          </Select>
        </Field>
        <Field id="dd-file" label={d.uploadFile}>
          <Input id="dd-file" name="file" type="file" accept="application/pdf,image/jpeg,image/png" aria-invalid={bad(state, "file")} />
        </Field>
      </div>
      <div>
        <Submit pending={pending} label={d.uploadSubmit} dict={dict} />
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- settings

export interface SettingsValues {
  earnedRule: string;
  payoutRule: string;
  defaultMethod: string;
  defaultRate: string;
  defaultFixed: string;
  defaultShareMethod: string;
  defaultShareRate: string;
  defaultShareFixed: string;
}

export function SettingsForm({
  locale,
  dict,
  values,
  editable,
}: {
  locale: Locale;
  dict: Dictionary;
  values: SettingsValues;
  editable: boolean;
}) {
  const { state, formAction, onSubmit, pending } = useActionForm(updateFinanceSettingsAction, idle);
  const s = dict.fin.finance.settings;
  const t = dict.fin.deals.form;
  const lock = !editable;
  return (
    <form action={formAction} onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Locale_ locale={locale} />
      <Feedback state={state} dict={dict} />
      {lock ? <p className="text-sm text-muted">{s.readOnly}</p> : null}
      <fieldset disabled={lock} className="grid gap-4 sm:grid-cols-2">
        <Field id="st-earned" label={s.earnedRule}>
          <Select id="st-earned" name="earnedRule" defaultValue={values.earnedRule}>
            <option value="on_closed_won">{s.earnedOnWon}</option>
            <option value="on_collection">{s.earnedOnCollection}</option>
          </Select>
        </Field>
        <Field id="st-payout" label={s.payoutRule}>
          <Select id="st-payout" name="payoutRule" defaultValue={values.payoutRule}>
            <option value="on_collected">{s.payoutOnCollected}</option>
            <option value="on_earned">{s.payoutOnEarned}</option>
          </Select>
        </Field>
        <p className="text-sm font-bold sm:col-span-2">{s.defaultsTitle}</p>
        <p className="text-xs text-muted sm:col-span-2">{s.defaultsNote}</p>
        <Field id="st-method" label={t.commissionMethod}>
          <Select id="st-method" name="defaultMethod" defaultValue={values.defaultMethod}>
            <option value="">{dict.fin.common.notSet}</option>
            <Opt values={commissionMethodList} labels={dict.fin.commissionMethods} />
          </Select>
        </Field>
        <Field id="st-rate" label={t.commissionRate}>
          <Input id="st-rate" name="defaultRate" inputMode="decimal" defaultValue={values.defaultRate} aria-invalid={bad(state, "defaultRate")} />
        </Field>
        <Field id="st-fixed" label={t.commissionFixed}>
          <Input id="st-fixed" name="defaultFixed" inputMode="decimal" defaultValue={values.defaultFixed} aria-invalid={bad(state, "defaultFixed")} />
        </Field>
        <Field id="st-smethod" label={t.shareMethod}>
          <Select id="st-smethod" name="defaultShareMethod" defaultValue={values.defaultShareMethod}>
            <Opt values={shareMethodList} labels={dict.fin.shareMethods} />
          </Select>
        </Field>
        <Field id="st-srate" label={t.shareRate}>
          <Input id="st-srate" name="defaultShareRate" inputMode="decimal" defaultValue={values.defaultShareRate} aria-invalid={bad(state, "defaultShareRate")} />
        </Field>
        <Field id="st-sfixed" label={t.shareFixed}>
          <Input id="st-sfixed" name="defaultShareFixed" inputMode="decimal" defaultValue={values.defaultShareFixed} aria-invalid={bad(state, "defaultShareFixed")} />
        </Field>
      </fieldset>
      {!lock ? (
        <div>
          <Submit pending={pending} label={s.save} dict={dict} />
        </div>
      ) : null}
    </form>
  );
}

