"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import {
  canApprove,
  canCreateExpenses,
  canEditFinanceSettings,
  canMarkPayoutPaid,
  canRaiseReceivables,
  canRecordCollections,
  canRequestPayouts,
  canViewDeals,
  canWorkDeals,
} from "@/lib/finance/permissions";
import { mapDatabaseError, type FinanceErrorCode } from "@/lib/finance/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminAccess } from "@/server/auth/admin-access";
import { dashboardPath, localeOrDefault } from "@/server/auth/constants";
import { checkUpload, safeFileName, type FileProblem } from "./files";
import {
  arrangementProblems,
  createDealSchema,
  dealTermsSchema,
  documentKind,
  expenseDecisionSchema,
  expenseSchema,
  ledgerSchema,
  payoutDecisionSchema,
  payoutRequestSchema,
  receivableSchema,
  receivableTermsSchema,
  settingsSchema,
  stageSchema,
  termsColumns,
} from "./schemas";

/**
 * Finance Server Actions. Each one: (1) verifies the staff role on the
 * server, (2) validates every field, (3) writes with the caller's own
 * Supabase session, so Row Level Security, column privileges and the money
 * triggers apply exactly as they would to any other client. Nothing here
 * calculates a balance: balances come from the ledger in the database.
 */
export type FinanceMessage =
  | "saved"
  | "created"
  | "statusChanged"
  | "entryRecorded"
  | "approved"
  | "rejected"
  | "paid"
  | "cancelled"
  | "reversed"
  | "uploaded"
  | "requested";

export interface FinanceFormState {
  status: "idle" | "success" | "error";
  error?: FinanceErrorCode | FileProblem;
  fields?: string[];
  message?: FinanceMessage;
  /** Set after creating a record, so the form can link to it. */
  id?: string;
}

const fail = (error: FinanceErrorCode | FileProblem, fields?: string[]): FinanceFormState => ({
  status: "error",
  error,
  fields,
});
const ok = (message: FinanceMessage, id?: string): FinanceFormState => ({ status: "success", message, id });

function entries(formData: FormData): Record<string, FormDataEntryValue> {
  return Object.fromEntries(formData.entries());
}

function invalid(error: z.ZodError): FinanceFormState {
  return fail("invalid", [...new Set(error.issues.map((i) => String(i.path[0] ?? "form")))]);
}

async function ctx() {
  const access = await requireAdminAccess();
  return { access, client: await createSupabaseServerClient() };
}

function refresh(formData: FormData, ...paths: string[]) {
  const locale = localeOrDefault(formData.get("locale"));
  for (const p of paths) revalidatePath(dashboardPath(locale, p));
  revalidatePath(dashboardPath(locale));
}

const today = () =>
  new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10); // Phnom Penh date

// -------------------------------------------------------------------- deals

export async function createDealAction(_p: FinanceFormState, formData: FormData): Promise<FinanceFormState> {
  const { access, client } = await ctx();
  if (!canWorkDeals(access.role)) return fail("forbidden");

  const parsed = createDealSchema.safeParse(entries(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const problems = arrangementProblems(d);
  if (problems.length > 0) return fail("invalid", problems);

  const { data: lead } = await client
    .from("leads")
    .select("id, property_id, assigned_agent_id")
    .eq("id", d.leadId)
    .maybeSingle();
  if (!lead) return fail("notFound", ["leadId"]);

  let propertyId = lead.property_id;
  if (d.propertyRef) {
    const { data: property } = await client.from("properties").select("id").eq("listing_code", d.propertyRef).maybeSingle();
    if (!property) return fail("notFound", ["propertyRef"]);
    propertyId = property.id;
  }
  if (!propertyId) return fail("notFound", ["propertyRef"]);

  // Agents can only create deals for themselves; managers choose the agent.
  const agentId = access.role === "agent" ? access.userId : (d.agentId ?? lead.assigned_agent_id ?? null);
  if (!agentId) return fail("invalid", ["agentId"]);

  const { data, error } = await client
    .from("rental_deals")
    .insert({ lead_id: d.leadId, property_id: propertyId, agent_id: agentId, stage: "negotiation", ...termsColumns(d) })
    .select("id")
    .single();
  if (error) return fail(mapDatabaseError(error));

  refresh(formData, "/deals");
  return ok("created", data.id);
}

export async function updateDealTermsAction(_p: FinanceFormState, formData: FormData): Promise<FinanceFormState> {
  const { access, client } = await ctx();
  if (!canWorkDeals(access.role)) return fail("forbidden");

  const id = String(formData.get("id") ?? "");
  const parsed = dealTermsSchema.safeParse(entries(formData));
  if (!parsed.success) return invalid(parsed.error);
  const problems = arrangementProblems(parsed.data);
  if (problems.length > 0) return fail("invalid", problems);

  const { data, error } = await client.from("rental_deals").update(termsColumns(parsed.data)).eq("id", id).select("id");
  if (error) return fail(mapDatabaseError(error));
  if (!data?.length) return fail("notFound");

  refresh(formData, `/deals/${id}`, "/deals");
  return ok("saved");
}

export async function changeDealStageAction(_p: FinanceFormState, formData: FormData): Promise<FinanceFormState> {
  const { access, client } = await ctx();
  if (!canWorkDeals(access.role)) return fail("forbidden");

  const parsed = stageSchema.safeParse(entries(formData));
  if (!parsed.success) return invalid(parsed.error);
  const { id, stage, reason } = parsed.data;
  if ((stage === "closed_lost" || stage === "cancelled") && !reason) return fail("reasonRequired", ["reason"]);

  const { data, error } = await client
    .from("rental_deals")
    .update({ stage, status_reason: reason ?? null })
    .eq("id", id)
    .select("id");
  if (error) return fail(mapDatabaseError(error));
  if (!data?.length) return fail("notFound");

  refresh(formData, `/deals/${id}`, "/deals", "/commissions");
  return ok("statusChanged");
}

// ----------------------------------------------------------- receivables

export async function raiseReceivableAction(_p: FinanceFormState, formData: FormData): Promise<FinanceFormState> {
  const { access, client } = await ctx();
  if (!canRaiseReceivables(access.role)) return fail("forbidden");

  const parsed = receivableSchema.safeParse(entries(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;

  const { data, error } = await client
    .from("commissions")
    .insert({
      deal_id: d.dealId,
      fee_payer: d.payer,
      calculation_type: "fixed_amount",
      agreed_amount_minor: d.amount,
      due_date: d.dueDate ?? null,
      invoiced_on: d.invoicedOn ?? null,
      notes: d.notes ?? null,
    })
    .select("id")
    .single();
  if (error) {
    return fail(error.code === "23505" ? "duplicateDeal" : mapDatabaseError(error));
  }
  refresh(formData, `/deals/${d.dealId}`, "/commissions");
  return ok("created", data.id);
}

export async function updateReceivableTermsAction(_p: FinanceFormState, formData: FormData): Promise<FinanceFormState> {
  const { access, client } = await ctx();
  if (!canRecordCollections(access.role)) return fail("forbidden");

  const parsed = receivableTermsSchema.safeParse(entries(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const { data, error } = await client
    .from("commissions")
    .update({ due_date: d.dueDate ?? null, invoiced_on: d.invoicedOn ?? null, notes: d.notes ?? null })
    .eq("id", d.id)
    .select("id");
  if (error) return fail(mapDatabaseError(error));
  if (!data?.length) return fail("notFound");

  refresh(formData, `/commissions/${d.id}`, "/commissions");
  return ok("saved");
}

export async function recordLedgerEntryAction(_p: FinanceFormState, formData: FormData): Promise<FinanceFormState> {
  const { access, client } = await ctx();
  if (!canRecordCollections(access.role)) return fail("forbidden");

  const parsed = ledgerSchema.safeParse(entries(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;

  if (d.occurredOn > today()) return fail("futureDate", ["occurredOn"]);
  if (d.entryType === "payment" && !d.method) return fail("invalid", ["method"]);
  if (d.entryType === "reversal" && !d.reversesId) return fail("invalid", ["reversesId"]);
  if (d.entryType !== "payment" && !d.reason) return fail("reasonRequired", ["reason"]);

  const { error } = await client.from("commission_transactions").insert({
    commission_id: d.commissionId,
    entry_type: d.entryType,
    amount_minor: d.amount,
    currency: "USD", // overwritten by the database with the receivable's currency
    occurred_on: d.occurredOn,
    payment_method: d.entryType === "payment" ? (d.method ?? null) : null,
    reference: d.reference ?? null,
    reason: d.reason ?? null,
    notes: d.notes ?? null,
    reverses_id: d.entryType === "reversal" ? (d.reversesId ?? null) : null,
    recorded_by: access.userId,
  });
  if (error) return fail(mapDatabaseError(error));

  refresh(formData, `/commissions/${d.commissionId}`, "/commissions", "/finance");
  return ok("entryRecorded");
}

// ------------------------------------------------------------------ payouts

export async function requestPayoutAction(_p: FinanceFormState, formData: FormData): Promise<FinanceFormState> {
  const { access, client } = await ctx();
  if (!canRequestPayouts(access.role)) return fail("forbidden");

  const parsed = payoutRequestSchema.safeParse(entries(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;

  const { error } = await client.from("agent_payouts").insert({
    deal_id: d.dealId,
    amount_minor: d.amount,
    currency: "USD", // overwritten by the deal's currency
    agent_id: access.userId, // overwritten by the deal's agent
    requested_by: access.userId,
    notes: d.notes ?? null,
  });
  if (error) return fail(mapDatabaseError(error));

  refresh(formData, `/deals/${d.dealId}`, "/payouts");
  return ok("requested");
}

export async function decidePayoutAction(_p: FinanceFormState, formData: FormData): Promise<FinanceFormState> {
  const { access, client } = await ctx();
  const parsed = payoutDecisionSchema.safeParse(entries(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;

  // Role pre-check; the database trigger repeats it (including four-eyes).
  const needs: Record<typeof d.decision, (r: typeof access.role) => boolean> = {
    approve: canApprove,
    reject: canApprove,
    cancel: (r) => canApprove(r) || canRequestPayouts(r),
    pay: canMarkPayoutPaid,
    reverse: canMarkPayoutPaid,
  };
  if (!needs[d.decision](access.role)) return fail("forbidden");

  const base = { reason: d.reason ?? null };
  const changes =
    d.decision === "approve"
      ? { status: "approved" as const }
      : d.decision === "reject"
        ? { status: "rejected" as const, ...base }
        : d.decision === "cancel"
          ? { status: "cancelled" as const, ...base }
          : d.decision === "reverse"
            ? { status: "reversed" as const, ...base }
            : {
                status: "paid" as const,
                paid_on: d.paidOn ?? null,
                payment_method: d.method ?? null,
                payment_reference: d.reference ?? null,
              };

  if (["reject", "cancel", "reverse"].includes(d.decision) && !d.reason) return fail("reasonRequired", ["reason"]);
  if (d.decision === "pay") {
    const missing = [!d.paidOn && "paidOn", !d.method && "method", !d.reference && "reference"].filter(Boolean) as string[];
    if (missing.length) return fail("invalid", missing);
    if (d.paidOn! > today()) return fail("futureDate", ["paidOn"]);
  }

  const { data, error } = await client.from("agent_payouts").update(changes).eq("id", d.id).select("id, deal_id");
  if (error) return fail(mapDatabaseError(error));
  if (!data?.length) return fail("notFound");

  refresh(formData, "/payouts", `/deals/${data[0]!.deal_id}`, "/finance");
  const message = { approve: "approved", reject: "rejected", cancel: "cancelled", pay: "paid", reverse: "reversed" } as const;
  return ok(message[d.decision]);
}

// ----------------------------------------------------------------- expenses

async function uploadPrivate(
  client: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  prefix: string,
  file: File,
): Promise<{ path: string } | { error: FinanceErrorCode }> {
  const path = `${prefix}/${Date.now()}-${safeFileName(file.name)}`;
  const { error } = await client.storage.from("private-docs").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) return { error: "forbidden" };
  return { path };
}

export async function createExpenseAction(_p: FinanceFormState, formData: FormData): Promise<FinanceFormState> {
  const { access, client } = await ctx();
  if (!canCreateExpenses(access.role)) return fail("forbidden");

  const parsed = expenseSchema.safeParse(entries(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  if (d.date > today()) return fail("futureDate", ["date"]);

  const file = formData.get("receipt");
  const hasFile = file instanceof File && file.size > 0;
  if (hasFile) {
    const problem = checkUpload(file);
    if (problem) return fail(problem, ["receipt"]);
  }

  const { data, error } = await client
    .from("expenses")
    .insert({
      expense_date: d.date,
      category: d.category,
      description: d.description,
      amount_minor: d.amount,
      currency: d.currency,
      payment_method: d.method ?? null,
      vendor: d.vendor ?? null,
      created_by: access.userId,
    })
    .select("id")
    .single();
  if (error) return fail(mapDatabaseError(error));

  if (hasFile) {
    const uploaded = await uploadPrivate(client, `expenses/${data.id}`, file);
    if ("error" in uploaded) return fail(uploaded.error);
    await client.from("expenses").update({ receipt_path: uploaded.path }).eq("id", data.id);
  }

  refresh(formData, "/expenses", "/finance");
  return ok("created", data.id);
}

export async function attachReceiptAction(_p: FinanceFormState, formData: FormData): Promise<FinanceFormState> {
  const { access, client } = await ctx();
  if (!canCreateExpenses(access.role)) return fail("forbidden");
  const id = String(formData.get("id") ?? "");
  const file = formData.get("receipt");
  const problem = checkUpload(file instanceof File ? file : null);
  if (problem) return fail(problem, ["receipt"]);

  const uploaded = await uploadPrivate(client, `expenses/${id}`, file as File);
  if ("error" in uploaded) return fail(uploaded.error);
  const { data, error } = await client.from("expenses").update({ receipt_path: uploaded.path }).eq("id", id).select("id");
  if (error) return fail(mapDatabaseError(error));
  if (!data?.length) return fail("notFound");

  refresh(formData, "/expenses");
  return ok("uploaded");
}

export async function decideExpenseAction(_p: FinanceFormState, formData: FormData): Promise<FinanceFormState> {
  const { access, client } = await ctx();
  const parsed = expenseDecisionSchema.safeParse(entries(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;

  if (d.decision === "paid") {
    if (!canMarkPayoutPaid(access.role) && !canApprove(access.role)) return fail("forbidden");
    if (!d.paidOn) return fail("invalid", ["paidOn"]);
    if (d.paidOn > today()) return fail("futureDate", ["paidOn"]);
  } else if (!canApprove(access.role)) {
    return fail("forbidden");
  }
  if (d.decision === "reject" && !d.reason) return fail("reasonRequired", ["reason"]);

  const changes =
    d.decision === "approve"
      ? { status: "approved" as const }
      : d.decision === "reject"
        ? { status: "rejected" as const, rejection_reason: d.reason ?? null }
        : { paid_on: d.paidOn ?? null };

  const { data, error } = await client.from("expenses").update(changes).eq("id", d.id).select("id");
  if (error) return fail(mapDatabaseError(error));
  if (!data?.length) return fail("notFound");

  refresh(formData, "/expenses", "/finance");
  return ok(d.decision === "approve" ? "approved" : d.decision === "reject" ? "rejected" : "paid");
}

// ----------------------------------------------------------------- documents

export async function uploadDealDocumentAction(_p: FinanceFormState, formData: FormData): Promise<FinanceFormState> {
  const { access, client } = await ctx();
  if (!canViewDeals(access.role)) return fail("forbidden");

  const dealId = String(formData.get("dealId") ?? "");
  const kind = documentKind.safeParse(formData.get("kind"));
  if (!kind.success || !/^[0-9a-f-]{36}$/i.test(dealId)) return fail("invalid", ["kind"]);
  const file = formData.get("file");
  const problem = checkUpload(file instanceof File ? file : null);
  if (problem) return fail(problem, ["file"]);

  const uploaded = await uploadPrivate(client, `deals/${dealId}`, file as File);
  if ("error" in uploaded) return fail(uploaded.error);

  const { error } = await client.from("deal_documents").insert({
    deal_id: dealId,
    kind: kind.data,
    storage_path: uploaded.path,
    file_name: safeFileName((file as File).name),
    uploaded_by: access.userId,
  });
  if (error) return fail(mapDatabaseError(error));

  refresh(formData, `/deals/${dealId}`);
  return ok("uploaded");
}

// ----------------------------------------------------------------- settings

export async function updateFinanceSettingsAction(_p: FinanceFormState, formData: FormData): Promise<FinanceFormState> {
  const { access, client } = await ctx();
  if (!canEditFinanceSettings(access.role)) return fail("forbidden");

  const parsed = settingsSchema.safeParse(entries(formData));
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;

  const { data, error } = await client
    .from("finance_settings")
    .update({
      commission_earned_rule: d.earnedRule,
      payout_eligibility_rule: d.payoutRule,
      default_commission_method: d.defaultMethod ?? null,
      default_commission_rate: d.defaultRate === undefined ? null : Number(d.defaultRate),
      default_commission_fixed_minor: d.defaultFixed ?? null,
      default_agent_share_method: d.defaultShareMethod,
      default_agent_share_rate: d.defaultShareRate === undefined ? null : Number(d.defaultShareRate),
      default_agent_share_fixed_minor: d.defaultShareFixed ?? null,
      updated_by: access.userId,
    })
    .eq("singleton", true)
    .select("singleton");
  if (error) return fail(mapDatabaseError(error));
  if (!data?.length) return fail("forbidden");

  refresh(formData, "/finance");
  return ok("saved");
}
