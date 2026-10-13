import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Amount, CollectionBadge, DataTable, Pager } from "@/components/finance/bits";
import { ListingsEmptyState } from "@/components/property/listings-empty-state";
import { buttonClasses } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import type { Locale } from "@/i18n/config";
import { interpolate, type Dictionary } from "@/i18n/dictionaries";
import { getDictionary, getLocale } from "@/i18n/server";
import { canViewReceivables } from "@/lib/finance/permissions";
import { formatDate } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dashboardPath } from "@/server/auth/constants";
import { requireCapability } from "@/server/finance/guard";
import { listReceivables } from "@/server/finance/queries";

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary();
  return { title: dict.fin.commissions.title };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const statuses = ["not_due", "due", "partially_paid", "paid", "overdue", "written_off"] as const;
const date = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

async function Content({
  searchParams,
  locale,
  dict,
}: {
  searchParams: PageProps<"/[locale]/dashboard/commissions">["searchParams"];
  locale: Locale;
  dict: Dictionary;
}) {
  await requireCapability(canViewReceivables);
  const raw = await searchParams;
  const filters = {
    q: one(raw.q)?.trim().slice(0, 80) || undefined,
    status: statuses.find((s) => s === one(raw.status)),
    payer: ["landlord", "tenant", "other"].find((p) => p === one(raw.payer)),
    currency: ["USD", "KHR"].find((c) => c === one(raw.currency)),
    from: date(one(raw.from)),
    to: date(one(raw.to)),
    page: Math.max(1, Math.min(1000, Number(one(raw.page)) || 1)),
  };
  const client = await createSupabaseServerClient();
  const result = await listReceivables(client, filters);

  const base = dashboardPath(locale, "/commissions");
  const hrefFor = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v && k !== "page") params.set(k, String(v));
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  };
  const t = dict.fin.commissions;
  const filtered = Object.entries(filters).some(([k, v]) => k !== "page" && v);

  return (
    <div className="space-y-6">
      <form action={base} method="get" role="search" className="rounded-card border border-sand-200 bg-white p-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field id="cf-q" label={dict.fin.common.search}>
            <Input id="cf-q" name="q" type="search" maxLength={80} defaultValue={filters.q ?? ""} placeholder={t.searchPlaceholder} />
          </Field>
          <Field id="cf-status" label={t.filterStatus}>
            <Select id="cf-status" name="status" defaultValue={filters.status ?? ""}>
              <option value="">{dict.fin.common.anyStatus}</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {dict.fin.collection[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="cf-payer" label={t.filterPayer}>
            <Select id="cf-payer" name="payer" defaultValue={filters.payer ?? ""}>
              <option value="">{t.anyPayer}</option>
              {(["landlord", "tenant", "other"] as const).map((p) => (
                <option key={p} value={p}>
                  {dict.fin.payers[p]}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="cf-cur" label={dict.fin.common.currency}>
            <Select id="cf-cur" name="currency" defaultValue={filters.currency ?? ""}>
              <option value="">{dict.fin.common.anyCurrency}</option>
              <option value="USD">USD</option>
              <option value="KHR">KHR</option>
            </Select>
          </Field>
          <Field id="cf-from" label={`${t.columns.dueDate}: ${dict.fin.common.from}`}>
            <Input id="cf-from" name="from" type="date" defaultValue={filters.from ?? ""} />
          </Field>
          <Field id="cf-to" label={`${t.columns.dueDate}: ${dict.fin.common.to}`}>
            <Input id="cf-to" name="to" type="date" defaultValue={filters.to ?? ""} />
          </Field>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button type="submit" className={buttonClasses({})}>{dict.fin.common.search}</button>
          <Link href={base} className="text-sm font-semibold text-mekong-700 hover:underline">{dict.fin.common.clear}</Link>
        </div>
      </form>

      {!result.ok ? (
        <div role="alert">
          <ListingsEmptyState headingLevel="h2" title={dict.fin.common.errorTitle} body={dict.fin.common.errorBody} />
        </div>
      ) : (
        <>
          {result.data.totals.length > 0 ? (
            <section aria-label={t.totalsTitle} className="grid gap-4 sm:grid-cols-2">
              {result.data.totals.map((tot) => (
                <div key={tot.currency} className="rounded-card border border-sand-200 bg-white p-4">
                  <h2 className="text-sm font-bold">{tot.currency}</h2>
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <div><dt className="text-xs text-muted">{t.totals.due}</dt><dd className="font-semibold"><Amount minor={tot.due} currency={tot.currency} /></dd></div>
                    <div><dt className="text-xs text-muted">{t.totals.collected}</dt><dd className="font-semibold"><Amount minor={tot.collected} currency={tot.currency} /></dd></div>
                    <div><dt className="text-xs text-muted">{t.totals.outstanding}</dt><dd className="font-semibold"><Amount minor={tot.outstanding} currency={tot.currency} /></dd></div>
                    <div><dt className="text-xs text-muted">{t.totals.overdue}</dt><dd className="font-semibold text-danger"><Amount minor={tot.overdue} currency={tot.currency} /></dd></div>
                  </dl>
                </div>
              ))}
            </section>
          ) : null}

          {result.data.total === 0 ? (
            <ListingsEmptyState
              headingLevel="h2"
              title={filtered ? t.emptyTitle : t.emptyNoneTitle}
              body={filtered ? t.emptyBody : t.emptyNoneBody}
            />
          ) : (
            <>
              <p className="text-sm font-semibold text-ink-soft" aria-live="polite">
                {result.data.total === 1
                  ? dict.fin.common.resultsOne
                  : interpolate(dict.fin.common.resultsMany, { count: result.data.total })}
              </p>
              <DataTable
                head={[t.columns.customer, t.columns.payer, t.columns.due, t.columns.dueDate, t.columns.collected, t.columns.outstanding, t.columns.status, t.columns.last]}
              >
                {result.data.items.map((r) => (
                  <tr key={r.commission_id ?? ""} className="align-top hover:bg-sand-50">
                    <th scope="row" className="px-4 py-3 font-semibold">
                      <Link href={dashboardPath(locale, `/commissions/${r.commission_id}`)} className="text-mekong-700 hover:underline">
                        {r.customer_name ?? dict.fin.common.notSet}
                      </Link>
                      <span className="block text-xs font-normal text-muted">{r.property_reference ?? ""}</span>
                    </th>
                    <td className="px-4 py-3">{r.payer ? dict.fin.payers[r.payer] : "—"}</td>
                    <td className="px-4 py-3"><Amount minor={Number(r.due_minor)} currency={r.currency} /></td>
                    <td className="px-4 py-3 whitespace-nowrap">{r.due_date ? formatDate(r.due_date, locale) : "—"}</td>
                    <td className="px-4 py-3"><Amount minor={Number(r.collected_minor)} currency={r.currency} /></td>
                    <td className="px-4 py-3 font-semibold"><Amount minor={Number(r.outstanding_minor)} currency={r.currency} /></td>
                    <td className="px-4 py-3"><CollectionBadge status={r.collection_status} dict={dict} /></td>
                    <td className="px-4 py-3 text-xs text-ink-soft">
                      {r.last_payment_on ? formatDate(r.last_payment_on, locale) : "—"}
                      {r.last_payment_method ? ` · ${dict.fin.paymentMethods[r.last_payment_method]}` : ""}
                      {r.last_payment_reference ? ` · ${r.last_payment_reference}` : ""}
                    </td>
                  </tr>
                ))}
              </DataTable>
              <Pager page={result.data.page} pageCount={result.data.pageCount} hrefFor={hrefFor} dict={dict} />
            </>
          )}
        </>
      )}
    </div>
  );
}

export default async function CommissionsPage({ searchParams }: PageProps<"/[locale]/dashboard/commissions">) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">{dict.fin.commissions.title}</h1>
      <p className="mt-1 mb-6 max-w-2xl text-muted">{dict.fin.commissions.intro}</p>
      <Suspense fallback={<p className="text-sm text-muted">{dict.fin.common.loading}</p>}>
        <Content searchParams={searchParams} locale={locale} dict={dict} />
      </Suspense>
    </>
  );
}
