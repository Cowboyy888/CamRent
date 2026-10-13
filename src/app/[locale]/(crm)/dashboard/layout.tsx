import type { Metadata } from "next";
import { Suspense } from "react";
import { CrmShell } from "@/components/crm/crm-shell";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import { requireAdminAccess } from "@/server/auth/admin-access";

/** The CRM is private: never indexed. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({ children }: LayoutProps<"/[locale]/dashboard">) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  return (
    <Suspense fallback={<AccessCheck label={dict.crm.common.loading} />}>
      <Gate locale={locale} dict={dict}>
        {children}
      </Gate>
    </Suspense>
  );
}

/**
 * Chrome for staff-only routes. Access is checked per request. This layout
 * check is not the security boundary on its own: each page and Server Action
 * calls requireAdminAccess() / requireRole() itself, and RLS is the last line.
 */
async function Gate({
  locale,
  dict,
  children,
}: {
  locale: Locale;
  dict: Dictionary;
  children: React.ReactNode;
}) {
  const access = await requireAdminAccess();
  return (
    <CrmShell user={{ fullName: access.fullName, role: access.role }} locale={locale} dict={dict}>
      {children}
    </CrmShell>
  );
}

function AccessCheck({ label }: { label: string }) {
  return <div className="grid min-h-dvh place-items-center bg-sand-100 text-sm text-muted">{label}</div>;
}
