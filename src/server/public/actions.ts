"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { z } from "zod";
import { readSupabasePublicEnv } from "@/config/supabase-env";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { createSupabaseAdminClient } from "@/server/db/admin-client";
import { MAX_REQUESTS_PER_HOUR, MAX_REQUESTS_PER_HOUR_PER_CLIENT, type PublicFormState } from "./constants";
import { enquirySchema, landlordSubmissionSchema } from "./schemas";

/**
 * Public form submissions. Visitors have no database privileges, so these
 * actions validate on the server and then write with the service-role key,
 * which is used here for exactly two inserts (leads, landlord_submissions)
 * and one count. Nothing a visitor sends decides who sees the record: leads
 * arrive unassigned for a manager to route.
 */

function fieldsOf(error: z.ZodError): string[] {
  return [...new Set(error.issues.map((issue) => String(issue.path[0] ?? "form")))];
}

function formValues(formData: FormData): Record<string, FormDataEntryValue> {
  return Object.fromEntries(formData.entries());
}

/** Bots fill hidden fields that people never see; pretend it worked. */
function isBot(formData: FormData): boolean {
  const trap = formData.get("website");
  return typeof trap === "string" && trap.trim() !== "";
}

/**
 * Counts and records this client's attempts (hashed address; nothing readable
 * is stored). Behind a proxy the first X-Forwarded-For entry is the client;
 * when no address is available (local development) the check is skipped.
 */
async function tooManyFromClient(kind: "enquiry" | "landlord"): Promise<boolean> {
  const h = await headers();
  const address = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || h.get("x-real-ip")?.trim();
  if (!address) return false;
  const clientHash = createHash("sha256")
    .update(`${process.env.RATE_LIMIT_SALT ?? "camrent"}:${address}`)
    .digest("hex");

  const admin = createSupabaseAdminClient();
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await admin.from("form_attempts").delete().lt("created_at", dayAgo);
  const { count, error } = await admin
    .from("form_attempts")
    .select("id", { count: "exact", head: true })
    .eq("client_hash", clientHash)
    .eq("kind", kind)
    .gte("created_at", hourAgo);
  if (error) throw error;
  if ((count ?? 0) >= MAX_REQUESTS_PER_HOUR_PER_CLIENT) return true;
  await admin.from("form_attempts").insert({ client_hash: clientHash, kind });
  return false;
}

async function tooManyRecent(
  table: "leads" | "landlord_submissions",
  contact: { phone?: string; email?: string },
): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  // One equality query per identifier (no free text in a filter string).
  for (const [column, value] of [
    ["phone", contact.phone],
    ["email", contact.email],
  ] as const) {
    if (!value) continue;
    const { count, error } = await admin
      .from(table)
      .select("id", { count: "exact", head: true })
      .gte("created_at", since)
      .eq(column, value);
    if (error) throw error;
    if ((count ?? 0) >= MAX_REQUESTS_PER_HOUR) return true;
  }
  return false;
}

function canWrite(): boolean {
  return readSupabasePublicEnv().ok && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

export async function submitEnquiryAction(
  _previous: PublicFormState,
  formData: FormData,
): Promise<PublicFormState> {
  if (isBot(formData)) return { status: "success" };

  const parsed = enquirySchema.safeParse(formValues(formData));
  if (!parsed.success) {
    const fields = fieldsOf(parsed.error);
    return {
      status: "error",
      error: fields.includes("consent") && fields.length === 1 ? "consentRequired" : "invalid",
      fields,
    };
  }
  const data = parsed.data;
  if (!data.phone && !data.email) {
    return { status: "error", error: "contactRequired", fields: ["phone", "email"] };
  }
  if (!canWrite()) return { status: "error", error: "notConfigured" };

  try {
    if (data.propertyId) {
      // Only listings the public can see may be enquired about.
      const { data: row } = await createSupabasePublicClient()
        .from("public_properties")
        .select("id")
        .eq("id", data.propertyId)
        .maybeSingle();
      if (!row) return { status: "error", error: "propertyUnavailable" };
    }
    if (await tooManyRecent("leads", data) || (await tooManyFromClient("enquiry"))) {
      return { status: "error", error: "rateLimited" };
    }

    const { error } = await createSupabaseAdminClient().from("leads").insert({
      customer_name: data.name,
      phone: data.phone ?? null,
      email: data.email ?? null,
      preferred_language: data.locale,
      source: "website_form",
      property_id: data.propertyId ?? null,
      enquiry_message: data.message ?? null,
    });
    if (error) throw error;
    return { status: "success" };
  } catch {
    return { status: "error", error: "unexpected" };
  }
}

export async function submitLandlordListingAction(
  _previous: PublicFormState,
  formData: FormData,
): Promise<PublicFormState> {
  if (isBot(formData)) return { status: "success" };

  const parsed = landlordSubmissionSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    const fields = fieldsOf(parsed.error);
    return {
      status: "error",
      error: fields.includes("consent") && fields.length === 1 ? "consentRequired" : "invalid",
      fields,
    };
  }
  const data = parsed.data;
  if (!data.phone && !data.email) {
    return { status: "error", error: "contactRequired", fields: ["phone", "email"] };
  }
  // A type must belong to the chosen category.
  if (data.type) {
    const residential = ["apartment", "condo", "serviced_apartment", "villa", "house", "flat"];
    const isResidential = residential.includes(data.type);
    if (isResidential !== (data.category === "residential")) {
      return { status: "error", error: "invalid", fields: ["type"] };
    }
  }
  if (!canWrite()) return { status: "error", error: "notConfigured" };

  try {
    if ((await tooManyRecent("landlord_submissions", data)) || (await tooManyFromClient("landlord"))) {
      return { status: "error", error: "rateLimited" };
    }
    const { error } = await createSupabaseAdminClient().from("landlord_submissions").insert({
      submitter_name: data.name,
      relationship: data.relationship,
      phone: data.phone ?? null,
      email: data.email ?? null,
      preferred_language: data.language,
      property_category: data.category,
      property_type: data.type ?? null,
      district: data.district ?? null,
      neighborhood: data.neighborhood ?? null,
      address: data.address ?? null,
      bedrooms: data.bedrooms ?? null,
      expected_rent_minor: data.expectedRent === undefined ? null : data.expectedRent * 100,
      currency: "USD",
      description: data.description ?? null,
    });
    if (error) throw error;
    return { status: "success" };
  } catch {
    return { status: "error", error: "unexpected" };
  }
}

