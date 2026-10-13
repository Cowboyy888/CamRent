import type { StaffRole } from "@/lib/staff-roles";
import type { Database } from "@/types/database";

export type DocumentType = Database["public"]["Enums"]["document_type"];

export const documentTypes = [
  "listing_sheet",
  "inquiry_summary",
  "viewing_confirmation",
  "deal_summary",
  "commission_statement",
  "payout_statement",
  "landlord_submission",
  "agreement_draft",
] as const satisfies readonly DocumentType[];

/**
 * Which roles may create each document. The database repeats this (and
 * additionally requires access to the specific record) in
 * private.can_generate_document(); this table only decides what to offer.
 */
const roles: Record<DocumentType, readonly StaffRole[]> = {
  listing_sheet: ["super_admin", "manager", "agent", "marketing"],
  inquiry_summary: ["super_admin", "manager", "agent"],
  viewing_confirmation: ["super_admin", "manager", "agent"],
  deal_summary: ["super_admin", "manager", "agent", "finance"],
  commission_statement: ["super_admin", "manager", "finance"],
  payout_statement: ["super_admin", "manager", "agent", "finance"],
  landlord_submission: ["super_admin", "manager"],
  agreement_draft: ["super_admin", "manager"],
};

export function canGenerate(role: StaffRole, type: DocumentType): boolean {
  return roles[type].includes(role);
}

export function generatableTypes(role: StaffRole): DocumentType[] {
  return documentTypes.filter((t) => canGenerate(role, t));
}

export function isDocumentType(value: unknown): value is DocumentType {
  return typeof value === "string" && (documentTypes as readonly string[]).includes(value);
}

/** The draft agreement template is English only: legal wording must come from counsel. */
export function effectiveLocale(type: DocumentType, requested: "en" | "km" | "zh"): "en" | "km" | "zh" {
  return type === "agreement_draft" ? "en" : requested;
}

/** Consistent file name: CamRent_<reference>_<language>.pdf */
export function documentFileName(reference: string, locale: string): string {
  return `CamRent_${reference}_${locale}.pdf`;
}
