import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { readSupabasePublicEnv } from "@/config/supabase-env";
import { LOCALE_COOKIE } from "@/i18n/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { localeOrDefault } from "@/server/auth/constants";

/**
 * Landing point for the links in invitation and password-reset emails
 * (templates in supabase/templates). Verifies the one-time token, which
 * starts a session, then sends the person to the "choose a password" page.
 * Only these two email types are accepted; sign-up confirmation is not,
 * because there is no public sign-up.
 */
const allowedTypes: readonly EmailOtpType[] = ["recovery", "invite"];

export async function GET(request: NextRequest) {
  const locale = localeOrDefault(request.cookies.get(LOCALE_COOKIE)?.value);
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;

  const failure = new URL(`/${locale}/login?error=link`, request.url);
  if (!tokenHash || !type || !allowedTypes.includes(type) || !readSupabasePublicEnv().ok) {
    return NextResponse.redirect(failure);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return NextResponse.redirect(failure);

  return NextResponse.redirect(new URL(`/${locale}/reset-password`, request.url));
}
