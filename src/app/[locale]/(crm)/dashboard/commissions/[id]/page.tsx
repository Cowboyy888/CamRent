import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyNote, Panel } from "@/components/crm/panels";
import { Amount, CollectionBadge } from "@/components/finance/bits";
import { LedgerEntryForm, ReceivableTermsForm } from "@/components/finance/fin-forms";
import { ListingsEmptyState } from "@/components/property/listings-empty-state";
import type { Locale } from "@/i18n/config";
import { interpolate, type Dictionary } from "@/i18n/dictionaries";
import { getDictionary, getLocale } from "@/i18n/server";
import { formatMoney } from "@/lib/format";
import { canRecordCollections, canViewReceivables } from "@/lib/finance/permissions";
import { formatDate } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dashboardPath } from "@/server/auth/constants";
import { requireCapability } from "@/server/finance/guard";
import { getReceivable } from "@/server/finance/queries";

type Props = PageProps<"/[locale]/dashboard/commissions/[id]">;

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary();
  return { title: dict.fin.commissions.title };
}

async function Content({ params, locale, dict }: { params: Props["params"]; locale: Locale; dict: Dictionary }) {
  const access = await requireCapability(canViewReceivables);
  const { id } = await params;
  const client = await createSupabaseServerClient();
  const t = dict.fin.commissions.detail;
  const back = dashboardPath(locale, "/commissions");

  const result = await getReceivable(client, id);
  if (result.status !== "ok") {
    return (
      <ListingsEmptyState
        headingLevel="h2"
        title={result.status === "notFound" ? dict.fin.errors.notFound : dict.fin.common.errorTitle}
        body={result.status === "notFound" ? "" : dict.fin.common.errorBody}
        ctaLabel={t.back}
        ctaHref={back}
      />
    );
  }

  const { balance: b, commission, ledger, staff } = result.detail;
  const currency = b.currency!;
  const recordable = canRecordCollections(access.role);

  // Payments that can still be (partly) reversed.
  const reversedBy = new Map<string, number>();
  for (const l of ledger) {
    if (l.entry_type === "reversal" && l.reverses_id) {
      reversedBy.set(l.reverses_id, (reversedBy.get(l.reverses_id) ?? 0) + Number(l.amount_minor));
    }
  }
  const payments = ledger
    .filter((l) => l.entry_type === "payment" && Number(l.amount_minor) - (reversedBy.get(l.id) ?? 0) > 0)
    .map((l) => ({
      id: l.id,
      label: `${formatDate(l.occurred_on, locale)} · ${formatMoney({ amountMinor: Number(l.amount_minor) - (reversedBy.get(l.id) ?? 0), currency })}${l.reference ? ` · ${l.reference}` : ""}`,
    }));

  return (
    <div className="space-y-6">
      <div>
        <Link href={back} className="text-sm font-semibold text-mekong-700 hover:underline">← {t.back}</Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">
            {b.customer_name ?? dict.fin.common.notSet}
            {b.property_reference ? ` · ${b.property_reference}` : ""}
          </h1>
          <CollectionBadge status={b.collection_status} dict={dict} />
        </div>
        <p className="mt-1 text-sm text-muted">
          {b.payer ? dict.fin.payers[b.payer] : ""} ·{" "}
          <Link href={dashboardPath(locale, `/deals/${b.deal_id}`)} className="text-mekong-700 hover:underline">
            {t.deal}
          </Link>
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Panel id="summary" title={t.summary}>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div><dt className="text-xs text-muted">{dict.fin.commissions.totals.due}</dt><dd className="font-bold"><Amount minor={Number(b.due_minor)} currency={currency} /></dd></div>
              <div><dt className="text-xs text-muted">{dict.fin.commissions.totals.collected}</dt><dd className="font-bold"><Amount minor={Number(b.collected_minor)} currency={currency} /></dd></div>
              <div><dt className="text-xs text-muted">{dict.fin.deals.detail.writtenOff}</dt><dd className="font-bold"><Amount minor={Number(b.written_off_minor)} currency={currency} /></dd></div>
              <div><dt className="text-xs text-muted">{dict.fin.commissions.totals.outstanding}</dt><dd className="font-bold"><Amount minor={Number(b.outstanding_minor)} currency={currency} /></dd></div>
            </dl>
            <p className="mt-3 text-xs text-muted">
              {dict.fin.commissions.columns.dueDate}: {b.due_date ? formatDate(b.due_date, locale) : dict.fin.common.notSet}
              {" · "}
              {dict.fin.deals.detail.invoicedOn}: {b.invoiced_on ? formatDate(b.invoiced_on, locale) : dict.fin.common.notSet}
            </p>
          </Panel>

          <Panel id="ledger" title={t.ledger}>
            {ledger.length === 0 ? (
              <EmptyNote>{t.noEntries}</EmptyNote>
            ) : (
              <ol className="divide-y divide-sand-200 text-sm">
                {ledger.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <div>
                      <p className="font-semibold">{dict.fin.entryTypes[l.entry_type]}</p>
                      <p className="text-xs text-muted">
                        {formatDate(l.occurred_on, locale)}
                        {l.payment_method ? ` · ${dict.fin.paymentMethods[l.payment_method]}` : ""}
                        {l.reference ? ` · ${l.reference}` : ""}
                        {" · "}
                        {interpolate(t.recordedBy, { name: staff.get(l.recorded_by) ?? dict.crm.common.staffMember })}
                      </p>
                      {l.reason ? <p className="mt-1 text-ink-soft">{l.reason}</p> : null}
                    </div>
                    <span className="font-semibold tabular-nums">
                      {l.entry_type === "reversal" || l.entry_type === "adjustment_down" || l.entry_type === "write_off" ? "−" : "+"}
                      <Amount minor={Number(l.amount_minor)} currency={l.currency} />
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel id="record" title={t.record}>
            {recordable ? (
              <LedgerEntryForm commissionId={commission.id} locale={locale} dict={dict} currency={currency} payments={payments} />
            ) : (
              <EmptyNote>{t.cannotRecord}</EmptyNote>
            )}
          </Panel>
          {recordable ? (
            <Panel id="terms" title={t.terms}>
              <ReceivableTermsForm
                id={commission.id}
                locale={locale}
                dict={dict}
                dueDate={commission.due_date ?? ""}
                invoicedOn={commission.invoiced_on ?? ""}
                notes={commission.notes ?? ""}
              />
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default async function CommissionDetailPage({ params }: Props) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  return (
    <Suspense fallback={<p className="text-sm text-muted">{dict.fin.common.loading}</p>}>
      <Content params={params} locale={locale} dict={dict} />
    </Suspense>
  );
}
