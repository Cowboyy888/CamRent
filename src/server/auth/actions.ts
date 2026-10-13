"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { readSupabasePublicEnv } from "@/config/supabase-env";
import { getEnv } from "@/config/env";
import { LOCALE_COOKIE } from "@/i18n/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveAdminAccess } from "./access";
import { dashboardPath, localeOrDefault, staffLoginPath } from "./constants";
import { MIN_PASSWORD_LENGTH, type AuthFormState } from "./form-state";
import { safeNextPath } from "./redirect";

const emailSchema = z.email().max(254);

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function isRateLimit(error: { status?: number; code?: string }): boolean {
  return error.status === 429 || error.code === "over_request_rate_limit" ||
    error.code === "over_email_send_rate_limit";
}

export async function signInAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = field(formData, "email").trim();
  const password = field(formData, "password");

  if (!readSupabasePublicEnv().ok) return { error: "notConfigured", email };
  if (!emailSchema.safeParse(email).success || password.length === 0 || password.length > 256) {
    return { error: "invalidInput", email };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    if (error && isRateLimit(error)) return { error: "rateLimited", email };
    // 400 = wrong email or password; the same answer for unknown accounts.
    if (error?.status === 400) return { error: "invalidCredentials", email };
    return { error: "unexpected", email };
  }

  // Authentication is not authorisation: the account must also be active staff.
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, is_active")
    .eq("id", data.user.id)
    .maybeSingle();
  const access = resolveAdminAccess(data.user.id, data.user.email ?? null, profile);
  if (access.status !== "authenticated") {
    await supabase.auth.signOut();
    return { error: "noAccess", email };
  }

  redirect(
    safeNextPath(
      field(formData, "next"),
      dashboardPath(localeOrDefault(field(formData, "locale"))),
    ),
  );
}

export async function requestPasswordResetAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = field(formData, "email").trim();

  if (!readSupabasePublicEnv().ok) return { error: "notConfigured", email };
  if (!emailSchema.safeParse(email).success) return { error: "invalidInput", email };

  const supabase = await createSupabaseServerClient();
  const siteUrl = getEnv().NEXT_PUBLIC_SITE_URL;
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/confirm`,
  });
  if (error && isRateLimit(error)) return { error: "rateLimited", email };

  // Same answer whether or not the address belongs to an account, so this
  // form cannot be used to discover who has one.
  return { done: true, email };
}

export async function updatePasswordAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!readSupabasePublicEnv().ok) return { error: "notConfigured" };

  const password = field(formData, "password");
  const confirm = field(formData, "confirmPassword");
  if (password.length < MIN_PASSWORD_LENGTH) return { error: "passwordTooShort" };
  if (password.length > 256) return { error: "invalidInput" };
  if (password !== confirm) return { error: "passwordMismatch" };

  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) return { error: "sessionExpired" };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (isRateLimit(error)) return { error: "rateLimited" };
    // Weak or reused password rejections come back as 422.
    if (error.status === 422) return { error: "passwordTooShort" };
    return { error: "unexpected" };
  }

  const store = await cookies();
  redirect(dashboardPath(localeOrDefault(store.get(LOCALE_COOKIE)?.value)));
}

export async function signOutAction(): Promise<void> {
  if (readSupabasePublicEnv().ok) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  const store = await cookies();
  redirect(staffLoginPath(localeOrDefault(store.get(LOCALE_COOKIE)?.value)));
}
