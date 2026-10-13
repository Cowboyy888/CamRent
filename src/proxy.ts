import { NextResponse, type NextRequest } from "next/server";
import { readSupabasePublicEnv } from "@/config/supabase-env";
import { isLocale, LOCALE_COOKIE, type Locale } from "@/i18n/config";
import { resolvePreferredLocale } from "@/i18n/negotiate";
import { copyCookies, refreshSession } from "@/lib/supabase/session";
import { dashboardPath, localeOrDefault, staffLoginPath } from "@/server/auth/constants";
import { safeNextPath } from "@/server/auth/redirect";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

const DASHBOARD_PATH = /^\/(en|km|zh)\/dashboard(?:\/|$)/;

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The Step 1-3 CRM lived at /admin; it is now /{locale}/dashboard.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const locale = localeOrDefault(request.cookies.get(LOCALE_COOKIE)?.value);
    const url = request.nextUrl.clone();
    url.pathname = dashboardPath(locale);
    url.search = "";
    return NextResponse.redirect(url, 308);
  }

  const match = DASHBOARD_PATH.exec(pathname);
  if (match) return dashboardProxy(request, localeOrDefault(match[1]));
  return localeProxy(request);
}

/**
 * Optimistic CRM check. It refreshes the Supabase session cookie (Server
 * Components cannot write cookies) and sends requests without a verified
 * session to the sign-in page with a real redirect before anything renders.
 *
 * It only proves "signed in", not "active staff with this role". Pages
 * verify that themselves (src/server/auth/admin-access.ts), and the database
 * enforces it with Row Level Security; this is not the only guard.
 */
async function dashboardProxy(request: NextRequest, locale: Locale) {
  const login = request.nextUrl.clone();
  login.pathname = staffLoginPath(locale);
  const home = dashboardPath(locale);
  const next = safeNextPath(request.nextUrl.pathname + request.nextUrl.search, home);
  login.search = next === home ? "" : `?next=${encodeURIComponent(next)}`;

  const env = readSupabasePublicEnv();
  if (!env.ok) return NextResponse.redirect(login);

  const { response, userId } = await refreshSession(request, env.value);
  if (!userId) return copyCookies(response, NextResponse.redirect(login));
  if (request.cookies.get(LOCALE_COOKIE)?.value !== locale) {
    response.cookies.set(LOCALE_COOKIE, locale, {
      path: "/",
      maxAge: ONE_YEAR_SECONDS,
      sameSite: "lax",
    });
  }
  return response;
}

/**
 * Locale routing for the public website:
 * - "/km/..." passes through and the choice is remembered in a cookie;
 * - any path without a locale ("/", "/about") redirects to the visitor's
 *   saved or browser language, e.g. "/" -> "/km".
 */
function localeProxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const firstSegment = pathname.split("/")[1];

  if (isLocale(firstSegment)) {
    const response = NextResponse.next();
    if (request.cookies.get(LOCALE_COOKIE)?.value !== firstSegment) {
      response.cookies.set(LOCALE_COOKIE, firstSegment, {
        path: "/",
        maxAge: ONE_YEAR_SECONDS,
        sameSite: "lax",
      });
    }
    return response;
  }

  const locale = resolvePreferredLocale({
    cookieLocale: request.cookies.get(LOCALE_COOKIE)?.value,
    acceptLanguage: request.headers.get("accept-language"),
    userAgent: request.headers.get("user-agent"),
  });

  const url = request.nextUrl.clone();
  url.pathname = pathname === "/" ? `/${locale}` : `/${locale}${pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    // Everything except API routes, the auth email-link handler, Next.js
    // internals and files with an extension (robots.txt, icon.svg, fonts).
    "/((?!api(?:/|$)|auth/confirm(?:/|$)|_next/|_vercel/|.*\\.[^/]+$).*)",
  ],
};
