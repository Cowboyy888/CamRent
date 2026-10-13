import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import type { StaffRole } from "@/lib/staff-roles";
import { dashboardPath } from "@/server/auth/constants";
import { canGenerate, type DocumentType } from "@/server/documents/catalog";

/** Shortcuts to the document center with the record already selected (only for types the role may create). */
export function DocumentLinks({
  role,
  locale,
  dict,
  entityId,
  types,
}: {
  role: StaffRole;
  locale: Locale;
  dict: Dictionary;
  entityId: string;
  types: DocumentType[];
}) {
  const allowed = types.filter((type) => canGenerate(role, type));
  if (allowed.length === 0) return null;
  return (
    <ul className="mt-3 flex flex-wrap gap-2" aria-label={dict.ops.documents.title}>
      {allowed.map((type) => (
        <li key={type}>
          <Link
            href={`${dashboardPath(locale, "/documents")}?type=${type}&entity=${entityId}`}
            className="inline-flex min-h-11 items-center rounded-control border border-sand-300 bg-white px-3 text-sm font-semibold text-mekong-700 hover:bg-mekong-50 sm:min-h-9"
          >
            {dict.ops.documents.types[type].name}
          </Link>
        </li>
      ))}
    </ul>
  );
}
