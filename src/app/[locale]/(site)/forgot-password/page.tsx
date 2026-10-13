import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { getDictionary, getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary();
  return { title: dict.auth.forgot.title, robots: { index: false, follow: false } };
}

export default async function ForgotPasswordPage() {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  return (
    <AuthCard title={dict.auth.forgot.title} intro={dict.auth.forgot.intro}>
      <ForgotPasswordForm locale={locale} dict={dict} />
    </AuthCard>
  );
}
