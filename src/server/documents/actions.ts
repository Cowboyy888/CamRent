"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isLocale, type Locale } from "@/i18n/config";
import { loadDictionary } from "@/i18n/dictionaries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminAccess } from "@/server/auth/admin-access";
import { dashboardPath, localeOrDefault } from "@/server/auth/constants";
import { canGenerate, documentFileName, effectiveLocale, isDocumentType } from "./catalog";
import { loadDocumentData } from "./data";
import { renderDocument } from "./render";

export interface DocumentFormState {
  status: "idle" | "success" | "error";
  error?: "invalid" | "forbidden" | "notFound" | "render" | "unexpected";
  id?: string;
  reference?: string;
}

const schema = z.object({ type: z.string(), entityId: z.guid(), locale: z.string() });

/**
 * Creates a numbered PDF. Order matters: the reference number is allocated by
 * the database row first (so it can be printed), the file is rendered from
 * data read through the caller's own session (so Row Level Security decides
 * what may be printed), then stored privately. Any step failing leaves an
 * incomplete record that is shown as such, never a half-written file.
 */
export async function generateDocumentAction(
  _previous: DocumentFormState,
  formData: FormData,
): Promise<DocumentFormState> {
  const access = await requireAdminAccess();
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success || !isDocumentType(parsed.data.type) || !isLocale(parsed.data.locale)) {
    return { status: "error", error: "invalid" };
  }
  const type = parsed.data.type;
  const entityId = parsed.data.entityId;
  if (!canGenerate(access.role, type)) return { status: "error", error: "forbidden" };

  const locale: Locale = effectiveLocale(type, parsed.data.locale);
  const client = await createSupabaseServerClient();

  const canSeeCommission = ["super_admin", "manager", "finance"].includes(access.role);
  const data = await loadDocumentData(client, type, entityId, locale, canSeeCommission);
  if (!data) return { status: "error", error: "notFound" };

  const { data: row, error } = await client
    .from("generated_documents")
    .insert({
      doc_type: type,
      entity_id: entityId,
      locale,
      generated_by: access.userId,
      reference: "pending", // replaced by the database
    })
    .select("id, reference")
    .single();
  if (error || !row) {
    return { status: "error", error: error?.code === "42501" ? "forbidden" : "unexpected" };
  }

  let pdf: Buffer;
  try {
    pdf = await renderDocument(data, {
      dict: await loadDictionary(locale),
      locale,
      reference: row.reference,
      issuedAt: new Date(),
      preparedBy: access.fullName,
    });
  } catch {
    return { status: "error", error: "render", reference: row.reference };
  }

  const fileName = documentFileName(row.reference, locale);
  const path = `generated/${row.id}/${fileName}`;
  const upload = await client.storage.from("private-docs").upload(path, pdf, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (upload.error) return { status: "error", error: "unexpected", reference: row.reference };

  const { error: finishError } = await client
    .from("generated_documents")
    .update({ storage_path: path, file_name: fileName })
    .eq("id", row.id);
  if (finishError) return { status: "error", error: "unexpected", reference: row.reference };

  const ui = localeOrDefault(formData.get("uiLocale"));
  revalidatePath(dashboardPath(ui, "/documents"));
  return { status: "success", id: row.id, reference: row.reference };
}
