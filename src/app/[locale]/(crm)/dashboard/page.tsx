import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { describeActivity } from "@/components/crm/activity-text";
import { EmptyNote, Panel, StatCard } from "@/components/crm/panels";
import { StageBadge } from "@/components/crm/stage-badge";
import type { Locale } from "@/i18n/config";
import { interpolate, type Dictionary } from "@/i18n/dictionaries";
import { getDictionary, getLocale } from "@/i18n/server";
import { canViewDeals, canViewLeads } from "@/lib/crm/permissions";
import { phnomPenhDayBounds, phnomPenhMonthBounds } from "@/lib/crm/time";
import { formatDateTime, formatMoney } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminAccess } from "@/server/auth/admin-access";
import { dashboardPath } from "@/server/auth/constants";
import {
  getAgentPerformance,
  getDashboardSummary,
  getOverdueFollowUps,
  getRecentActivity,
  getRecentInquiries,
  getUpcomingViewings,
  type Result,
} from "@/server/crm/queries";
import { countOverdueTasks } from "@/server/ops/queries";
import type { Money } from "@/types/property";

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary();
  return { title: dict.crm.dashboard.title };
}

function MoneyLines({ amounts, empty }: { amounts: Money[]; empty: string }) {
  if (amounts.length === 0) return <span className="text-base font-semibold text-muted">{empty}</span>;
  return (
    <ul className="space-y-0.5 text-xl">
      {amounts.map((m) => (
        <li key={m.currency}>{formatMoney(m)}</li>
      ))}
    </ul>
  );
}

function SectionError({ dict }: { dict: Dictionary }) {
  return (
    <p role="alert" className="text-sm text-danger">
      {dict.crm.common.errorTitle}
    </p>
  );
}

function unwrap<T>(result: Result<T> | undefined): T | null {
  return result && result.ok ? result.data : null;
}

async function DashboardContent({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const access = await requireAdminAccess();
  const t = dict.crm.dashboard;
  const role = access.role;
  const client = await createSupabaseServerClient();

  const showLeads = canViewLeads(role);
  const showDeals = canViewDeals(role) || role === "agent";
  const showMoney = canViewDeals(role);

  if (!showLeads && !showDeals) {
    return (
      <Panel id="no-access" title={t.noAccessTitle}>
        <EmptyNote>{t.noAccessBody}</EmptyNote>
      </Panel>
    );
  }

  const now = new Date();
  const day = phnomPenhDayBounds(now);
  const month = phnomPenhMonthBounds(now);

  const [summary, inquiries, viewings, followUps, performance, activity] = await Promise.all([
    getDashboardSummary(client, day, month),
    showLeads ? getRecentInquiries(client) : undefined,
    showLeads ? getUpcomingViewings(client, now) : undefined,
    showLeads ? getOverdueFollowUps(client, now) : undefined,
    showLeads ? getAgentPerformance(client, month) : undefined,
    showLeads ? getRecentActivity(client) : undefined,
  ]);

  const s = unwrap(summary);
  const leadsHref = dashboardPath(locale, "/leads");

  const overdueTasks = await countOverdueTasks(client, access.userId, now);

  return (
    <div className="space-y-8">
      {overdueTasks > 0 ? (
        <p
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-control bg-warning-50 p-3 text-sm font-semibold text-warning"
        >
          {overdueTasks === 1
            ? dict.ops.tasks.overdueBannerOne
            : interpolate(dict.ops.tasks.overdueBanner, { count: String(overdueTasks) })}
          <Link href={dashboardPath(locale, "/tasks")} className="underline">
            {dict.ops.tasks.viewTasks}
          </Link>
        </p>
      ) : null}
      {s === null ? (
        <SectionError dict={dict} />
      ) : (
        <section aria-label={t.title} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {showLeads ? (
            <>
              <StatCard label={t.stats.activeLeads} value={s.activeLeads} hint={t.hints.activeLeads} />
              <StatCard label={t.stats.newToday} value={s.newToday} hint={t.hints.newToday} />
              <StatCard label={t.stats.followUpsDue} value={s.followUpsDue} hint={t.hints.followUpsDue} />
              <StatCard label={t.stats.viewingsToday} value={s.viewingsToday} hint={t.hints.viewingsToday} />
            </>
          ) : null}
          {showDeals ? (
            <>
              <StatCard label={t.stats.dealsNegotiation} value={s.dealsNegotiation} hint={t.hints.dealsNegotiation} />
              <StatCard label={t.stats.dealsClosedMonth} value={s.dealsClosedMonth} hint={t.hints.dealsClosedMonth} />
            </>
          ) : null}
          {showMoney ? (
            <>
              <StatCard
                label={t.stats.commissionEarned}
                value={<MoneyLines amounts={s.commissionEarned} empty={t.noCommission} />}
                hint={t.hints.commissionEarned}
              />
              <StatCard
                label={t.stats.commissionOutstanding}
                value={<MoneyLines amounts={s.commissionOutstanding} empty={t.noCommission} />}
                hint={t.hints.commissionOutstanding}
              />
            </>
          ) : null}
        </section>
      )}

      {showLeads ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <Panel
            id="recent-inquiries"
            title={t.sections.recentInquiries}
            action={
              <Link href={leadsHref} className="text-sm font-semibold text-mekong-700 hover:underline">
                {t.viewAllLeads}
              </Link>
            }
          >
            {unwrap(inquiries) === null ? (
              <SectionError dict={dict} />
            ) : unwrap(inquiries)!.length === 0 ? (
              <EmptyNote>{t.empty.inquiries}</EmptyNote>
            ) : (
              <ul className="divide-y divide-sand-200">
                {unwrap(inquiries)!.map((lead) => (
                  <li key={lead.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <Link
                        href={dashboardPath(locale, `/leads/${lead.id}`)}
                        className="block truncate font-semibold text-mekong-700 hover:underline"
                      >
                        {lead.customerName}
                      </Link>
                      <p className="text-xs text-muted">
                        {formatDateTime(lead.createdAt, locale)}
                        {lead.propertyReference ? ` · ${lead.propertyReference}` : ""}
                      </p>
                    </div>
                    <StageBadge stage={lead.stage} dict={dict} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel id="upcoming-viewings" title={t.sections.upcomingViewings}>
            {unwrap(viewings) === null ? (
              <SectionError dict={dict} />
            ) : unwrap(viewings)!.length === 0 ? (
              <EmptyNote>{t.empty.viewings}</EmptyNote>
            ) : (
              <ul className="divide-y divide-sand-200">
                {unwrap(viewings)!.map((v) => (
                  <li key={v.id} className="py-2.5">
                    <p className="font-semibold">{formatDateTime(v.scheduledAt, locale)}</p>
                    <p className="text-sm text-ink-soft">
                      <Link
                        href={dashboardPath(locale, `/leads/${v.leadId}`)}
                        className="text-mekong-700 hover:underline"
                      >
                        {interpolate(t.viewingFor, {
                          customer: v.customerName ?? dict.crm.common.staffMember,
                          reference: v.propertyReference ?? t.noReference,
                        })}
                      </Link>
                      {v.agentName ? ` · ${v.agentName}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel id="overdue-followups" title={t.sections.overdueFollowUps}>
            {unwrap(followUps) === null ? (
              <SectionError dict={dict} />
            ) : unwrap(followUps)!.length === 0 ? (
              <EmptyNote>{t.empty.followUps}</EmptyNote>
            ) : (
              <ul className="divide-y divide-sand-200">
                {unwrap(followUps)!.map((lead) => (
                  <li key={lead.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <Link
                        href={dashboardPath(locale, `/leads/${lead.id}`)}
                        className="block truncate font-semibold text-mekong-700 hover:underline"
                      >
                        {lead.customerName}
                      </Link>
                      <p className="text-xs text-danger">
                        {interpolate(t.due, { date: formatDateTime(lead.nextFollowUpAt!, locale) })}
                      </p>
                    </div>
                    <StageBadge stage={lead.stage} dict={dict} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel id="agent-performance" title={t.sections.agentPerformance}>
            {unwrap(performance) === null ? (
              <SectionError dict={dict} />
            ) : unwrap(performance)!.length === 0 ? (
              <EmptyNote>{t.empty.performance}</EmptyNote>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[28rem] text-left text-sm">
                  <thead className="text-xs tracking-wide text-muted uppercase">
                    <tr>
                      <th scope="col" className="py-2 pr-3 font-semibold">{t.perf.agent}</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">{t.perf.active}</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">{t.perf.received}</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">{t.perf.won}</th>
                      <th scope="col" className="py-2 pl-3 text-right font-semibold">{t.perf.viewings}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sand-200 tabular-nums">
                    {unwrap(performance)!.map((a) => (
                      <tr key={a.agentId}>
                        <th scope="row" className="py-2 pr-3 font-semibold">{a.name}</th>
                        <td className="px-3 py-2 text-right">{a.activeLeads}</td>
                        <td className="px-3 py-2 text-right">{a.received}</td>
                        <td className="px-3 py-2 text-right">{a.won}</td>
                        <td className="py-2 pl-3 text-right">{a.viewingsDone}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel id="recent-activity" title={t.sections.recentActivity} className="xl:col-span-2">
            {unwrap(activity) === null ? (
              <SectionError dict={dict} />
            ) : unwrap(activity)!.length === 0 ? (
              <EmptyNote>{t.empty.activity}</EmptyNote>
            ) : (
              <ul className="divide-y divide-sand-200">
                {unwrap(activity)!.map((item) => (
                  <li key={item.id} className="py-2.5 text-sm">
                    <p>
                      <Link
                        href={dashboardPath(locale, `/leads/${item.leadId}`)}
                        className="font-semibold text-mekong-700 hover:underline"
                      >
                        {item.customerName ?? dict.crm.common.staffMember}
                      </Link>
                      {" — "}
                      {describeActivity(item, dict, locale)}
                    </p>
                    <p className="text-xs text-muted">
                      {formatDateTime(item.createdAt, locale)}
                      {" · "}
                      {interpolate(dict.crm.lead.history.by, {
                        name: item.by ?? dict.crm.common.staffMember,
                      })}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}
    </div>
  );
}

export default async function DashboardPage() {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">{dict.crm.dashboard.title}</h1>
      <p className="mt-1 mb-6 text-muted">{dict.crm.dashboard.intro}</p>
      <Suspense fallback={<p className="text-sm text-muted">{dict.crm.common.loading}</p>}>
        <DashboardContent locale={locale} dict={dict} />
      </Suspense>
    </>
  );
}
