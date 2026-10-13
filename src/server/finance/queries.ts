import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeSearchTerm } from "@/server/crm/queries";
import type { Database } from "@/types/database";

/**
 * Finance reads. They run as the signed-in user, so RLS decides the rows;
 * callers also check the role first. Amounts are numbers in minor units
 * (PostgREST returns NUMERIC(18,0) as JSON numbers; all values are far below
 * 2^53).
 */
export type FinClient = SupabaseClient<Database>;
export type Result<T> = { ok: true; data: T } | { ok: false };

export const PAGE_SIZE = 20;
const num = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string) => UUID.test(value);

type Currency = Database["public"]["Enums"]["currency_code"];

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageCount: number;
}

function paging(total: number, requested: number) {
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, requested), pageCount);
  return { page, pageCount, from: (page - 1) * PAGE_SIZE };
}

// --------------------------------------------------------------------- deals

export interface DealRow {
  id: string;
  customerName: string | null;
  propertyReference: string | null;
  landlordName: string | null;
  agentName: string | null;
  stage: Database["public"]["Enums"]["deal_stage"];
  currency: Currency;
  rentMinor: number | null;
  expectedCommissionMinor: number | null;
  closingDate: string | null;
}

export interface DealFilters {
  q?: string;
  stage?: string;
  agent?: string;
  page: number;
}

export async function listDeals(client: FinClient, f: DealFilters): Promise<Result<Paged<DealRow>>> {
  const build = (select: string, head = false) => {
    let q = client.from("deal_overview").select(select, head ? { count: "exact", head: true } : { count: "exact" });
    if (f.stage) q = q.eq("stage", f.stage as Database["public"]["Enums"]["deal_stage"]);
    if (f.agent && isUuid(f.agent)) q = q.eq("agent_id", f.agent);
    const term = f.q ? sanitizeSearchTerm(f.q) : "";
    if (term) q = q.or(`customer_name.ilike.*${term}*,property_reference.ilike.*${term}*`);
    return q;
  };
  const counted = await build("id", true);
  if (counted.error || counted.count === null) return { ok: false };
  const { page, pageCount, from } = paging(counted.count, f.page);
  if (counted.count === 0) return { ok: true, data: { items: [], total: 0, page: 1, pageCount: 1 } };

  const { data, error } = await build("*")
    .order("created_at", { ascending: false })
    .order("id")
    .range(from, from + PAGE_SIZE - 1);
  if (error) return { ok: false };
  const items = (data as unknown as Database["public"]["Views"]["deal_overview"]["Row"][]).flatMap(
    (r) =>
      r.id && r.stage && r.currency
        ? [
            {
              id: r.id,
              customerName: r.customer_name,
              propertyReference: r.property_reference,
              landlordName: r.landlord_name,
              agentName: r.agent_name,
              stage: r.stage,
              currency: r.currency,
              rentMinor: r.agreed_monthly_rent_minor === null ? null : num(r.agreed_monthly_rent_minor),
              expectedCommissionMinor:
                r.commission_expected_minor === null ? null : num(r.commission_expected_minor),
              closingDate: r.closing_date,
            } satisfies DealRow,
          ]
        : [],
  );
  return { ok: true, data: { items, total: counted.count, page, pageCount } };
}

export type DealRecord = Database["public"]["Tables"]["rental_deals"]["Row"];
export type FinancialsRow = Database["public"]["Views"]["deal_financials"]["Row"];
export type BalanceRow = Database["public"]["Views"]["commission_balances"]["Row"];
type PayoutRecord = Database["public"]["Tables"]["agent_payouts"]["Row"];
type AuditRecord = Database["public"]["Tables"]["financial_audit_log"]["Row"];

export interface DealDetail {
  deal: DealRecord;
  customerName: string | null;
  landlordName: string | null;
  agentName: string | null;
  propertyReference: string | null;
  financials: {
    expected: number;
    earned: number;
    invoiced: number;
    receivable: number;
    collected: number;
    writtenOff: number;
    outstanding: number;
    agentShare: number;
    agentEligible: number;
    agentPaid: number;
    agentPending: number;
    agentOutstanding: number;
  } | null;
  receivables: BalanceRow[];
  payouts: PayoutRecord[];
  documents: Database["public"]["Tables"]["deal_documents"]["Row"][];
  audit: AuditRecord[];
  staff: Map<string, string>;
}

export type DealDetailResult =
  | { status: "ok"; detail: DealDetail }
  | { status: "notFound" }
  | { status: "error" };

export async function getDealDetail(
  client: FinClient,
  id: string,
  options: { includeAudit: boolean },
): Promise<DealDetailResult> {
  if (!isUuid(id)) return { status: "notFound" };
  const { data: deal, error } = await client.from("rental_deals").select("*").eq("id", id).maybeSingle();
  if (error) return { status: "error" };
  if (!deal) return { status: "notFound" };

  const [overview, fin, receivables, payouts, documents, audit] = await Promise.all([
    client.from("deal_overview").select("customer_name, landlord_name, agent_name, property_reference").eq("id", id).maybeSingle(),
    client.from("deal_financials").select("*").eq("deal_id", id).maybeSingle(),
    client.from("commission_balances").select("*").eq("deal_id", id).order("payer"),
    client.from("agent_payouts").select("*").eq("deal_id", id).order("created_at", { ascending: false }),
    client.from("deal_documents").select("*").eq("deal_id", id).order("created_at", { ascending: false }),
    options.includeAudit
      ? client.from("financial_audit_log").select("*").eq("deal_id", id).order("occurred_at", { ascending: false }).limit(50)
      : Promise.resolve({ data: [] as AuditRecord[], error: null }),
  ]);
  if (receivables.error || payouts.error || documents.error || audit.error) return { status: "error" };

  const staffIds = [
    ...(payouts.data ?? []).flatMap((p) => [p.requested_by, p.approved_by, p.paid_by]),
    ...(documents.data ?? []).map((d) => d.uploaded_by),
    ...(audit.data ?? []).map((a) => a.actor_id),
  ].filter((v): v is string => Boolean(v));
  const staff = await staffNames(client, staffIds);

  const f = fin.data;
  return {
    status: "ok",
    detail: {
      deal,
      customerName: overview.data?.customer_name ?? null,
      landlordName: overview.data?.landlord_name ?? null,
      agentName: overview.data?.agent_name ?? null,
      propertyReference: overview.data?.property_reference ?? null,
      financials: f
        ? {
            expected: num(f.expected_minor),
            earned: num(f.earned_minor),
            invoiced: num(f.invoiced_minor),
            receivable: num(f.receivable_minor),
            collected: num(f.collected_minor),
            writtenOff: num(f.written_off_minor),
            outstanding: num(f.outstanding_minor),
            agentShare: num(f.agent_share_minor),
            agentEligible: num(f.agent_eligible_minor),
            agentPaid: num(f.agent_paid_minor),
            agentPending: num(f.agent_pending_minor),
            agentOutstanding: num(f.agent_outstanding_minor),
          }
        : null,
      receivables: receivables.data ?? [],
      payouts: payouts.data ?? [],
      documents: documents.data ?? [],
      audit: audit.data ?? [],
      staff,
    },
  };
}

export async function staffNames(client: FinClient, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  const { data } = await client.from("staff_names").select("id, full_name").in("id", unique);
  for (const row of data ?? []) if (row.id && row.full_name) map.set(row.id, row.full_name);
  return map;
}

export interface Option {
  id: string;
  label: string;
}

export async function leadOptions(client: FinClient): Promise<Option[]> {
  const { data } = await client
    .from("crm_lead_list")
    .select("id, customer_name, property_reference, stage")
    .not("stage", "in", "(lost,cancelled,unresponsive)")
    .order("created_at", { ascending: false })
    .limit(150);
  return (data ?? []).flatMap((l) =>
    l.id && l.customer_name
      ? [{ id: l.id, label: l.property_reference ? `${l.customer_name} · ${l.property_reference}` : l.customer_name }]
      : [],
  );
}

export async function landlordOptions(client: FinClient): Promise<Option[]> {
  const { data } = await client.from("landlords").select("id, full_name, business_name").is("archived_at", null).order("full_name").limit(300);
  return (data ?? []).map((l) => ({ id: l.id, label: l.business_name ?? l.full_name }));
}

export async function agentOptions(client: FinClient): Promise<Option[]> {
  const { data } = await client.from("staff_names").select("id, full_name").eq("role", "agent").order("full_name");
  return (data ?? []).flatMap((a) => (a.id && a.full_name ? [{ id: a.id, label: a.full_name }] : []));
}

// --------------------------------------------------------------- receivables

export interface ReceivableFilters {
  q?: string;
  status?: string;
  payer?: string;
  currency?: string;
  from?: string;
  to?: string;
  page: number;
}

export interface ReceivableTotals {
  currency: Currency;
  due: number;
  collected: number;
  outstanding: number;
  overdue: number;
}

export async function listReceivables(
  client: FinClient,
  f: ReceivableFilters,
): Promise<Result<Paged<BalanceRow> & { totals: ReceivableTotals[] }>> {
  const build = (select: string, head = false) => {
    let q = client.from("commission_balances").select(select, head ? { count: "exact", head: true } : { count: "exact" });
    if (f.status) q = q.eq("collection_status", f.status);
    if (f.payer) q = q.eq("payer", f.payer as Database["public"]["Enums"]["fee_payer"]);
    if (f.currency) q = q.eq("currency", f.currency as Currency);
    if (f.from) q = q.gte("due_date", f.from);
    if (f.to) q = q.lte("due_date", f.to);
    const term = f.q ? sanitizeSearchTerm(f.q) : "";
    if (term) q = q.or(`customer_name.ilike.*${term}*,property_reference.ilike.*${term}*`);
    return q;
  };
  const counted = await build("commission_id", true);
  if (counted.error || counted.count === null) return { ok: false };
  const { page, pageCount, from } = paging(counted.count, f.page);

  // Totals cover the whole filtered set, per currency (never mixed).
  const all = await build("currency, due_minor, collected_minor, outstanding_minor, collection_status").limit(5000);
  if (all.error) return { ok: false };
  const totals = new Map<Currency, ReceivableTotals>();
  for (const r of (all.data ?? []) as unknown as BalanceRow[]) {
    if (!r.currency) continue;
    const t = totals.get(r.currency) ?? { currency: r.currency, due: 0, collected: 0, outstanding: 0, overdue: 0 };
    t.due += num(r.due_minor);
    t.collected += num(r.collected_minor);
    t.outstanding += num(r.outstanding_minor);
    if (r.collection_status === "overdue") t.overdue += num(r.outstanding_minor);
    totals.set(r.currency, t);
  }

  if (counted.count === 0) {
    return { ok: true, data: { items: [], total: 0, page: 1, pageCount: 1, totals: [...totals.values()] } };
  }
  const { data, error } = await build("*")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("commission_id")
    .range(from, from + PAGE_SIZE - 1);
  if (error) return { ok: false };
  return {
    ok: true,
    data: { items: (data ?? []) as unknown as BalanceRow[], total: counted.count, page, pageCount, totals: [...totals.values()] },
  };
}

export type LedgerRow = Database["public"]["Tables"]["commission_transactions"]["Row"];

export interface ReceivableDetail {
  balance: BalanceRow;
  commission: Database["public"]["Tables"]["commissions"]["Row"];
  ledger: LedgerRow[];
  staff: Map<string, string>;
}

export async function getReceivable(
  client: FinClient,
  id: string,
): Promise<{ status: "ok"; detail: ReceivableDetail } | { status: "notFound" } | { status: "error" }> {
  if (!isUuid(id)) return { status: "notFound" };
  const [balance, commission, ledger] = await Promise.all([
    client.from("commission_balances").select("*").eq("commission_id", id).maybeSingle(),
    client.from("commissions").select("*").eq("id", id).maybeSingle(),
    client.from("commission_transactions").select("*").eq("commission_id", id).order("occurred_on", { ascending: false }).order("created_at", { ascending: false }),
  ]);
  if (balance.error || commission.error || ledger.error) return { status: "error" };
  if (!balance.data || !commission.data) return { status: "notFound" };
  const staff = await staffNames(client, (ledger.data ?? []).map((l) => l.recorded_by));
  return { status: "ok", detail: { balance: balance.data, commission: commission.data, ledger: ledger.data ?? [], staff } };
}

// ------------------------------------------------------------------- payouts

export interface PayoutListItem extends PayoutRecord {
  agentName: string | null;
  customerName: string | null;
  propertyReference: string | null;
  requestedByName: string | null;
}

export async function listPayouts(
  client: FinClient,
  f: { status?: string; page: number },
): Promise<Result<Paged<PayoutListItem>>> {
  const build = (select: string, head = false) => {
    let q = client.from("agent_payouts").select(select, head ? { count: "exact", head: true } : { count: "exact" });
    if (f.status) q = q.eq("status", f.status as Database["public"]["Enums"]["payout_status"]);
    return q;
  };
  const counted = await build("id", true);
  if (counted.error || counted.count === null) return { ok: false };
  const { page, pageCount, from } = paging(counted.count, f.page);
  if (counted.count === 0) return { ok: true, data: { items: [], total: 0, page: 1, pageCount: 1 } };
  const { data, error } = await build("*").order("created_at", { ascending: false }).order("id").range(from, from + PAGE_SIZE - 1);
  if (error) return { ok: false };
  const rows = (data ?? []) as unknown as PayoutRecord[];
  const [names, deals] = await Promise.all([
    staffNames(client, rows.flatMap((r) => [r.agent_id, r.requested_by])),
    client.from("deal_overview").select("id, customer_name, property_reference").in("id", rows.map((r) => r.deal_id)),
  ]);
  const dealMap = new Map((deals.data ?? []).map((d) => [d.id as string, d]));
  return {
    ok: true,
    data: {
      total: counted.count,
      page,
      pageCount,
      items: rows.map((r) => ({
        ...r,
        agentName: names.get(r.agent_id) ?? null,
        requestedByName: names.get(r.requested_by) ?? null,
        customerName: dealMap.get(r.deal_id)?.customer_name ?? null,
        propertyReference: dealMap.get(r.deal_id)?.property_reference ?? null,
      })),
    },
  };
}

// ------------------------------------------------------------------ expenses

export type ExpenseRow = Database["public"]["Tables"]["expenses"]["Row"] & { createdByName: string | null };

export async function listExpenses(
  client: FinClient,
  f: { status?: string; category?: string; from?: string; to?: string; page: number },
): Promise<Result<Paged<ExpenseRow>>> {
  const build = (select: string, head = false) => {
    let q = client.from("expenses").select(select, head ? { count: "exact", head: true } : { count: "exact" });
    if (f.status) q = q.eq("status", f.status as Database["public"]["Enums"]["expense_status"]);
    if (f.category) q = q.eq("category", f.category as Database["public"]["Enums"]["expense_category"]);
    if (f.from) q = q.gte("expense_date", f.from);
    if (f.to) q = q.lte("expense_date", f.to);
    return q;
  };
  const counted = await build("id", true);
  if (counted.error || counted.count === null) return { ok: false };
  const { page, pageCount, from } = paging(counted.count, f.page);
  if (counted.count === 0) return { ok: true, data: { items: [], total: 0, page: 1, pageCount: 1 } };
  const { data, error } = await build("*").order("expense_date", { ascending: false }).order("id").range(from, from + PAGE_SIZE - 1);
  if (error) return { ok: false };
  const rows = (data ?? []) as unknown as Database["public"]["Tables"]["expenses"]["Row"][];
  const names = await staffNames(client, rows.map((r) => r.created_by));
  return {
    ok: true,
    data: { total: counted.count, page, pageCount, items: rows.map((r) => ({ ...r, createdByName: names.get(r.created_by) ?? null })) },
  };
}

/** Short-lived link to a private file, created for the signed-in user (storage RLS applies). */
export async function signedLink(client: FinClient, path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await client.storage.from("private-docs").createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}

// ------------------------------------------------------------------- reports

export interface CurrencyReport {
  currency: Currency;
  expected: number;
  earned: number;
  collected: number;
  outstanding: number;
  overdue: number;
  writtenOff: number;
  payoutsPaid: number;
  payoutsOutstanding: number;
  expensesApproved: number;
  expensesPending: number;
  cashIn: number;
  cashOut: number;
  net: number;
}

export interface FinanceReport {
  byCurrency: CurrencyReport[];
  dealsByMonth: Array<{ month: string; deals: number }>;
  revenueByAgent: Array<{ agentId: string | null; name: string | null; currency: Currency; collected: number }>;
  revenueByType: Array<{ propertyType: string | null; currency: Currency; collected: number }>;
}

export async function getFinanceReport(client: FinClient, from: string, to: string): Promise<Result<FinanceReport>> {
  const { data, error } = await client.rpc("finance_report", { from_date: from, to_date: to });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return { ok: false };
  const r = data as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? (v as Array<Record<string, unknown>>) : []);

  const agentRows = list(r.revenue_by_agent).map((x) => ({
    agentId: (x.agent_id as string | null) ?? null,
    currency: x.currency as Currency,
    collected: num(x.collected_minor),
  }));
  const names = await staffNames(client, agentRows.flatMap((a) => (a.agentId ? [a.agentId] : [])));

  return {
    ok: true,
    data: {
      byCurrency: list(r.by_currency).map((c) => ({
        currency: c.currency as Currency,
        expected: num(c.expected_minor),
        earned: num(c.earned_minor),
        collected: num(c.collected_minor),
        outstanding: num(c.outstanding_minor),
        overdue: num(c.overdue_minor),
        writtenOff: num(c.written_off_minor),
        payoutsPaid: num(c.payouts_paid_minor),
        payoutsOutstanding: num(c.payouts_outstanding_minor),
        expensesApproved: num(c.expenses_approved_minor),
        expensesPending: num(c.expenses_pending_minor),
        cashIn: num(c.cash_in_minor),
        cashOut: num(c.cash_out_minor),
        net: num(c.net_minor),
      })),
      dealsByMonth: list(r.deals_by_month).map((m) => ({ month: String(m.month), deals: num(m.deals) })),
      revenueByAgent: agentRows.map((a) => ({ ...a, name: a.agentId ? (names.get(a.agentId) ?? null) : null })),
      revenueByType: list(r.revenue_by_property_type).map((t) => ({
        propertyType: (t.property_type as string | null) ?? null,
        currency: t.currency as Currency,
        collected: num(t.collected_minor),
      })),
    },
  };
}

export async function getSettings(client: FinClient) {
  const { data } = await client.from("finance_settings").select("*").maybeSingle();
  return data;
}

export async function recentAudit(client: FinClient, limit = 15) {
  const { data } = await client.from("financial_audit_log").select("*").order("occurred_at", { ascending: false }).limit(limit);
  const rows = data ?? [];
  const names = await staffNames(client, rows.map((r) => r.actor_id).filter((v): v is string => Boolean(v)));
  return rows.map((r) => ({ ...r, actorName: r.actor_id ? (names.get(r.actor_id) ?? null) : null }));
}
