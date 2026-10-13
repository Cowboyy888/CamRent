import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { NewDealForm } from "@/components/finance/fin-forms";
import { emptyDealValues } from "@/lib/finance/deal-form";
import { Panel } from "@/components/crm/panels";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { getDictionary, getLocale } from "@/i18n/server";
import { canViewTeam } from "@/lib/crm/permissions";
import { canWorkDeals } from "@/lib/finance/permissions";
import { minorToMajorString } from "@/lib/finance/money";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dashboardPath } from "@/server/auth/constants";
import { requireCapability } from "@/server/finance/guard";
import { agentOptions, getSettings, landlordOptions, leadOptions } from "@/server/finance/queries";

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary();
  return { title: dict.fin.deals.form.title };
}

async function Content({
  searchParams,
  locale,
  dict,
}: {
  searchParams: PageProps<"/[locale]/dashboard/deals/new">["searchParams"];
  locale: Locale;
  dict: Dictionary;
}) {
  const access = await requireCapability(canWorkDeals);
  const raw = await searchParams;
  const lead = typeof raw.lead === "string" ? raw.lead : "";
  const client = await createSupabaseServerClient();
  const manager = canViewTeam(access.role);

  const [leads, landlords, agents, settings] = await Promise.all([
    leadOptions(client),
    landlordOptions(client),
    manager ? agentOptions(client) : Promise.resolve([]),
    getSettings(client),
  ]);

  // The agency's defaults only pre-fill the form; the deal stores its own copy.
  const initial = { ...emptyDealValues };
  let defaultsApplied = false;
  if (settings?.default_commission_method) {
    initial.commissionMethod = settings.default_commission_method;
    initial.commissionRate = settings.default_commission_rate === null ? "" : String(settings.default_commission_rate);
    initial.commissionFixed = minorToMajorString(settings.default_commission_fixed_minor);
    defaultsApplied = true;
  }
  if (settings && settings.default_agent_share_method !== "none") {
    initial.shareMethod = settings.default_agent_share_method;
    initial.shareRate = settings.default_agent_share_rate === null ? "" : String(settings.default_agent_share_rate);
    initial.shareFixed = minorToMajorString(settings.default_agent_share_fixed_minor);
    defaultsApplied = true;
  }

  return (
    <Panel id="new-deal" title={dict.fin.deals.form.title}>
      <NewDealForm
        locale={locale}
        dict={dict}
        leads={leads}
        landlords={landlords}
        agents={agents}
        canChooseAgent={manager}
        initial={initial}
        defaultsApplied={defaultsApplied}
        defaultLeadId={lead}
      />
    </Panel>
  );
}

export default async function NewDealPage({ searchParams }: PageProps<"/[locale]/dashboard/deals/new">) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  return (
    <>
      <Link href={dashboardPath(locale, "/deals")} className="text-sm font-semibold text-mekong-700 hover:underline">
        ← {dict.fin.deals.detail.back}
      </Link>
      <h1 className="mt-3 mb-6 text-2xl font-bold tracking-tight">{dict.fin.deals.form.title}</h1>
      <Suspense fallback={<p className="text-sm text-muted">{dict.fin.common.loading}</p>}>
        <Content searchParams={searchParams} locale={locale} dict={dict} />
      </Suspense>
    </>
  );
}
