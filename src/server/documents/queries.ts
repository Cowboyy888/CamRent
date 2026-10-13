import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { DocumentType } from "./catalog";

type Client = SupabaseClient<Database>;
export interface Option {
  id: string;
  label: string;
}

const MAX = 100;

/** Records a document of this type could be made from, as the caller may see them. */
export async function listEntities(client: Client, type: DocumentType): Promise<Option[]> {
  switch (type) {
    case "listing_sheet": {
      const { data } = await client
        .from("properties")
        .select("id, listing_code, district")
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(MAX);
      return (data ?? []).map((p) => ({ id: p.id, label: [p.listing_code, p.district].filter(Boolean).join(" · ") }));
    }
    case "inquiry_summary": {
      const { data } = await client
        .from("crm_lead_list")
        .select("id, customer_name, property_reference")
        .order("created_at", { ascending: false })
        .limit(MAX);
      return (data ?? []).flatMap((l) =>
        l.id && l.customer_name
          ? [{ id: l.id, label: [l.customer_name, l.property_reference].filter(Boolean).join(" · ") }]
          : [],
      );
    }
    case "viewing_confirmation": {
      const { data } = await client
        .from("viewing_appointments")
        .select("id, scheduled_at, leads(customer_name), properties(listing_code)")
        .order("scheduled_at", { ascending: false })
        .limit(MAX);
      return (data ?? []).map((v) => ({
        id: v.id,
        label: [v.leads?.customer_name, v.properties?.listing_code, v.scheduled_at.slice(0, 10)]
          .filter(Boolean)
          .join(" · "),
      }));
    }
    case "deal_summary":
    case "agreement_draft":
    case "payout_statement": {
      const { data } = await client
        .from("deal_overview")
        .select("id, customer_name, property_reference, stage")
        .order("created_at", { ascending: false })
        .limit(MAX);
      return (data ?? []).flatMap((d) =>
        d.id ? [{ id: d.id, label: [d.customer_name, d.property_reference].filter(Boolean).join(" · ") }] : [],
      );
    }
    case "commission_statement": {
      const { data } = await client
        .from("commission_balances")
        .select("commission_id, customer_name, property_reference, payer")
        .order("due_date", { ascending: false, nullsFirst: false })
        .limit(MAX);
      return (data ?? []).flatMap((c) =>
        c.commission_id
          ? [{ id: c.commission_id, label: [c.customer_name, c.property_reference, c.payer].filter(Boolean).join(" · ") }]
          : [],
      );
    }
    case "landlord_submission": {
      const { data } = await client
        .from("landlord_submissions")
        .select("id, submitter_name, created_at")
        .order("created_at", { ascending: false })
        .limit(MAX);
      return (data ?? []).map((s) => ({ id: s.id, label: `${s.submitter_name} · ${s.created_at.slice(0, 10)}` }));
    }
  }
}

export async function listRecentDocuments(client: Client, limit = 25) {
  const { data, error } = await client
    .from("generated_documents")
    .select("id, doc_type, reference, locale, storage_path, created_at, generated_by")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return null;
  const ids = [...new Set((data ?? []).map((d) => d.generated_by))];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data: staff } = await client.from("staff_names").select("id, full_name").in("id", ids);
    for (const s of staff ?? []) if (s.id && s.full_name) names.set(s.id, s.full_name);
  }
  return (data ?? []).map((d) => ({ ...d, by: names.get(d.generated_by) ?? null }));
}
