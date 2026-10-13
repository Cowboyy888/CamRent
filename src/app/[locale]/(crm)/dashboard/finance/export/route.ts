import { type NextRequest, NextResponse } from "next/server";
import { toCsv } from "@/lib/finance/csv";
import { minorToMajorString } from "@/lib/finance/money";
import { canExport, exportReports, type ExportReport } from "@/lib/finance/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAdminAccess } from "@/server/auth/admin-access";
import { staffNames } from "@/server/finance/queries";

/**
 * CSV export. Checks, in order: signed-in active staff (401), a role that may
 * export this report (403), then reads through the caller's own session so
 * row level security still limits the rows, and writes only whitelisted
 * columns (never storage paths, internal ids of other staff, or free-text
 * fields the role may not see). Every export is recorded in the audit log.
 */
const MAX_ROWS = 10_000;
const PAGE = 1000;
const isDate = (v: string | null): v is string => v !== null && /^\d{4}-\d{2}-\d{2}$/.test(v);
const money = (v: number | string | null | undefined) =>
  v === null || v === undefined ? "" : minorToMajorString(Number(v));

function csvResponse(name: string, body: string) {
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.csv"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(request: NextRequest) {
  const access = await getAdminAccess();
  if (access.status !== "authenticated") return new NextResponse("Unauthorized", { status: 401 });

  const params = request.nextUrl.searchParams;
  const report = params.get("report") as ExportReport | null;
  if (!report || !exportReports.includes(report)) return new NextResponse("Unknown report", { status: 400 });
  if (!canExport(access.role, report)) return new NextResponse("Forbidden", { status: 403 });

  const from = isDate(params.get("from")) ? params.get("from")! : "1970-01-01";
  const to = isDate(params.get("to")) ? params.get("to")! : "2999-12-31";
  const client = await createSupabaseServerClient();

  async function pageThrough<T>(fetchPage: (a: number, b: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
    const rows: T[] = [];
    for (let start = 0; start < MAX_ROWS; start += PAGE) {
      const { data, error } = await fetchPage(start, start + PAGE - 1);
      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
    return rows;
  }

  try {
    let columns: string[] = [];
    let rows: Array<Record<string, unknown>> = [];

    if (report === "receivables") {
      const data = await pageThrough((a, b) =>
        client.from("commission_balances").select("*").order("due_date", { nullsFirst: false }).order("commission_id").range(a, b),
      );
      columns = ["deal_id", "customer", "property", "payer", "currency", "amount_due", "collected", "written_off", "outstanding", "due_date", "invoiced_on", "status", "last_payment_date", "last_payment_method", "last_payment_reference"];
      rows = data.map((r) => ({
        deal_id: r.deal_id, customer: r.customer_name, property: r.property_reference, payer: r.payer,
        currency: r.currency, amount_due: money(r.due_minor), collected: money(r.collected_minor),
        written_off: money(r.written_off_minor), outstanding: money(r.outstanding_minor),
        due_date: r.due_date, invoiced_on: r.invoiced_on, status: r.collection_status,
        last_payment_date: r.last_payment_on, last_payment_method: r.last_payment_method,
        last_payment_reference: r.last_payment_reference,
      }));
    } else if (report === "payments") {
      const data = await pageThrough((a, b) =>
        client.from("commission_transactions").select("*").gte("occurred_on", from).lte("occurred_on", to).order("occurred_on").order("id").range(a, b),
      );
      const names = await staffNames(client, data.map((r) => r.recorded_by));
      columns = ["date", "entry", "amount", "currency", "method", "reference", "reason", "recorded_by", "receivable_id"];
      rows = data.map((r) => ({
        date: r.occurred_on, entry: r.entry_type, amount: money(r.amount_minor), currency: r.currency,
        method: r.payment_method, reference: r.reference, reason: r.reason,
        recorded_by: names.get(r.recorded_by) ?? "", receivable_id: r.commission_id,
      }));
    } else if (report === "payouts") {
      const data = await pageThrough((a, b) =>
        client.from("agent_payouts").select("*").order("created_at").order("id").range(a, b),
      );
      const names = await staffNames(client, data.flatMap((r) => [r.agent_id, r.approved_by].filter((v): v is string => Boolean(v))));
      columns = ["deal_id", "agent", "amount", "currency", "status", "requested_on", "approved_by", "paid_on", "method", "reference", "reason"];
      rows = data.map((r) => ({
        deal_id: r.deal_id, agent: names.get(r.agent_id) ?? "", amount: money(r.amount_minor), currency: r.currency,
        status: r.status, requested_on: r.created_at.slice(0, 10),
        approved_by: r.approved_by ? (names.get(r.approved_by) ?? "") : "",
        paid_on: r.paid_on, method: r.payment_method, reference: r.payment_reference, reason: r.reason,
      }));
    } else if (report === "expenses") {
      const data = await pageThrough((a, b) =>
        client.from("expenses").select("*").gte("expense_date", from).lte("expense_date", to).order("expense_date").order("id").range(a, b),
      );
      const names = await staffNames(client, data.flatMap((r) => [r.created_by, r.approved_by].filter((v): v is string => Boolean(v))));
      columns = ["date", "category", "description", "vendor", "amount", "currency", "method", "status", "paid_on", "created_by", "approved_by", "has_receipt"];
      rows = data.map((r) => ({
        date: r.expense_date, category: r.category, description: r.description, vendor: r.vendor,
        amount: money(r.amount_minor), currency: r.currency, method: r.payment_method, status: r.status,
        paid_on: r.paid_on, created_by: names.get(r.created_by) ?? "",
        approved_by: r.approved_by ? (names.get(r.approved_by) ?? "") : "",
        has_receipt: r.receipt_path ? "yes" : "no",
      }));
    } else {
      const data = await pageThrough((a, b) =>
        client.from("deal_overview").select("*").order("created_at").order("id").range(a, b),
      );
      const showAgency = access.role !== "agent";
      columns = ["deal_id", "customer", "property", "landlord", "agent", "status", "currency", "monthly_rent", "lease_start", "lease_end", "lease_months", "closing_date", "agent_share_expected", ...(showAgency ? ["agency_commission_expected"] : [])];
      rows = data.map((r) => ({
        deal_id: r.id, customer: r.customer_name, property: r.property_reference, landlord: r.landlord_name,
        agent: r.agent_name, status: r.stage, currency: r.currency, monthly_rent: money(r.agreed_monthly_rent_minor),
        lease_start: r.lease_start, lease_end: r.lease_end, lease_months: r.lease_months, closing_date: r.closing_date,
        agent_share_expected: money(r.agent_share_expected_minor),
        ...(showAgency ? { agency_commission_expected: money(r.commission_expected_minor) } : {}),
      }));
    }

    await client.rpc("log_financial_export", { report, details: { rows: rows.length, from, to } });
    return csvResponse(`camrent-${report}-${from}_${to}`, toCsv(columns, rows));
  } catch {
    return new NextResponse("Export failed", { status: 500 });
  }
}
