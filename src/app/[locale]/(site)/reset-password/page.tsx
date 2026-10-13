import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { buttonClasses } from "@/components/ui/button";
import { readSupabasePublicEnv } from "@/config/supabase-env";
import { interpolate } from "@/i18n/dictionaries";
import { localizedPath } from "@/i18n/paths";
import { getDictionary, getLocale } from "@/i18n/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MIN_PASSWORD_LENGTH } from "@/server/auth/form-state";

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary();
  return { title: dict.auth.reset.title, robots: { index: false, follow: false } };
}

/**
 * Reached from an invitation or reset email, after /auth/confirm has started
 * a session. Without a verified session the form would be useless, so an
 * "expired link" state is shown instead.
 */
async function ResetContent() {
  // Depends on the visitor's session cookie: never prerender this state.
  await connection();
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  const t = dict.auth.reset;

  let hasSession = false;
  if (readSupabasePublicEnv().ok) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getClaims();
    hasSession = Boolean(data?.claims.sub);
  }

  if (!hasSession) {
    return (
      <AuthCard title={t.expiredTitle} intro={t.expiredBody}>
        <Link
          href={localizedPath(locale, "/forgot-password")}
          className={buttonClasses({ variant: "primary", size: "lg", className: "w-full" })}
        >
          {t.requestNew}
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t.title} intro={interpolate(t.intro, { min: MIN_PASSWORD_LENGTH })}>
      <ResetPasswordForm dict={dict} />
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetContent />
    </Suspense>
  );
}
