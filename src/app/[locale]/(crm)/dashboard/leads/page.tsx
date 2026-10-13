import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LeadFilters } from "@/components/crm/lead-filters";
import { LeadTable } from "@/components/crm/lead-table";
import { ListingsEmptyState } from "@/components/property/listings-empty-state";
import { buttonClasses } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import { interpolate, type Dictionary } from "@/i18n/dictionaries";
import { getDictionary, getLocale } from "@/i18n/server";
import { canAssignLeads } from "@/lib/crm/permissions";
import { currentTimeMs } from "@/lib/crm/time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  hasLeadFilters,
  parseLeadSearch,
  toLeadQuery,
} from "@/lib/validation/lead-search";
import { requireRole } from "@/server/auth/admin-access";
import { dashboardPath } from "@/server/auth/constants";
import { listAgents, searchLeads } from "@/server/crm/queries";

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary();
  return { title: dict.crm.leads.title };
}

async function LeadsContent({
  searchParams,
  locale,
  dict,
}: {
  searchParams: PageProps<"/[locale]/dashboard/leads">["searchParams"];
  locale: Locale;
  dict: Dictionary;
}) {
  // Pages check access themselves; the layout check alone is not enough.
  const access = await requireRole("super_admin", "manager", "agent");
  const criteria = parseLeadSearch(await searchParams);
  const client = await createSupabaseServerClient();
  const t = dict.crm.leads;
  const manager = canAssignLeads(access.role);

  const [result, agents] = await Promise.all([
    searchLeads(client, criteria),
    manager ? listAgents(client) : Promise.resolve([]),
  ]);

  const base = dashboardPath(locale, "/leads");
  const hrefFor = (page: number) => {
    const query = toLeadQuery(criteria, { page });
    return query ? `${base}?${query}` : base;
  };

  return (
    <div className="space-y-6">
      <LeadFilters
        action={base}
        criteria={criteria}
        dict={dict}
        agents={agents}
        showAgentFilter={manager}
      />

      {!result.ok ? (
        <div role="alert">
          <ListingsEmptyState
            headingLevel="h2"
            title={dict.crm.common.errorTitle}
            body={dict.crm.common.errorBody}
            ctaLabel={dict.crm.common.tryAgain}
            ctaHref={hrefFor(criteria.page)}
          />
        </div>
      ) : result.data.total === 0 ? (
        hasLeadFilters(criteria) ? (
          <ListingsEmptyState
            headingLevel="h2"
            title={t.emptyTitle}
            body={t.emptyBody}
            ctaLabel={dict.crm.common.reset}
            ctaHref={base}
          />
        ) : (
          <ListingsEmptyState headingLevel="h2" title={t.emptyNoneTitle} body={t.emptyNoneBody} />
        )
      ) : (
        <>
          <p className="text-sm font-semibold text-ink-soft" aria-live="polite">
            {result.data.total === 1
              ? t.resultsOne
              : interpolate(t.resultsMany, { count: result.data.total })}
          </p>
          <LeadTable rows={result.data.items} locale={locale} dict={dict} now={currentTimeMs()} />
          {result.data.pageCount > 1 ? (
            <nav
              aria-label={dict.crm.common.pagination}
              className="flex items-center justify-between gap-4"
            >
              {result.data.page > 1 ? (
                <Link
                  href={hrefFor(result.data.page - 1)}
                  rel="prev"
                  className={buttonClasses({ variant: "secondary" })}
                >
                  {dict.crm.common.previous}
                </Link>
              ) : (
                <span aria-disabled="true" className={buttonClasses({ variant: "secondary", className: "pointer-events-none opacity-50" })}>
                  {dict.crm.common.previous}
                </span>
              )}
              <p className="text-sm font-medium text-ink-soft tabular-nums">
                {interpolate(dict.crm.common.pageOf, {
                  page: result.data.page,
                  total: result.data.pageCount,
                })}
              </p>
              {result.data.page < result.data.pageCount ? (
                <Link
                  href={hrefFor(result.data.page + 1)}
                  rel="next"
                  className={buttonClasses({ variant: "secondary" })}
                >
                  {dict.crm.common.next}
                </Link>
              ) : (
                <span aria-disabled="true" className={buttonClasses({ variant: "secondary", className: "pointer-events-none opacity-50" })}>
                  {dict.crm.common.next}
                </span>
              )}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}

export default async function LeadsPage({ searchParams }: PageProps<"/[locale]/dashboard/leads">) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">{dict.crm.leads.title}</h1>
      <p className="mt-1 mb-6 text-muted">{dict.crm.leads.intro}</p>
      <Suspense fallback={<p className="text-sm text-muted">{dict.crm.common.loading}</p>}>
        <LeadsContent searchParams={searchParams} locale={locale} dict={dict} />
      </Suspense>
    </>
  );
}
