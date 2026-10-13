"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canAssignLeads, canWorkLeads } from "@/lib/crm/permissions";
import { selectableStages, stagesWithReason } from "@/lib/crm/stages";
import { parsePhnomPenhDateTime } from "@/lib/crm/time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminAccess } from "@/server/auth/admin-access";
import { dashboardPath, localeOrDefault } from "@/server/auth/constants";
import type { Database } from "@/types/database";
import { propertyCategories } from "@/types/property";

/**
 * Lead management actions. Each one: (1) verifies the signed-in staff role
 * on the server, (2) validates input with zod, (3) writes through the
 * caller's own Supabase session, so Row Level Security and the history
 * trigger apply exactly as they would for any other client.
 */

export type CrmErrorCode =
  | "invalid"
  | "contactRequired"
  | "forbidden"
  | "notFound"
  | "reasonRequired"
  | "agentInvalid"
  | "assignFirst"
  | "propertyNotFound"
  | "unexpected";

export interface CrmFormState {
  status: "idle" | "success" | "error";
  error?: CrmErrorCode;
  fields?: string[];
  /** Which success message to show (a key of lead.messages). */
  message?: "saved" | "stageChanged" | "assigned" | "noteAdded" | "viewingScheduled";
}

const blank = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;
const text = (max: number) => z.preprocess(blank, z.string().trim().max(max).optional());
const whole = (min: number, max: number) =>
  z.preprocess(blank, z.coerce.number().int().min(min).max(max).optional());

const idField = z.guid();
const phone = z.preprocess(
  blank,
  z
    .string()
    .trim()
    .max(30)
    .regex(/^\+?[0-9\s().-]+$/)
    .refine((v) => {
      const digits = v.replace(/\D/g, "").length;
      return digits >= 6 && digits <= 20;
    })
    .optional(),
);
const email = z.preprocess(blank, z.email().max(254).optional());

function values(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

function failed(error: z.ZodError): CrmFormState {
  return {
    status: "error",
    error: "invalid",
    fields: [...new Set(error.issues.map((i) => String(i.path[0] ?? "form")))],
  };
}

function refresh(formData: FormData, leadId: string) {
  const locale = localeOrDefault(formData.get("locale"));
  revalidatePath(dashboardPath(locale, `/leads/${leadId}`));
  revalidatePath(dashboardPath(locale, "/leads"));
  revalidatePath(dashboardPath(locale));
}

async function context() {
  const access = await requireAdminAccess();
  const client = await createSupabaseServerClient();
  return { access, client };
}

// ------------------------------------------------------------------ details

const detailsSchema = z.object({
  id: idField,
  name: z.string().trim().min(1).max(120),
  phone,
  email,
  language: z.enum(["en", "km", "zh"]),
  area: text(120),
  category: z.preprocess(blank, z.enum(propertyCategories).optional()),
  bedrooms: whole(0, 20),
  budgetMin: whole(0, 10_000_000),
  budgetMax: whole(0, 10_000_000),
  currency: z.enum(["USD", "KHR"]),
  moveIn: z.preprocess(blank, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  period: whole(1, 120),
  requirements: text(2000),
  followUp: z.preprocess(blank, z.string().optional()),
});

export async function updateLeadDetailsAction(
  _previous: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const { access, client } = await context();
  if (!canWorkLeads(access.role)) return { status: "error", error: "forbidden" };

  const parsed = detailsSchema.safeParse(values(formData));
  if (!parsed.success) return failed(parsed.error);
  const d = parsed.data;
  if (!d.phone && !d.email) {
    return { status: "error", error: "contactRequired", fields: ["phone", "email"] };
  }
  if (d.budgetMin !== undefined && d.budgetMax !== undefined && d.budgetMax < d.budgetMin) {
    return { status: "error", error: "invalid", fields: ["budgetMin", "budgetMax"] };
  }
  let followUp: string | null = null;
  if (d.followUp) {
    followUp = parsePhnomPenhDateTime(d.followUp);
    if (!followUp) return { status: "error", error: "invalid", fields: ["followUp"] };
  }

  const { data, error } = await client
    .from("leads")
    .update({
      customer_name: d.name,
      phone: d.phone ?? null,
      email: d.email ?? null,
      preferred_language: d.language,
      preferred_area: d.area ?? null,
      property_category: d.category ?? null,
      bedrooms_wanted: d.bedrooms ?? null,
      budget_min_minor: d.budgetMin === undefined ? null : d.budgetMin * 100,
      budget_max_minor: d.budgetMax === undefined ? null : d.budgetMax * 100,
      currency: d.currency,
      desired_move_in: d.moveIn ?? null,
      rental_period_months: d.period ?? null,
      requirements_notes: d.requirements ?? null,
      next_follow_up_at: followUp,
    })
    .eq("id", d.id)
    .select("id");
  if (error) return { status: "error", error: "unexpected" };
  if (!data || data.length === 0) return { status: "error", error: "notFound" };

  refresh(formData, d.id);
  return { status: "success", message: "saved" };
}

// -------------------------------------------------------------------- stage

const stageSchema = z.object({
  id: idField,
  stage: z.enum(selectableStages as [string, ...string[]]),
  reason: text(500),
  note: text(2000),
});

export async function changeLeadStageAction(
  _previous: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const { access, client } = await context();
  if (!canWorkLeads(access.role)) return { status: "error", error: "forbidden" };

  const parsed = stageSchema.safeParse(values(formData));
  if (!parsed.success) return failed(parsed.error);
  const { id, note } = parsed.data;
  const stage = parsed.data.stage as Database["public"]["Enums"]["lead_stage"];

  // "Lost" must say why; the other side statuses may.
  const needsReason = stage === "lost";
  if (needsReason && !parsed.data.reason) {
    return { status: "error", error: "reasonRequired", fields: ["reason"] };
  }
  const reason = stagesWithReason.includes(stage) ? (parsed.data.reason ?? null) : null;

  const { data, error } = await client
    .from("leads")
    .update({ stage, lost_reason: reason })
    .eq("id", id)
    .select("id");
  if (error) return { status: "error", error: "unexpected" };
  if (!data || data.length === 0) return { status: "error", error: "notFound" };

  if (note) {
    const { error: noteError } = await client.from("lead_activities").insert({
      lead_id: id,
      performed_by: access.userId,
      activity_type: "note",
      notes: note,
    });
    if (noteError) return { status: "error", error: "unexpected" };
  }

  refresh(formData, id);
  return { status: "success", message: "stageChanged" };
}

// --------------------------------------------------------------- assignment

const assignSchema = z.object({
  id: idField,
  agentId: z.preprocess(blank, z.guid().optional()),
});

export async function assignLeadAction(
  _previous: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const { access, client } = await context();
  // Server-side role check; RLS repeats it for agents.
  if (!canAssignLeads(access.role)) return { status: "error", error: "forbidden" };

  const parsed = assignSchema.safeParse(values(formData));
  if (!parsed.success) return failed(parsed.error);
  const { id, agentId } = parsed.data;

  if (agentId) {
    const { data: agent } = await client
      .from("staff_names")
      .select("id")
      .eq("id", agentId)
      .eq("role", "agent")
      .maybeSingle();
    if (!agent) return { status: "error", error: "agentInvalid", fields: ["agentId"] };
  }

  const { data, error } = await client
    .from("leads")
    .update({ assigned_agent_id: agentId ?? null })
    .eq("id", id)
    .select("id");
  if (error) return { status: "error", error: "unexpected" };
  if (!data || data.length === 0) return { status: "error", error: "notFound" };

  refresh(formData, id);
  return { status: "success", message: "assigned" };
}

// -------------------------------------------------------------------- notes

const noteSchema = z.object({ id: idField, note: z.string().trim().min(1).max(2000) });

export async function addLeadNoteAction(
  _previous: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const { access, client } = await context();
  if (!canWorkLeads(access.role)) return { status: "error", error: "forbidden" };

  const parsed = noteSchema.safeParse(values(formData));
  if (!parsed.success) return failed(parsed.error);

  const { error } = await client.from("lead_activities").insert({
    lead_id: parsed.data.id,
    performed_by: access.userId,
    activity_type: "note",
    notes: parsed.data.note,
  });
  if (error) {
    // RLS refuses notes on leads the user may not work on.
    return { status: "error", error: error.code === "42501" ? "notFound" : "unexpected" };
  }

  refresh(formData, parsed.data.id);
  return { status: "success", message: "noteAdded" };
}

// ----------------------------------------------------------------- viewings

const viewingSchema = z.object({
  id: idField,
  propertyRef: text(60),
  scheduledAt: z.string().min(1),
});

export async function scheduleViewingAction(
  _previous: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const { access, client } = await context();
  if (!canWorkLeads(access.role)) return { status: "error", error: "forbidden" };

  const parsed = viewingSchema.safeParse(values(formData));
  if (!parsed.success) return failed(parsed.error);
  const scheduledAt = parsePhnomPenhDateTime(parsed.data.scheduledAt);
  if (!scheduledAt) return { status: "error", error: "invalid", fields: ["scheduledAt"] };

  const { data: lead, error: leadError } = await client
    .from("leads")
    .select("id, stage, property_id, assigned_agent_id")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (leadError) return { status: "error", error: "unexpected" };
  if (!lead) return { status: "error", error: "notFound" };
  if (!lead.assigned_agent_id) return { status: "error", error: "assignFirst" };

  let propertyId = lead.property_id;
  if (parsed.data.propertyRef) {
    const { data: property } = await client
      .from("properties")
      .select("id")
      .eq("listing_code", parsed.data.propertyRef)
      .maybeSingle();
    if (!property) return { status: "error", error: "propertyNotFound", fields: ["propertyRef"] };
    propertyId = property.id;
  }
  if (!propertyId) return { status: "error", error: "propertyNotFound", fields: ["propertyRef"] };

  const { error } = await client.from("viewing_appointments").insert({
    lead_id: lead.id,
    property_id: propertyId,
    agent_id: lead.assigned_agent_id,
    scheduled_at: scheduledAt,
  });
  if (error) return { status: "error", error: "unexpected" };

  // Record it in the history, and move early-stage leads forward.
  await client.from("lead_activities").insert({
    lead_id: lead.id,
    performed_by: access.userId,
    activity_type: "viewing",
    notes: scheduledAt,
  });
  if (["new", "contacted", "qualified"].includes(lead.stage)) {
    await client.from("leads").update({ stage: "viewing_scheduled" }).eq("id", lead.id);
  }

  refresh(formData, lead.id);
  return { status: "success", message: "viewingScheduled" };
}
