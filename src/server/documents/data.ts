import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locale } from "@/i18n/config";
import type { Database } from "@/types/database";
import type { DocumentType } from "./catalog";

/** Records needed to print each document. Loaded with the caller's session, so RLS applies. */
export type DocClient = SupabaseClient<Database>;

type Tables = Database["public"]["Tables"];
type Views = Database["public"]["Views"];

export interface StaffMap {
  get(id: string | null | undefined): string | undefined;
}

async function names(client: DocClient, ids: Array<string | null | undefined>): Promise<StaffMap> {
  const unique = [...new Set(ids.filter((v): v is string => Boolean(v)))];
  const map = new Map<string, string>();
  if (unique.length > 0) {
    const { data } = await client.from("staff_names").select("id, full_name").in("id", unique);
    for (const r of data ?? []) if (r.id && r.full_name) map.set(r.id, r.full_name);
  }
  return { get: (id) => (id ? map.get(id) : undefined) };
}

export interface ListingData {
  kind: "listing_sheet";
  property: Tables["properties"]["Row"];
  title: string | null;
  description: string | null;
  amenities: string[];
  /** Language the text came from. */
  textLocale: Locale | null;
}
export interface InquiryData {
  kind: "inquiry_summary";
  lead: Tables["leads"]["Row"];
  propertyReference: string | null;
  agentName: string | null;
  history: Array<{ at: string; from: string | null; to: string | null; by: string | null }>;
}
export interface ViewingData {
  kind: "viewing_confirmation";
  viewing: Tables["viewing_appointments"]["Row"];
  customerName: string | null;
  propertyReference: string | null;
  propertyArea: string | null;
  agentName: string | null;
}
export interface DealData {
  kind: "deal_summary";
  deal: Tables["rental_deals"]["Row"];
  customerName: string | null;
  landlordName: string | null;
  agentName: string | null;
  propertyReference: string | null;
  expectedCommissionMinor: number | null;
}
export interface CommissionData {
  kind: "commission_statement";
  balance: Views["commission_balances"]["Row"];
  entries: Tables["commission_transactions"]["Row"][];
  staff: StaffMap;
}
export interface PayoutData {
  kind: "payout_statement";
  deal: Tables["rental_deals"]["Row"];
  customerName: string | null;
  agentName: string | null;
  propertyReference: string | null;
  financials: Views["deal_financials"]["Row"] | null;
  payouts: Tables["agent_payouts"]["Row"][];
}
export interface SubmissionData {
  kind: "landlord_submission";
  submission: Tables["landlord_submissions"]["Row"];
}
export interface AgreementData {
  kind: "agreement_draft";
  deal: Tables["rental_deals"]["Row"];
  customerName: string | null;
  landlordName: string | null;
  agentName: string | null;
  propertyReference: string | null;
}
export type DocumentData =
  | ListingData
  | InquiryData
  | ViewingData
  | DealData
  | CommissionData
  | PayoutData
  | SubmissionData
  | AgreementData;

const FALLBACK: Locale[] = ["en", "km", "zh"];

export async function loadDocumentData(
  client: DocClient,
  type: DocumentType,
  id: string,
  locale: Locale,
  canSeeAgencyCommission: boolean,
): Promise<DocumentData | null> {
  switch (type) {
    case "listing_sheet": {
      const { data: property } = await client.from("properties").select("*").eq("id", id).maybeSingle();
      if (!property) return null;
      const { data: translations } = await client
        .from("property_translations")
        .select("locale, title, description, amenities")
        .eq("property_id", id);
      const order = [locale, ...FALLBACK.filter((l) => l !== locale)];
      const pick = order.map((l) => translations?.find((t) => t.locale === l)).find(Boolean);
      return {
        kind: type,
        property,
        title: pick?.title ?? null,
        description: pick?.description?.trim() ? pick.description : null,
        amenities: pick?.amenities ?? [],
        textLocale: (pick?.locale as Locale | undefined) ?? null,
      };
    }
    case "inquiry_summary": {
      const { data: lead } = await client.from("leads").select("*").eq("id", id).maybeSingle();
      if (!lead) return null;
      const [property, activities] = await Promise.all([
        lead.property_id
          ? client.from("properties").select("listing_code").eq("id", lead.property_id).maybeSingle()
          : Promise.resolve({ data: null }),
        client
          .from("lead_activities")
          .select("created_at, from_stage, to_stage, performed_by")
          .eq("lead_id", id)
          .eq("activity_type", "stage_change")
          .order("created_at", { ascending: false })
          .limit(15),
      ]);
      const staff = await names(client, [lead.assigned_agent_id, ...(activities.data ?? []).map((a) => a.performed_by)]);
      return {
        kind: type,
        lead,
        propertyReference: property.data?.listing_code ?? null,
        agentName: staff.get(lead.assigned_agent_id) ?? null,
        history: (activities.data ?? []).map((a) => ({
          at: a.created_at,
          from: a.from_stage,
          to: a.to_stage,
          by: staff.get(a.performed_by) ?? null,
        })),
      };
    }
    case "viewing_confirmation": {
      const { data: viewing } = await client.from("viewing_appointments").select("*").eq("id", id).maybeSingle();
      if (!viewing) return null;
      const [lead, property] = await Promise.all([
        client.from("leads").select("customer_name").eq("id", viewing.lead_id).maybeSingle(),
        client
          .from("properties")
          .select("listing_code, district, neighborhood, city")
          .eq("id", viewing.property_id)
          .maybeSingle(),
      ]);
      const staff = await names(client, [viewing.agent_id]);
      const p = property.data;
      return {
        kind: type,
        viewing,
        customerName: lead.data?.customer_name ?? null,
        propertyReference: p?.listing_code ?? null,
        propertyArea: p ? ([p.neighborhood, p.district].filter(Boolean).join(", ") || p.city) : null,
        agentName: staff.get(viewing.agent_id) ?? null,
      };
    }
    case "deal_summary":
    case "agreement_draft": {
      const { data: deal } = await client.from("rental_deals").select("*").eq("id", id).maybeSingle();
      if (!deal) return null;
      const { data: overview } = await client
        .from("deal_overview")
        .select("customer_name, landlord_name, agent_name, property_reference")
        .eq("id", id)
        .maybeSingle();
      const base = {
        deal,
        customerName: overview?.customer_name ?? null,
        landlordName: overview?.landlord_name ?? null,
        agentName: overview?.agent_name ?? null,
        propertyReference: overview?.property_reference ?? null,
      };
      if (type === "agreement_draft") return { kind: type, ...base };
      return {
        kind: type,
        ...base,
        expectedCommissionMinor:
          canSeeAgencyCommission && deal.commission_expected_minor !== null
            ? Number(deal.commission_expected_minor)
            : null,
      };
    }
    case "commission_statement": {
      const [balance, entries] = await Promise.all([
        client.from("commission_balances").select("*").eq("commission_id", id).maybeSingle(),
        client
          .from("commission_transactions")
          .select("*")
          .eq("commission_id", id)
          .order("occurred_on")
          .order("created_at"),
      ]);
      if (!balance.data) return null;
      const staff = await names(client, (entries.data ?? []).map((e) => e.recorded_by));
      return { kind: type, balance: balance.data, entries: entries.data ?? [], staff };
    }
    case "payout_statement": {
      const { data: deal } = await client.from("rental_deals").select("*").eq("id", id).maybeSingle();
      if (!deal) return null;
      const [overview, financials, payouts] = await Promise.all([
        client.from("deal_overview").select("customer_name, agent_name, property_reference").eq("id", id).maybeSingle(),
        client.from("deal_financials").select("*").eq("deal_id", id).maybeSingle(),
        client.from("agent_payouts").select("*").eq("deal_id", id).order("created_at"),
      ]);
      return {
        kind: type,
        deal,
        customerName: overview.data?.customer_name ?? null,
        agentName: overview.data?.agent_name ?? null,
        propertyReference: overview.data?.property_reference ?? null,
        financials: financials.data ?? null,
        payouts: payouts.data ?? [],
      };
    }
    case "landlord_submission": {
      const { data } = await client.from("landlord_submissions").select("*").eq("id", id).maybeSingle();
      return data ? { kind: type, submission: data } : null;
    }
  }
}
