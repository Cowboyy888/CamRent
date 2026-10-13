import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DataTable, DealStageBadge, Amount, Pager } from "@/components/finance/bits";
import { ListingsEmptyState } from "@/components/property/listings-empty-state";
import { buttonClasses } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import type { Locale } from "@/i18n/config";
import { interpolate, type Dictionary } from "@/i18n/dictionaries";
import { getDictionary, getLocale } from "@/i18n/server";
import { dealStages } from "@/lib/finance/deals";
import { canViewDeals, canWorkDeals } from "@/lib/finance/permissions";
import { formatDate } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dashboardPath } from "@/server/auth/constants";
import { agentOptions, listDeals } from "@/server/finance/queries";
import { requireCapability } from "@/server/finance/guard";
import { canViewTeam } from "@/lib/crm/permissions";

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary();
  return { title: dict.fin.deals.title };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function DealsContent({
  searchParams,
  locale,
  dict,
}: {
  searchParams: PageProps<"/[locale]/dashboard/deals">["searchParams"];
  locale: Locale;
  dict: Dictionary;
}) {
  const access = await requireCapability(canViewDeals);
  const raw = await searchParams;
  const q = one(raw.q)?.trim().slice(0, 80) || undefined;
  const stage = dealStages.find((s) => s === one(raw.stage));
  const agent = one(raw.agent) || undefined;
  const page = Math.max(1, Math.min(1000, Number(one(raw.page)) || 1));

  const client = await createSupabaseServerClient();
  const manager = canViewTeam(access.role) || access.role === "finance";
  const [result, agents] = await Promise.all([
    listDeals(client, { q, stage, agent, page }),
    manager ? agentOptions(client) : Promise.resolve([]),
  ]);

  const base = dashboardPath(locale, "/deals");
  const hrefFor = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (stage) params.set("stage", stage);
    if (agent) params.set("agent", agent);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  };
  const t = dict.fin.deals;
  const filtered = Boolean(q || stage || agent);

  return (
    <div className="space-y-6">
      <form action={base} method="get" role="search" className="rounded-card border border-sand-200 bg-white p-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field id="df-q" label={dict.fin.common.search}>
            <Input id="df-q" name="q" type="search" maxLength={80} defaultValue={q ?? ""} placeholder={t.searchPlaceholder} />
          </Field>
          <Field id="df-stage" label={t.filterStage}>
            <Select id="df-stage" name="stage" defaultValue={stage ?? ""}>
              <option value="">{dict.fin.common.anyStatus}</option>
              {dealStages.map((s) => (
                <option key={s} value={s}>
                  {dict.fin.dealStages[s]}
                </option>
              ))}
            </Select>
          </Field>
          {manager ? (
            <Field id="df-agent" label={dict.fin.common.agent}>
              <Select id="df-agent" name="agent" defaultValue={agent ?? ""}>
                <option value="">{dict.fin.common.anyAgent}</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button type="submit" className={buttonClasses({})}>{dict.fin.common.search}</button>
          <Link href={base} className="text-sm font-semibold text-mekong-700 hover:underline">
            {dict.fin.common.clear}
          </Link>
        </div>
      </form>

      {!result.ok ? (
        <div role="alert">
          <ListingsEmptyState headingLevel="h2" title={dict.fin.common.errorTitle} body={dict.fin.common.errorBody} />
        </div>
      ) : result.data.total === 0 ? (
        <ListingsEmptyState
          headingLevel="h2"
          title={filtered ? t.emptyTitle : t.emptyNoneTitle}
          body={filtered ? t.emptyBody : t.emptyNoneBody}
          ctaLabel={canWorkDeals(access.role) ? t.new : undefined}
          ctaHref={canWorkDeals(access.role) ? dashboardPath(locale, "/deals/new") : undefined}
        />
      ) : (
        <>
          <p className="text-sm font-semibold text-ink-soft" aria-live="polite">
            {result.data.total === 1
              ? dict.fin.common.resultsOne
              : interpolate(dict.fin.common.resultsMany, { count: result.data.total })}
          </p>
          <DataTable
            head={[
              t.columns.customer,
              t.columns.property,
              t.columns.landlord,
              t.columns.agent,
              t.columns.rent,
              t.columns.status,
              t.columns.commission,
              t.columns.closing,
            ]}
          >
            {result.data.items.map((d) => (
              <tr key={d.id} className="align-top hover:bg-sand-50">
                <th scope="row" className="px-4 py-3 font-semibold">
                  <Link href={dashboardPath(locale, `/deals/${d.id}`)} className="text-mekong-700 hover:underline">
                    {d.customerName ?? dict.fin.common.notSet}
                  </Link>
                </th>
                <td className="px-4 py-3">{d.propertyReference ?? "—"}</td>
                <td className="px-4 py-3">{d.landlordName ?? "—"}</td>
                <td className="px-4 py-3">{d.agentName ?? "—"}</td>
                <td className="px-4 py-3"><Amount minor={d.rentMinor} currency={d.currency} /></td>
                <td className="px-4 py-3"><DealStageBadge stage={d.stage} dict={dict} /></td>
                <td className="px-4 py-3"><Amount minor={d.expectedCommissionMinor} currency={d.currency} /></td>
                <td className="px-4 py-3 whitespace-nowrap">{d.closingDate ? formatDate(d.closingDate, locale) : "—"}</td>
              </tr>
            ))}
          </DataTable>
          <Pager page={result.data.page} pageCount={result.data.pageCount} hrefFor={hrefFor} dict={dict} />
        </>
      )}
    </div>
  );
}

export default async function DealsPage({ searchParams }: PageProps<"/[locale]/dashboard/deals">) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{dict.fin.deals.title}</h1>
          <p className="mt-1 mb-6 max-w-2xl text-muted">{dict.fin.deals.intro}</p>
        </div>
        <Link href={dashboardPath(locale, "/deals/new")} className={buttonClasses({})}>
          {dict.fin.deals.new}
        </Link>
      </div>
      <Suspense fallback={<p className="text-sm text-muted">{dict.fin.common.loading}</p>}>
        <DealsContent searchParams={searchParams} locale={locale} dict={dict} />
      </Suspense>
    </>
  );
}
