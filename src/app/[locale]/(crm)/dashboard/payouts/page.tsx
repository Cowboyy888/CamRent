import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Amount, DataTable, PayoutBadge, Pager } from "@/components/finance/bits";
import { PayoutActions } from "@/components/finance/fin-forms";
import { ListingsEmptyState } from "@/components/property/listings-empty-state";
import { buttonClasses } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { getDictionary, getLocale } from "@/i18n/server";
import { canApprove, canMarkPayoutPaid, canRequestPayouts, canViewPayouts } from "@/lib/finance/permissions";
import { formatDate } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dashboardPath } from "@/server/auth/constants";
import { requireCapability } from "@/server/finance/guard";
import { listPayouts } from "@/server/finance/queries";

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary();
  return { title: dict.fin.payouts.title };
}

const statuses = ["pending_approval", "approved", "paid", "rejected", "cancelled", "reversed"] as const;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function Content({
  searchParams,
  locale,
  dict,
}: {
  searchParams: PageProps<"/[locale]/dashboard/payouts">["searchParams"];
  locale: Locale;
  dict: Dictionary;
}) {
  const access = await requireCapability(canViewPayouts);
  const raw = await searchParams;
  const status = statuses.find((s) => s === one(raw.status));
  const page = Math.max(1, Math.min(1000, Number(one(raw.page)) || 1));
  const client = await createSupabaseServerClient();
  const result = await listPayouts(client, { status, page });
  const base = dashboardPath(locale, "/payouts");
  const hrefFor = (p: number) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  };
  const t = dict.fin.payouts;
  const allowed = {
    approve: canApprove(access.role),
    pay: canMarkPayoutPaid(access.role),
    cancel: canApprove(access.role) || canRequestPayouts(access.role),
  };
  const canAct = allowed.approve || allowed.pay || allowed.cancel;

  return (
    <div className="space-y-6">
      <form action={base} method="get" className="flex flex-wrap items-end gap-3 rounded-card border border-sand-200 bg-white p-4">
        <Field id="pf-status" label={t.filterStatus}>
          <Select id="pf-status" name="status" defaultValue={status ?? ""}>
            <option value="">{dict.fin.common.anyStatus}</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {dict.fin.payoutStatuses[s]}
              </option>
            ))}
          </Select>
        </Field>
        <button type="submit" className={buttonClasses({})}>{dict.fin.common.search}</button>
      </form>

      {!result.ok ? (
        <div role="alert">
          <ListingsEmptyState headingLevel="h2" title={dict.fin.common.errorTitle} body={dict.fin.common.errorBody} />
        </div>
      ) : result.data.total === 0 ? (
        <ListingsEmptyState headingLevel="h2" title={t.emptyTitle} body={t.emptyBody} />
      ) : (
        <>
          <DataTable
            head={[t.columns.deal, t.columns.agent, t.columns.amount, t.columns.status, t.columns.requested, t.columns.paid, ...(canAct ? [dict.fin.common.view] : [])]}
          >
            {result.data.items.map((p) => (
              <tr key={p.id} className="align-top hover:bg-sand-50">
                <th scope="row" className="px-4 py-3 font-semibold">
                  <Link href={dashboardPath(locale, `/deals/${p.deal_id}`)} className="text-mekong-700 hover:underline">
                    {p.customerName ?? dict.fin.common.notSet}
                  </Link>
                  <span className="block text-xs font-normal text-muted">{p.propertyReference ?? ""}</span>
                </th>
                <td className="px-4 py-3">{p.agentName ?? "—"}</td>
                <td className="px-4 py-3"><Amount minor={Number(p.amount_minor)} currency={p.currency} /></td>
                <td className="px-4 py-3">
                  <PayoutBadge status={p.status} dict={dict} />
                  {p.reason ? <span className="mt-1 block text-xs text-muted">{p.reason}</span> : null}
                </td>
                <td className="px-4 py-3 text-xs">
                  {formatDate(p.created_at.slice(0, 10), locale)}
                  <span className="block text-muted">{p.requestedByName ?? ""}</span>
                </td>
                <td className="px-4 py-3 text-xs">
                  {p.paid_on ? formatDate(p.paid_on, locale) : "—"}
                  {p.payment_reference ? <span className="block text-muted">{p.payment_reference}</span> : null}
                </td>
                {canAct ? (
                  <td className="min-w-52 px-4 py-3">
                    <PayoutActions id={p.id} status={p.status} locale={locale} dict={dict} allowed={allowed} />
                  </td>
                ) : null}
              </tr>
            ))}
          </DataTable>
          <Pager page={result.data.page} pageCount={result.data.pageCount} hrefFor={hrefFor} dict={dict} />
        </>
      )}
    </div>
  );
}

export default async function PayoutsPage({ searchParams }: PageProps<"/[locale]/dashboard/payouts">) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">{dict.fin.payouts.title}</h1>
      <p className="mt-1 mb-6 max-w-2xl text-muted">{dict.fin.payouts.intro}</p>
      <Suspense fallback={<p className="text-sm text-muted">{dict.fin.common.loading}</p>}>
        <Content searchParams={searchParams} locale={locale} dict={dict} />
      </Suspense>
    </>
  );
}
