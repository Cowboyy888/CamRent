import type { SupabaseClient } from "@supabase/supabase-js";
import { inactiveStages, type LeadStage } from "@/lib/crm/stages";
import { phnomPenhDateStart } from "@/lib/crm/time";
import { LEADS_PAGE_SIZE, type LeadSearchCriteria } from "@/lib/validation/lead-search";
import type { Database } from "@/types/database";
import type { Money } from "@/types/property";

/**
 * CRM reads. Every function takes the *signed-in user's* client, so Row Level
 * Security decides what comes back (an agent gets only their own leads even
 * if a query asks for more). Callers still check the role first.
 */
export type CrmClient = SupabaseClient<Database>;

export type Result<T> = { ok: true; data: T } | { ok: false };

type LeadListRow = Database["public"]["Views"]["crm_lead_list"]["Row"];

/** A lead-list row with the columns the UI relies on proven non-null. */
export interface LeadListItem {
  id: string;
  customerName: string;
  email: string | null;
  phone: string | null;
  stage: LeadStage;
  agentId: string | null;
  agentName: string | null;
  propertyId: string | null;
  propertyReference: string | null;
  propertyDistrict: string | null;
  preferredArea: string | null;
  nextFollowUpAt: string | null;
  createdAt: string;
  slaBreachedAt: string | null;
}

function toLeadItem(row: LeadListRow): LeadListItem | null {
  if (!row.id || !row.customer_name || !row.stage || !row.created_at) return null;
  return {
    id: row.id,
    customerName: row.customer_name,
    email: row.email,
    phone: row.phone,
    stage: row.stage,
    agentId: row.assigned_agent_id,
    agentName: row.agent_name,
    propertyId: row.property_id,
    propertyReference: row.property_reference,
    propertyDistrict: row.property_district,
    preferredArea: row.preferred_area,
    nextFollowUpAt: row.next_follow_up_at,
    createdAt: row.created_at,
    slaBreachedAt: row.sla_breached_at,
  };
}

const items = (rows: LeadListRow[] | null): LeadListItem[] =>
  (rows ?? []).flatMap((row) => {
    const item = toLeadItem(row);
    return item ? [item] : [];
  });

/**
 * Free text from the URL goes into a PostgREST `or()` filter: keep letters,
 * digits, spaces and a few harmless marks (so e-mail addresses and phone
 * numbers still work); drop wildcards, commas and parentheses.
 */
export function sanitizeSearchTerm(value: string): string {
  return value
    .replace(/[^\p{L}\p{M}\p{N}\s.'@+-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

const ACTIVE_STAGE_LIST = `(${inactiveStages.join(",")})`;

// ---------------------------------------------------------------- staff names

export async function loadStaffNames(
  client: CrmClient,
  staffIds: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const unique = [...new Set(staffIds.filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (unique.length === 0) return names;
  const { data } = await client.from("staff_names").select("id, full_name").in("id", unique);
  for (const row of data ?? []) {
    if (row.id && row.full_name) names.set(row.id, row.full_name);
  }
  return names;
}

export interface AgentOption {
  id: string;
  name: string;
}

/** Active agents, for assignment and filters. */
export async function listAgents(client: CrmClient): Promise<AgentOption[]> {
  const { data } = await client
    .from("staff_names")
    .select("id, full_name")
    .eq("role", "agent")
    .order("full_name");
  return (data ?? []).flatMap((row) =>
    row.id && row.full_name ? [{ id: row.id, name: row.full_name }] : [],
  );
}

// ------------------------------------------------------------------ dashboard

export interface DashboardSummary {
  activeLeads: number;
  newToday: number;
  followUpsDue: number;
  viewingsToday: number;
  dealsNegotiation: number;
  dealsClosedMonth: number;
  commissionEarned: Money[];
  commissionOutstanding: Money[];
}

const count = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const moneyList = (value: unknown): Money[] =>
  Array.isArray(value)
    ? value.flatMap((entry) => {
        const e = entry as { currency?: string; amount_minor?: number | string };
        const amount = Number(e.amount_minor);
        if ((e.currency !== "USD" && e.currency !== "KHR") || !Number.isInteger(amount)) return [];
        return amount === 0 ? [] : [{ amountMinor: amount, currency: e.currency }];
      })
    : [];

export async function getDashboardSummary(
  client: CrmClient,
  day: { start: string; end: string },
  month: { start: string; end: string },
): Promise<Result<DashboardSummary>> {
  const { data, error } = await client.rpc("crm_dashboard_summary", {
    day_start: day.start,
    day_end: day.end,
    month_start: month.start,
    month_end: month.end,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return { ok: false };
  const s = data as Record<string, unknown>;
  return {
    ok: true,
    data: {
      activeLeads: count(s.active_leads),
      newToday: count(s.new_today),
      followUpsDue: count(s.follow_ups_due),
      viewingsToday: count(s.viewings_today),
      dealsNegotiation: count(s.deals_negotiation),
      dealsClosedMonth: count(s.deals_closed_month),
      commissionEarned: moneyList(s.commission_earned),
      commissionOutstanding: moneyList(s.commission_outstanding),
    },
  };
}

export async function getRecentInquiries(client: CrmClient, limit = 8): Promise<Result<LeadListItem[]>> {
  const { data, error } = await client
    .from("crm_lead_list")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return error ? { ok: false } : { ok: true, data: items(data) };
}

export async function getOverdueFollowUps(
  client: CrmClient,
  now: Date,
  limit = 8,
): Promise<Result<LeadListItem[]>> {
  const { data, error } = await client
    .from("crm_lead_list")
    .select("*")
    .not("next_follow_up_at", "is", null)
    .lt("next_follow_up_at", now.toISOString())
    .not("stage", "in", ACTIVE_STAGE_LIST)
    .order("next_follow_up_at", { ascending: true })
    .limit(limit);
  return error ? { ok: false } : { ok: true, data: items(data) };
}

export interface UpcomingViewing {
  id: string;
  scheduledAt: string;
  status: string;
  leadId: string;
  customerName: string | null;
  propertyReference: string | null;
  agentName: string | null;
}

export async function getUpcomingViewings(
  client: CrmClient,
  now: Date,
  limit = 8,
): Promise<Result<UpcomingViewing[]>> {
  const { data, error } = await client
    .from("viewing_appointments")
    .select("id, scheduled_at, status, lead_id, agent_id, leads(customer_name), properties(listing_code)")
    .gte("scheduled_at", now.toISOString())
    .in("status", ["scheduled", "confirmed"])
    .order("scheduled_at", { ascending: true })
    .limit(limit);
  if (error) return { ok: false };
  const names = await loadStaffNames(client, (data ?? []).map((row) => row.agent_id));
  return {
    ok: true,
    data: (data ?? []).map((row) => ({
      id: row.id,
      scheduledAt: row.scheduled_at,
      status: row.status,
      leadId: row.lead_id,
      customerName: row.leads?.customer_name ?? null,
      propertyReference: row.properties?.listing_code ?? null,
      agentName: names.get(row.agent_id) ?? null,
    })),
  };
}

export interface AgentPerformance {
  agentId: string;
  name: string;
  activeLeads: number;
  received: number;
  won: number;
  viewingsDone: number;
}

export async function getAgentPerformance(
  client: CrmClient,
  month: { start: string; end: string },
): Promise<Result<AgentPerformance[]>> {
  const { data, error } = await client.rpc("crm_agent_performance", {
    month_start: month.start,
    month_end: month.end,
  });
  if (error) return { ok: false };
  return {
    ok: true,
    data: (data ?? []).map((row) => ({
      agentId: row.agent_id,
      name: row.agent_name,
      activeLeads: count(row.active_leads),
      received: count(row.leads_received),
      won: count(row.leads_won),
      viewingsDone: count(row.viewings_done),
    })),
  };
}

export interface ActivityItem {
  id: string;
  type: Database["public"]["Enums"]["activity_type"];
  createdAt: string;
  notes: string | null;
  fromStage: LeadStage | null;
  toStage: LeadStage | null;
  fromAgent: string | null;
  toAgent: string | null;
  by: string | null;
  leadId: string;
  customerName: string | null;
}

async function toActivities(
  client: CrmClient,
  rows: Array<{
    id: string;
    activity_type: Database["public"]["Enums"]["activity_type"];
    created_at: string;
    notes: string | null;
    from_stage: LeadStage | null;
    to_stage: LeadStage | null;
    from_agent_id: string | null;
    to_agent_id: string | null;
    performed_by: string;
    lead_id: string;
    leads?: { customer_name: string } | null;
  }>,
): Promise<ActivityItem[]> {
  const names = await loadStaffNames(
    client,
    rows.flatMap((r) => [r.performed_by, r.from_agent_id, r.to_agent_id]),
  );
  const nameOf = (id: string | null) => (id ? (names.get(id) ?? null) : null);
  return rows.map((r) => ({
    id: r.id,
    type: r.activity_type,
    createdAt: r.created_at,
    notes: r.notes,
    fromStage: r.from_stage,
    toStage: r.to_stage,
    fromAgent: nameOf(r.from_agent_id),
    toAgent: nameOf(r.to_agent_id),
    by: nameOf(r.performed_by),
    leadId: r.lead_id,
    customerName: r.leads?.customer_name ?? null,
  }));
}

const ACTIVITY_COLUMNS =
  "id, activity_type, created_at, notes, from_stage, to_stage, from_agent_id, to_agent_id, performed_by, lead_id";

export async function getRecentActivity(client: CrmClient, limit = 10): Promise<Result<ActivityItem[]>> {
  const { data, error } = await client
    .from("lead_activities")
    .select(`${ACTIVITY_COLUMNS}, leads(customer_name)`)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return { ok: false };
  return { ok: true, data: await toActivities(client, data ?? []) };
}

// ----------------------------------------------------------------- lead list

export interface LeadPage {
  items: LeadListItem[];
  total: number;
  page: number;
  pageCount: number;
}

type FilterBuilder<Q> = Q & {
  eq: (c: string, v: string) => Q;
  is: (c: string, v: null) => Q;
  not: (c: string, op: string, v: string) => Q;
  or: (f: string) => Q;
  gte: (c: string, v: string) => Q;
  lt: (c: string, v: string) => Q;
  ilike: (c: string, v: string) => Q;
};

function applyLeadFilters<Q>(query: Q, c: LeadSearchCriteria): Q {
  let q = query as FilterBuilder<Q>;
  const next = (value: Q) => (q = value as FilterBuilder<Q>);

  if (c.q) {
    const term = sanitizeSearchTerm(c.q);
    if (term) {
      next(
        q.or(
          [
            `customer_name.ilike.*${term}*`,
            `phone.ilike.*${term}*`,
            `email.ilike.*${term}*`,
            `property_reference.ilike.*${term}*`,
          ].join(","),
        ),
      );
    }
  }
  if (c.stage === "active") next(q.not("stage", "in", ACTIVE_STAGE_LIST));
  else if (c.stage) next(q.eq("stage", c.stage));
  if (c.agent === "unassigned") next(q.is("assigned_agent_id", null));
  else if (c.agent) next(q.eq("assigned_agent_id", c.agent));
  if (c.type) next(q.eq("property_type", c.type));
  if (c.district) {
    const term = sanitizeSearchTerm(c.district);
    if (term) {
      next(q.or(`property_district.ilike.*${term}*,preferred_area.ilike.*${term}*`));
    }
  }
  const from = c.from ? phnomPenhDateStart(c.from) : null;
  if (from) next(q.gte("created_at", from));
  if (c.to) {
    // "until" is inclusive of the whole day.
    const start = phnomPenhDateStart(c.to);
    if (start) next(q.lt("created_at", new Date(Date.parse(start) + 86_400_000).toISOString()));
  }
  return q as Q;
}

export async function searchLeads(
  client: CrmClient,
  criteria: LeadSearchCriteria,
): Promise<Result<LeadPage>> {
  const counted = await applyLeadFilters(
    client.from("crm_lead_list").select("id", { count: "exact", head: true }),
    criteria,
  );
  if (counted.error || counted.count === null) return { ok: false };

  const total = counted.count;
  const pageCount = Math.max(1, Math.ceil(total / LEADS_PAGE_SIZE));
  const page = Math.min(criteria.page, pageCount);
  if (total === 0) return { ok: true, data: { items: [], total, page: 1, pageCount: 1 } };

  let query = applyLeadFilters(client.from("crm_lead_list").select("*"), criteria);
  switch (criteria.sort) {
    case "created_asc":
      query = query.order("created_at", { ascending: true });
      break;
    case "updated_desc":
      query = query.order("updated_at", { ascending: false });
      break;
    case "followup_asc":
      query = query.order("next_follow_up_at", { ascending: true, nullsFirst: false });
      break;
    case "name_asc":
      query = query.order("customer_name", { ascending: true });
      break;
    default:
      query = query.order("created_at", { ascending: false });
  }
  const from = (page - 1) * LEADS_PAGE_SIZE;
  const { data, error } = await query
    .order("id", { ascending: true })
    .range(from, from + LEADS_PAGE_SIZE - 1);
  if (error) return { ok: false };
  return { ok: true, data: { items: items(data), total, page, pageCount } };
}

// ---------------------------------------------------------------- lead detail

export type LeadRow = Database["public"]["Tables"]["leads"]["Row"];

export interface LeadViewing {
  id: string;
  scheduledAt: string;
  status: Database["public"]["Enums"]["viewing_status"];
  propertyReference: string | null;
  agentName: string | null;
}

export interface LeadDetail {
  lead: LeadRow;
  propertyReference: string | null;
  agentName: string | null;
  viewings: LeadViewing[];
  activities: ActivityItem[];
}

export type LeadDetailResult =
  | { status: "ok"; detail: LeadDetail }
  | { status: "notFound" }
  | { status: "error" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getLeadDetail(client: CrmClient, id: string): Promise<LeadDetailResult> {
  if (!UUID.test(id)) return { status: "notFound" };

  const { data: lead, error } = await client.from("leads").select("*").eq("id", id).maybeSingle();
  if (error) return { status: "error" };
  if (!lead) return { status: "notFound" };

  const [property, viewings, activities] = await Promise.all([
    lead.property_id
      ? client.from("properties").select("listing_code").eq("id", lead.property_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    client
      .from("viewing_appointments")
      .select("id, scheduled_at, status, agent_id, properties(listing_code)")
      .eq("lead_id", id)
      .order("scheduled_at", { ascending: false }),
    client
      .from("lead_activities")
      .select(ACTIVITY_COLUMNS)
      .eq("lead_id", id)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  if (viewings.error || activities.error) return { status: "error" };

  const names = await loadStaffNames(client, [
    lead.assigned_agent_id,
    ...(viewings.data ?? []).map((v) => v.agent_id),
  ]);

  return {
    status: "ok",
    detail: {
      lead,
      propertyReference: property.data?.listing_code ?? null,
      agentName: lead.assigned_agent_id ? (names.get(lead.assigned_agent_id) ?? null) : null,
      viewings: (viewings.data ?? []).map((v) => ({
        id: v.id,
        scheduledAt: v.scheduled_at,
        status: v.status,
        propertyReference: v.properties?.listing_code ?? null,
        agentName: names.get(v.agent_id) ?? null,
      })),
      activities: await toActivities(client, activities.data ?? []),
    },
  };
}
