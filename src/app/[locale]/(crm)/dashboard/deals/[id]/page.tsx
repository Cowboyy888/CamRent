import { DocumentLinks } from "@/components/ops/document-links";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyNote, Panel } from "@/components/crm/panels";
import { Amount, auditDetail, CollectionBadge, DealStageBadge, PayoutBadge } from "@/components/finance/bits";
import {
  DealStatusForm,
  DealTermsForm,
  DocumentForm,
  RaiseReceivableForm,
  RequestPayoutForm,
} from "@/components/finance/fin-forms";
import type { DealFieldValues } from "@/lib/finance/deal-form";
import { ListingsEmptyState } from "@/components/property/listings-empty-state";
import type { Locale } from "@/i18n/config";
import { interpolate, type Dictionary } from "@/i18n/dictionaries";
import { getDictionary, getLocale } from "@/i18n/server";
import { allowedTransitions, missingForClosedWon, managerOnlyStages } from "@/lib/finance/deals";
import { minorToMajorString } from "@/lib/finance/money";
import {
  canRaiseReceivables,
  canRequestPayouts,
  canViewAudit,
  canViewDeals,
  canWorkDeals,
} from "@/lib/finance/permissions";
import { formatDate, formatDateTime } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dashboardPath } from "@/server/auth/constants";
import { requireCapability } from "@/server/finance/guard";
import { getDealDetail, getSettings, landlordOptions, signedLink } from "@/server/finance/queries";

type Props = PageProps<"/[locale]/dashboard/deals/[id]">;

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary();
  return { title: dict.fin.deals.title };
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className="text-right text-sm font-semibold">{children}</dd>
    </div>
  );
}

async function Content({ params, locale, dict }: { params: Props["params"]; locale: Locale; dict: Dictionary }) {
  const access = await requireCapability(canViewDeals);
  const { id } = await params;
  const client = await createSupabaseServerClient();
  const d = dict.fin.deals.detail;
  const back = dashboardPath(locale, "/deals");

  const result = await getDealDetail(client, id, { includeAudit: canViewAudit(access.role) });
  if (result.status !== "ok") {
    return (
      <ListingsEmptyState
        headingLevel="h2"
        title={result.status === "notFound" ? dict.fin.errors.notFound : dict.fin.common.errorTitle}
        body={result.status === "notFound" ? "" : dict.fin.common.errorBody}
        ctaLabel={d.back}
        ctaHref={back}
      />
    );
  }

  const { deal, financials: f, receivables, payouts, documents, audit, staff } = result.detail;
  const [landlords, settings] = await Promise.all([
    canWorkDeals(access.role) ? landlordOptions(client) : Promise.resolve([]),
    getSettings(client),
  ]);
  const currency = deal.currency;
  const closed = deal.stage === "closed_won" || deal.stage === "lease_expired";
  const missing = missingForClosedWon({
    agreedMonthlyRentMinor: deal.agreed_monthly_rent_minor === null ? null : Number(deal.agreed_monthly_rent_minor),
    leaseStart: deal.lease_start,
    leaseEnd: deal.lease_end,
    landlordId: deal.landlord_id,
    closingDate: deal.closing_date,
    agreementReference: deal.agreement_reference,
    commissionMethod: deal.commission_method,
    commissionExpectedMinor: deal.commission_expected_minor === null ? null : Number(deal.commission_expected_minor),
  });
  const options = allowedTransitions(deal.stage).filter(
    (s) => access.role !== "agent" || !managerOnlyStages.includes(s),
  );
  const stageOptions = options.filter((s) => s !== "closed_won" || missing.length === 0);

  const values: DealFieldValues = {
    landlordId: deal.landlord_id ?? "",
    rent: minorToMajorString(deal.agreed_monthly_rent_minor),
    currency,
    leaseStart: deal.lease_start ?? "",
    leaseEnd: deal.lease_end ?? "",
    deposit: minorToMajorString(deal.deposit_minor),
    advance: minorToMajorString(deal.advance_rent_minor),
    agreementRef: deal.agreement_reference ?? "",
    closingDate: deal.closing_date ?? "",
    notes: deal.notes ?? "",
    commissionMethod: deal.commission_method ?? "",
    commissionRate: deal.commission_rate === null ? "" : String(deal.commission_rate),
    commissionFixed: minorToMajorString(deal.commission_fixed_minor),
    shareMethod: deal.agent_share_method,
    shareRate: deal.agent_share_rate === null ? "" : String(deal.agent_share_rate),
    shareFixed: minorToMajorString(deal.agent_share_fixed_minor),
  };

  const links = await Promise.all(documents.map((doc) => signedLink(client, doc.storage_path)));
  const allocated = receivables.reduce((sum, r) => sum + Number(r.due_minor ?? 0), 0);
  const unallocated = Math.max((f?.expected ?? 0) - allocated, 0);

  return (
    <div className="space-y-6">
      <div>
        <Link href={back} className="text-sm font-semibold text-mekong-700 hover:underline">← {d.back}</Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">
            {result.detail.customerName ?? d.customer}
            {result.detail.propertyReference ? ` · ${result.detail.propertyReference}` : ""}
          </h1>
          <DealStageBadge stage={deal.stage} dict={dict} />
        </div>
        <DocumentLinks
          role={access.role}
          locale={locale}
          dict={dict}
          entityId={deal.id}
          types={["deal_summary", "payout_statement", "agreement_draft"]}
        />
        <p className="mt-1 text-sm text-muted">
          {result.detail.agentName ?? ""}
          {result.detail.landlordName ? ` · ${dict.fin.common.landlord}: ${result.detail.landlordName}` : ""}
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Panel id="terms" title={d.terms}>
            {closed ? (
              <>
                <p className="mb-4 rounded-control bg-sand-50 p-3 text-sm text-ink-soft">{d.frozen}</p>
                <dl className="divide-y divide-sand-200">
                  <Row label={dict.fin.deals.form.rent}><Amount minor={Number(deal.agreed_monthly_rent_minor)} currency={currency} /></Row>
                  <Row label={dict.fin.deals.form.leaseStart}>{deal.lease_start ? formatDate(deal.lease_start, locale) : "—"}</Row>
                  <Row label={dict.fin.deals.form.leaseEnd}>{deal.lease_end ? formatDate(deal.lease_end, locale) : "—"}</Row>
                  <Row label={d.leaseDuration}>{deal.lease_months ? interpolate(dict.fin.deals.form.months, { count: deal.lease_months }) : "—"}</Row>
                  <Row label={dict.fin.deals.form.deposit}><Amount minor={deal.deposit_minor === null ? null : Number(deal.deposit_minor)} currency={currency} /></Row>
                  <Row label={dict.fin.deals.form.advance}><Amount minor={deal.advance_rent_minor === null ? null : Number(deal.advance_rent_minor)} currency={currency} /></Row>
                  <Row label={dict.fin.deals.form.agreementRef}>{deal.agreement_reference ?? "—"}</Row>
                  <Row label={dict.fin.deals.form.closingDate}>{deal.closing_date ? formatDate(deal.closing_date, locale) : "—"}</Row>
                  <Row label={dict.fin.deals.form.commissionMethod}>{deal.commission_method ? dict.fin.commissionMethods[deal.commission_method] : "—"}</Row>
                  <Row label={dict.fin.deals.form.shareMethod}>{dict.fin.shareMethods[deal.agent_share_method]}</Row>
                </dl>
              </>
            ) : canWorkDeals(access.role) ? (
              <DealTermsForm id={deal.id} locale={locale} dict={dict} landlords={landlords} initial={values} />
            ) : (
              <EmptyNote>{dict.fin.errors.forbidden}</EmptyNote>
            )}
            {deal.notes ? <p className="mt-4 whitespace-pre-line text-sm text-ink-soft">{deal.notes}</p> : null}
          </Panel>

          <Panel id="receivables" title={d.receivables}>
            {receivables.length === 0 ? (
              <EmptyNote>{d.noReceivables}</EmptyNote>
            ) : (
              <ul className="divide-y divide-sand-200">
                {receivables.map((r) => (
                  <li key={r.commission_id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                    <Link
                      href={dashboardPath(locale, `/commissions/${r.commission_id}`)}
                      className="font-semibold text-mekong-700 hover:underline"
                    >
                      {r.payer ? dict.fin.payers[r.payer] : "—"}
                    </Link>
                    <span className="tabular-nums">
                      <Amount minor={Number(r.collected_minor)} currency={r.currency} /> /{" "}
                      <Amount minor={Number(r.due_minor)} currency={r.currency} />
                    </span>
                    <CollectionBadge status={r.collection_status} dict={dict} />
                  </li>
                ))}
              </ul>
            )}
            {deal.stage === "closed_won" && canRaiseReceivables(access.role) && unallocated > 0 ? (
              <div className="mt-6 border-t border-sand-200 pt-4">
                <h3 className="mb-3 text-sm font-bold">{d.raise}</h3>
                <RaiseReceivableForm dealId={deal.id} locale={locale} dict={dict} currency={currency} suggestedMinor={unallocated} />
              </div>
            ) : null}
          </Panel>

          <Panel id="documents" title={d.documents}>
            {documents.length === 0 ? (
              <EmptyNote>{d.noDocuments}</EmptyNote>
            ) : (
              <ul className="divide-y divide-sand-200 text-sm">
                {documents.map((doc, i) => (
                  <li key={doc.id} className="flex items-center justify-between gap-3 py-2">
                    <span>
                      {dict.fin.docKinds[doc.kind]} · {doc.file_name}
                      <span className="block text-xs text-muted">
                        {formatDateTime(doc.created_at, locale)} · {interpolate(dict.fin.common.by, { name: staff.get(doc.uploaded_by) ?? "—" })}
                      </span>
                    </span>
                    {links[i] ? (
                      <a href={links[i]!} target="_blank" rel="noopener noreferrer" className="font-semibold text-mekong-700 hover:underline">
                        {d.open}
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 border-t border-sand-200 pt-4">
              <h3 className="mb-3 text-sm font-bold">{d.upload}</h3>
              <DocumentForm dealId={deal.id} locale={locale} dict={dict} />
            </div>
          </Panel>

          {canViewAudit(access.role) ? (
            <Panel id="history" title={d.history}>
              {audit.length === 0 ? (
                <EmptyNote>{d.noHistory}</EmptyNote>
              ) : (
                <ol className="space-y-3 border-l-2 border-sand-200 pl-4 text-sm">
                  {audit.map((a) => (
                    <li key={a.id}>
                      <p className="font-semibold">
                        {dict.fin.finance.audit.actions[a.action as "insert" | "update" | "export"] ?? a.action} · {a.entity_type}
                        {auditDetail(a, dict) ? ` → ${auditDetail(a, dict)}` : ""}
                      </p>
                      {a.reason ? <p className="text-ink-soft">{a.reason}</p> : null}
                      <p className="text-xs text-muted">
                        {formatDateTime(a.occurred_at, locale)} ·{" "}
                        {a.actor_id ? (staff.get(a.actor_id) ?? dict.crm.common.staffMember) : dict.fin.finance.audit.system}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          ) : null}
        </div>

        <div className="space-y-6">
          <Panel id="status" title={d.statusTitle}>
            {missing.length > 0 && ["negotiation", "reserved", "agreement_pending"].includes(deal.stage) ? (
              <div className="mb-4 rounded-control bg-warning-50 p-3 text-sm text-warning">
                <p className="font-semibold">{d.missingTitle}</p>
                <ul className="mt-1 list-disc pl-5">
                  {missing.map((m) => (
                    <li key={m}>{d.missing[m as keyof typeof d.missing]}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {canWorkDeals(access.role) && stageOptions.length > 0 ? (
              <DealStatusForm id={deal.id} locale={locale} dict={dict} options={stageOptions} />
            ) : null}
          </Panel>

          <Panel id="financials" title={d.financials}>
            {f ? (
              <dl className="divide-y divide-sand-200">
                <Row label={d.expected}><Amount minor={f.expected} currency={currency} /></Row>
                <Row label={d.earned}><Amount minor={f.earned} currency={currency} /></Row>
                <Row label={d.invoiced}><Amount minor={f.invoiced} currency={currency} /></Row>
                <Row label={d.collected}><Amount minor={f.collected} currency={currency} /></Row>
                <Row label={d.outstanding}><Amount minor={f.outstanding} currency={currency} /></Row>
                <Row label={d.writtenOff}><Amount minor={f.writtenOff} currency={currency} /></Row>
              </dl>
            ) : null}
            <p className="mt-3 text-xs text-muted">
              {settings?.commission_earned_rule === "on_collection" ? d.earnedRuleOnCollection : d.earnedRuleOnWon}
            </p>
          </Panel>

          <Panel id="agent" title={d.payouts}>
            {f ? (
              <dl className="divide-y divide-sand-200">
                <Row label={d.agentShare}><Amount minor={f.agentShare} currency={currency} /></Row>
                <Row label={d.agentEligible}><Amount minor={f.agentEligible} currency={currency} /></Row>
                <Row label={d.agentPaid}><Amount minor={f.agentPaid} currency={currency} /></Row>
                <Row label={d.agentPending}><Amount minor={f.agentPending} currency={currency} /></Row>
                <Row label={d.agentOutstanding}><Amount minor={f.agentOutstanding} currency={currency} /></Row>
              </dl>
            ) : null}
            {payouts.length === 0 ? (
              <p className="mt-3 text-sm text-muted">{d.noPayouts}</p>
            ) : (
              <ul className="mt-4 divide-y divide-sand-200 text-sm">
                {payouts.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <Amount minor={Number(p.amount_minor)} currency={p.currency} />
                      <span className="block text-xs text-muted">
                        {formatDateTime(p.created_at, locale)} · {staff.get(p.requested_by) ?? "—"}
                      </span>
                    </span>
                    <PayoutBadge status={p.status} dict={dict} />
                  </li>
                ))}
              </ul>
            )}
            {closed && f && canRequestPayouts(access.role) ? (
              <div className="mt-5 border-t border-sand-200 pt-4">
                <h3 className="mb-3 text-sm font-bold">{d.requestPayout}</h3>
                <RequestPayoutForm
                  dealId={deal.id}
                  locale={locale}
                  dict={dict}
                  currency={currency}
                  eligibleMinor={Math.max(f.agentEligible - f.agentPaid - f.agentPending, 0)}
                />
              </div>
            ) : null}
          </Panel>
        </div>
      </div>
    </div>
  );
}

export default async function DealDetailPage({ params }: Props) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  return (
    <Suspense fallback={<p className="text-sm text-muted">{dict.fin.common.loading}</p>}>
      <Content params={params} locale={locale} dict={dict} />
    </Suspense>
  );
}
