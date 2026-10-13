import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabasePublicEnv } from "@/config/supabase-env";
import type { Database } from "@/types/database";

/**
 * Refreshes the Supabase session cookie for a request, from proxy.ts.
 *
 * Server Components cannot write cookies, so a token refresh has to happen
 * here, before rendering. The returned `response` carries the refreshed
 * cookies and must be the response (or the base of the redirect) you send.
 * `userId` is only set when the JWT verified, never from an unverified
 * cookie.
 */
export async function refreshSession(
  request: NextRequest,
  env: SupabasePublicEnv,
): Promise<{ response: NextResponse; userId: string | null }> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(env.url, env.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // Responses that set auth cookies must not be cached by a CDN.
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  return { response, userId: data?.claims.sub ?? null };
}

/** Copies refreshed auth cookies from one response onto another (e.g. a redirect). */
export function copyCookies(from: NextResponse, to: NextResponse): NextResponse {
  for (const cookie of from.cookies.getAll()) to.cookies.set(cookie);
  return to;
}
