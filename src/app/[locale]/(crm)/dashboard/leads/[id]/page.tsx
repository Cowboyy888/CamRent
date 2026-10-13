import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { describeActivity } from "@/components/crm/activity-text";
import {
  AssignForm,
  LeadDetailsForm,
  NoteForm,
  StageForm,
  ViewingForm,
} from "@/components/crm/lead-forms";
import { EmptyNote, Panel } from "@/components/crm/panels";
import { StageBadge } from "@/components/crm/stage-badge";
import { DocumentLinks } from "@/components/ops/document-links";
import { Badge } from "@/components/ui/badge";
import { ListingsEmptyState } from "@/components/property/listings-empty-state";
import type { Locale } from "@/i18n/config";
import { interpolate, type Dictionary } from "@/i18n/dictionaries";
import { getDictionary, getLocale } from "@/i18n/server";
import { canAssignLeads } from "@/lib/crm/permissions";
import { toPhnomPenhInputValue } from "@/lib/crm/time";
import { formatDateTime } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/server/auth/admin-access";
import { dashboardPath } from "@/server/auth/constants";
import { getLeadDetail, listAgents } from "@/server/crm/queries";

type Props = PageProps<"/[locale]/dashboard/leads/[id]">;

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary();
  return { title: dict.crm.leads.title };
}

const minorToWhole = (minor: number | string | null): string =>
  minor === null ? "" : String(Math.round(Number(minor) / 100));

async function LeadContent({
  params,
  locale,
  dict,
}: {
  params: Props["params"];
  locale: Locale;
  dict: Dictionary;
}) {
  const access = await requireRole("super_admin", "manager", "agent");
  const { id } = await params;
  const client = await createSupabaseServerClient();
  const t = dict.crm.lead;
  const backHref = dashboardPath(locale, "/leads");

  const result = await getLeadDetail(client, id);
  if (result.status !== "ok") {
    const missing = result.status === "notFound";
    return (
      <div role={missing ? undefined : "alert"}>
        <ListingsEmptyState
          headingLevel="h2"
          title={missing ? t.errors.notFound : dict.crm.common.errorTitle}
          body={missing ? "" : dict.crm.common.errorBody}
          ctaLabel={t.back}
          ctaHref={backHref}
        />
      </div>
    );
  }

  const { lead, activities, viewings, propertyReference, agentName } = result.detail;
  const manager = canAssignLeads(access.role);
  const agents = manager ? await listAgents(client) : [];

  return (
    <div className="space-y-6">
      <div>
        <Link href={backHref} className="text-sm font-semibold text-mekong-700 hover:underline">
          ← {t.back}
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{lead.customer_name}</h1>
          <StageBadge stage={lead.stage} dict={dict} />
          {lead.sla_breached_at ? (
            <Badge tone="danger" title={dict.ops.tasks.slaBreachedHint}>
              {dict.ops.tasks.slaBreached}
            </Badge>
          ) : null}
        </div>
        <DocumentLinks role={access.role} locale={locale} dict={dict} entityId={lead.id} types={["inquiry_summary"]} />
        <p className="mt-1 text-sm text-muted">
          {interpolate(t.received, { date: formatDateTime(lead.created_at, locale) })}
          {" · "}
          {interpolate(t.updated, { date: formatDateTime(lead.updated_at, locale) })}
          {" · "}
          {t.source}: {dict.crm.sources[lead.source]}
          {lead.campaign ? ` (${lead.campaign})` : ""}
          {propertyReference ? ` · ${propertyReference}` : ""}
        </p>
      </div>

      {lead.enquiry_message ? (
        <Panel id="customer-message" title={t.customerMessage}>
          <p className="max-w-prose whitespace-pre-line text-[0.9375rem]">{lead.enquiry_message}</p>
        </Panel>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Panel id="details" title={`${t.sections.contact} · ${t.sections.requirements}`}>
            <LeadDetailsForm
              id={lead.id}
              locale={locale}
              dict={dict}
              values={{
                name: lead.customer_name,
                phone: lead.phone ?? "",
                email: lead.email ?? "",
                language: lead.preferred_language,
                area: lead.preferred_area ?? "",
                category: lead.property_category ?? "",
                bedrooms: lead.bedrooms_wanted === null ? "" : String(lead.bedrooms_wanted),
                budgetMin: minorToWhole(lead.budget_min_minor),
                budgetMax: minorToWhole(lead.budget_max_minor),
                currency: lead.currency,
                moveIn: lead.desired_move_in ?? "",
                period: lead.rental_period_months === null ? "" : String(lead.rental_period_months),
                requirements: lead.requirements_notes ?? "",
                followUp: toPhnomPenhInputValue(lead.next_follow_up_at),
              }}
            />
          </Panel>

          <Panel id="history" title={t.sections.history}>
            {activities.length === 0 ? (
              <EmptyNote>{t.noHistory}</EmptyNote>
            ) : (
              <ol className="space-y-4 border-l-2 border-sand-200 pl-4">
                {activities.map((item) => (
                  <li key={item.id}>
                    <p className="text-sm font-semibold">{describeActivity(item, dict, locale)}</p>
                    {item.type === "note" || item.type === "stage_change" ? (
                      item.notes ? (
                        <p className="mt-1 max-w-prose whitespace-pre-line text-sm text-ink-soft">
                          {item.notes}
                        </p>
                      ) : null
                    ) : null}
                    <p className="mt-0.5 text-xs text-muted">
                      {formatDateTime(item.createdAt, locale)}
                      {" · "}
                      {interpolate(t.history.by, {
                        name: item.by ?? dict.crm.common.staffMember,
                      })}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel id="status" title={t.sections.status}>
            <StageForm
              id={lead.id}
              locale={locale}
              dict={dict}
              stage={lead.stage}
              reason={lead.lost_reason ?? ""}
            />
          </Panel>

          <Panel id="assignment" title={t.sections.assignment}>
            {manager ? (
              <AssignForm
                id={lead.id}
                locale={locale}
                dict={dict}
                agents={agents}
                current={lead.assigned_agent_id}
              />
            ) : (
              <p className="text-sm">
                {interpolate(t.assignmentReadOnly, {
                  name: agentName ?? dict.crm.common.unassigned,
                })}
              </p>
            )}
          </Panel>

          <Panel id="notes" title={t.sections.notes}>
            <NoteForm id={lead.id} locale={locale} dict={dict} />
          </Panel>

          <Panel id="viewings" title={t.sections.viewings}>
            {viewings.length === 0 ? (
              <EmptyNote>{t.noViewings}</EmptyNote>
            ) : (
              <ul className="mb-5 divide-y divide-sand-200 text-sm">
                {viewings.map((v) => (
                  <li key={v.id} className="py-2">
                    <p className="font-semibold">{formatDateTime(v.scheduledAt, locale)}</p>
                    <p className="text-ink-soft">
                      {t.viewingStatus[v.status]}
                      {v.propertyReference ? ` · ${v.propertyReference}` : ""}
                      {v.agentName ? ` · ${v.agentName}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <h3 className="mt-4 mb-3 text-sm font-bold">{t.sections.viewing}</h3>
            <ViewingForm
              id={lead.id}
              locale={locale}
              dict={dict}
              hasProperty={lead.property_id !== null}
            />
          </Panel>
        </div>
      </div>
    </div>
  );
}

export default async function LeadDetailPage({ params }: Props) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  return (
    <Suspense fallback={<p className="text-sm text-muted">{dict.crm.common.loading}</p>}>
      <LeadContent params={params} locale={locale} dict={dict} />
    </Suspense>
  );
}
