import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { readSupabasePublicEnv } from "@/config/supabase-env";
import { LOCALE_COOKIE } from "@/i18n/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { StaffRole } from "@/lib/staff-roles";
import { resolveAdminAccess, type AdminAccess } from "./access";
import { localeOrDefault, staffLoginPath } from "./constants";

export type { AdminAccess } from "./access";

/**
 * Single entry point for "who may see the CRM".
 *
 * Security model (do not rely on layouts alone):
 * 1. proxy.ts redirects obviously anonymous requests early and refreshes the
 *    session cookie (optimistic check);
 * 2. every protected page and every data function calls
 *    `requireAdminAccess()` / `requireRole()` itself, because pages and
 *    Server Actions render and run independently of their layouts;
 * 3. the database enforces the same rules with Row Level Security, which is
 *    the authoritative layer.
 *
 * The session is verified with `getClaims()` (JWT signature checked), never
 * by trusting the raw cookie. The role comes from public.profiles, not from
 * token metadata the user could edit.
 */
export const getAdminAccess = cache(async (): Promise<AdminAccess> => {
  // Per-request decision: opt out of prerendering. Callers sit in <Suspense>.
  await connection();

  if (!readSupabasePublicEnv().ok) return { status: "anonymous" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return { status: "anonymous" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, is_active")
    .eq("id", claims.sub)
    .maybeSingle();

  const email = typeof claims.email === "string" ? claims.email : null;
  return resolveAdminAccess(claims.sub, email, profile);
});

type Authenticated = Extract<AdminAccess, { status: "authenticated" }>;

/** Returns the caller's access, or redirects to the sign-in page. */
export async function requireAdminAccess(): Promise<Authenticated> {
  const access = await getAdminAccess();
  if (access.status === "anonymous") {
    const store = await cookies();
    redirect(staffLoginPath(localeOrDefault(store.get(LOCALE_COOKIE)?.value)));
  }
  return access;
}

/**
 * Like requireAdminAccess, but also requires one of `roles`. Signed-in staff
 * with the wrong role get a 404 so the page's existence is not revealed.
 */
export async function requireRole(...roles: StaffRole[]): Promise<Authenticated> {
  const access = await requireAdminAccess();
  if (!roles.includes(access.role)) notFound();
  return access;
}
