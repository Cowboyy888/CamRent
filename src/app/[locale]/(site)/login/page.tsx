import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { getDictionary, getLocale } from "@/i18n/server";
import { getAdminAccess } from "@/server/auth/admin-access";
import { dashboardPath } from "@/server/auth/constants";
import { safeNextPath } from "@/server/auth/redirect";

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary();
  return { title: dict.auth.login.title, robots: { index: false, follow: false } };
}

/** Reads the query string and the session, so it renders per request. */
async function LoginContent({ searchParams }: { searchParams: PageProps<"/[locale]/login">["searchParams"] }) {
  const [locale, dict, params] = await Promise.all([getLocale(), getDictionary(), searchParams]);

  // Already signed in as staff: go straight to the workspace.
  const access = await getAdminAccess();
  if (access.status === "authenticated") redirect(dashboardPath(locale));

  const next = safeNextPath(
    typeof params.next === "string" ? params.next : undefined,
    dashboardPath(locale),
  );
  const linkExpired = params.error === "link";

  return (
    <AuthCard title={dict.auth.login.title} intro={dict.auth.login.intro}>
      {linkExpired ? (
        <p role="alert" className="mb-4 rounded-control bg-warning-50 p-3 text-sm text-warning">
          {dict.auth.login.linkExpired}
        </p>
      ) : null}
      <LoginForm locale={locale} dict={dict} next={next} />
      <p className="mt-6 text-xs text-muted">{dict.auth.login.noAccountNote}</p>
    </AuthCard>
  );
}

export default function LoginPage({ searchParams }: PageProps<"/[locale]/login">) {
  return (
    <Suspense fallback={null}>
      <LoginContent searchParams={searchParams} />
    </Suspense>
  );
}
