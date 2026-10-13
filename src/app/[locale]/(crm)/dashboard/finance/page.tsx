import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyNote, Panel } from "@/components/crm/panels";
import { Amount, auditDetail, DataTable } from "@/components/finance/bits";
import { SettingsForm } from "@/components/finance/fin-forms";
import { ListingsEmptyState } from "@/components/property/listings-empty-state";
import { buttonClasses } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import type { Locale } from "@/i18n/config";
import { interpolate, type Dictionary } from "@/i18n/dictionaries";
import { getDictionary, getLocale } from "@/i18n/server";
import { phnomPenhRanges } from "@/lib/crm/time";
import { minorToMajorString } from "@/lib/finance/money";
import {
  canEditFinanceSettings,
  canExport,
  canViewAudit,
  canViewFinance,
  exportReports,
} from "@/lib/finance/permissions";
import { formatDate, formatDateTime } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dashboardPath } from "@/server/auth/constants";
import { requireCapability } from "@/server/finance/guard";
import { getFinanceReport, getSettings, recentAudit, type CurrencyReport } from "@/server/finance/queries";

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary();
  return { title: dict.fin.finance.title };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const date = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

async function Content({
  searchParams,
  locale,
  dict,
}: {
  searchParams: PageProps<"/[locale]/dashboard/finance">["searchParams"];
  locale: Locale;
  dict: Dictionary;
}) {
  const access = await requireCapability(canViewFinance);
  const raw = await searchParams;
  const ranges = phnomPenhRanges(new Date());
  let from = date(one(raw.from)) ?? ranges.thisMonth.from;
  let to = date(one(raw.to)) ?? ranges.thisMonth.to;
  if (from > to) [from, to] = [to, from];

  const client = await createSupabaseServerClient();
  const [report, settings, audit] = await Promise.all([
    getFinanceReport(client, from, to),
    getSettings(client),
    canViewAudit(access.role) ? recentAudit(client) : Promise.resolve([]),
  ]);
  const t = dict.fin.finance;
  const base = dashboardPath(locale, "/finance");
  const rangeLink = (r: { from: string; to: string }) => `${base}?from=${r.from}&to=${r.to}`;

  const metricRows: Array<{
    key: keyof typeof t.metrics;
    field: Exclude<keyof CurrencyReport, "currency">;
    emphasis?: boolean;
  }> = [
    { key: "expected", field: "expected" },
    { key: "earned", field: "earned" },
    { key: "collected", field: "collected" },
    { key: "outstanding", field: "outstanding" },
    { key: "overdue", field: "overdue" },
    { key: "writtenOff", field: "writtenOff" },
    { key: "payoutsPaid", field: "payoutsPaid" },
    { key: "payoutsOutstanding", field: "payoutsOutstanding" },
    { key: "expensesApproved", field: "expensesApproved" },
    { key: "expensesPending", field: "expensesPending" },
    { key: "cashIn", field: "cashIn" },
    { key: "cashOut", field: "cashOut" },
    { key: "net", field: "net", emphasis: true },
  ];

  return (
    <div className="space-y-8">
      <form action={base} method="get" className="flex flex-wrap items-end gap-4 rounded-card border border-sand-200 bg-white p-4">
        <Field id="fr-from" label={t.range.from}>
          <Input id="fr-from" name="from" type="date" defaultValue={from} />
        </Field>
        <Field id="fr-to" label={t.range.to}>
          <Input id="fr-to" name="to" type="date" defaultValue={to} />
        </Field>
        <button type="submit" className={buttonClasses({})}>{t.range.apply}</button>
        <nav className="flex flex-wrap gap-3 text-sm font-semibold">
          <Link className="text-mekong-700 hover:underline" href={rangeLink(ranges.thisMonth)}>{t.range.thisMonth}</Link>
          <Link className="text-mekong-700 hover:underline" href={rangeLink(ranges.lastMonth)}>{t.range.lastMonth}</Link>
          <Link className="text-mekong-700 hover:underline" href={rangeLink(ranges.year)}>{t.range.year}</Link>
        </nav>
      </form>
      <p className="text-sm text-muted">
        {formatDate(from, locale)} – {formatDate(to, locale)}
      </p>

      {!report.ok ? (
        <div role="alert">
          <ListingsEmptyState headingLevel="h2" title={dict.fin.common.errorTitle} body={dict.fin.common.errorBody} />
        </div>
      ) : (
        <>
          {report.data.byCurrency.map((c) => (
            <section key={c.currency} aria-labelledby={`cur-${c.currency}`}>
              <h2 id={`cur-${c.currency}`} className="text-lg font-bold">
                {interpolate(t.currencyHeading, { currency: c.currency })}
              </h2>
              <dl className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {metricRows.map((m) => (
                  <div
                    key={m.key}
                    className={`rounded-card border bg-white p-4 ${m.emphasis ? "border-mekong-500" : "border-sand-200"}`}
                  >
                    <dt className="text-sm font-semibold text-ink-soft">{t.metrics[m.key]}</dt>
                    <dd className="mt-1 text-xl font-extrabold">
                      <Amount minor={c[m.field]} currency={c.currency} />
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}

          <details className="rounded-card border border-sand-200 bg-white p-4">
            <summary className="cursor-pointer text-sm font-bold">{t.definitions.title}</summary>
            <dl className="mt-3 space-y-2 text-sm">
              {metricRows.map((m) => (
                <div key={m.key}>
                  <dt className="font-semibold">{t.metrics[m.key]}</dt>
                  <dd className="text-ink-soft">{t.definitions[m.key]}</dd>
                </div>
              ))}
            </dl>
          </details>

          <div className="grid gap-6 xl:grid-cols-3">
            <Panel id="by-month" title={t.sections.dealsByMonth}>
              {report.data.dealsByMonth.length === 0 ? (
                <EmptyNote>{t.empty}</EmptyNote>
              ) : (
                <DataTable compact head={[t.month, t.deals]}>
                  {report.data.dealsByMonth.map((m) => (
                    <tr key={m.month}>
                      <td className="px-4 py-2">{m.month}</td>
                      <td className="px-4 py-2 tabular-nums">{m.deals}</td>
                    </tr>
                  ))}
                </DataTable>
              )}
            </Panel>
            <Panel id="by-agent" title={t.sections.byAgent}>
              {report.data.revenueByAgent.length === 0 ? (
                <EmptyNote>{t.empty}</EmptyNote>
              ) : (
                <DataTable compact head={[dict.fin.common.agent, dict.fin.common.amount]}>
                  {report.data.revenueByAgent.map((a) => (
                    <tr key={`${a.agentId}-${a.currency}`}>
                      <td className="px-4 py-2">{a.name ?? dict.crm.common.staffMember}</td>
                      <td className="px-4 py-2"><Amount minor={a.collected} currency={a.currency} /></td>
                    </tr>
                  ))}
                </DataTable>
              )}
            </Panel>
            <Panel id="by-type" title={t.sections.byType}>
              {report.data.revenueByType.length === 0 ? (
                <EmptyNote>{t.empty}</EmptyNote>
              ) : (
                <DataTable compact head={[dict.fin.common.property, dict.fin.common.amount]}>
                  {report.data.revenueByType.map((r) => (
                    <tr key={`${r.propertyType}-${r.currency}`}>
                      <td className="px-4 py-2">
                        {r.propertyType
                          ? dict.propertyTypes[r.propertyType as keyof typeof dict.propertyTypes]
                          : t.unknownType}
                      </td>
                      <td className="px-4 py-2"><Amount minor={r.collected} currency={r.currency} /></td>
                    </tr>
                  ))}
                </DataTable>
              )}
            </Panel>
          </div>
        </>
      )}

      <Panel id="exports" title={t.sections.exports}>
        <ul className="flex flex-wrap gap-3">
          {exportReports
            .filter((r) => canExport(access.role, r))
            .map((r) => (
              <li key={r}>
                <a
                  className={buttonClasses({ variant: "secondary" })}
                  href={`${dashboardPath(locale, "/finance/export")}?report=${r}&from=${from}&to=${to}`}
                >
                  {t.export[r]}
                </a>
              </li>
            ))}
        </ul>
      </Panel>

      <Panel id="settings" title={t.sections.settings}>
        <SettingsForm
          locale={locale}
          dict={dict}
          editable={canEditFinanceSettings(access.role)}
          values={{
            earnedRule: settings?.commission_earned_rule ?? "on_closed_won",
            payoutRule: settings?.payout_eligibility_rule ?? "on_collected",
            defaultMethod: settings?.default_commission_method ?? "",
            defaultRate: settings?.default_commission_rate === null || settings?.default_commission_rate === undefined ? "" : String(settings.default_commission_rate),
            defaultFixed: minorToMajorString(settings?.default_commission_fixed_minor),
            defaultShareMethod: settings?.default_agent_share_method ?? "none",
            defaultShareRate: settings?.default_agent_share_rate === null || settings?.default_agent_share_rate === undefined ? "" : String(settings.default_agent_share_rate),
            defaultShareFixed: minorToMajorString(settings?.default_agent_share_fixed_minor),
          }}
        />
      </Panel>

      {audit.length > 0 ? (
        <Panel id="audit" title={t.sections.audit}>
          <DataTable head={[t.audit.when, t.audit.who, t.audit.what, t.audit.reason]}>
            {audit.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-2 whitespace-nowrap">{formatDateTime(a.occurred_at, locale)}</td>
                <td className="px-4 py-2">{a.actorName ?? (a.actor_id ? dict.crm.common.staffMember : t.audit.system)}</td>
                <td className="px-4 py-2">
                  {t.audit.actions[a.action as "insert" | "update" | "export"] ?? a.action} · {a.entity_type}
                  {auditDetail(a, dict) ? ` → ${auditDetail(a, dict)}` : ""}
                </td>
                <td className="px-4 py-2 text-ink-soft">{a.reason ?? ""}</td>
              </tr>
            ))}
          </DataTable>
        </Panel>
      ) : null}
    </div>
  );
}

export default async function FinancePage({ searchParams }: PageProps<"/[locale]/dashboard/finance">) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">{dict.fin.finance.title}</h1>
      <p className="mt-1 mb-6 max-w-2xl text-muted">{dict.fin.finance.intro}</p>
      <Suspense fallback={<p className="text-sm text-muted">{dict.fin.common.loading}</p>}>
        <Content searchParams={searchParams} locale={locale} dict={dict} />
      </Suspense>
    </>
  );
}
