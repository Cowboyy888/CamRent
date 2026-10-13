import { defaultLocale, isLocale, type Locale } from "@/i18n/config";

/** Localised staff sign-in page: "/km/login". */
export function staffLoginPath(locale: Locale = defaultLocale): string {
  return `/${locale}/login`;
}

/** CRM dashboard (or a page below it): dashboardPath("km", "/leads") -> "/km/dashboard/leads". */
export function dashboardPath(locale: Locale = defaultLocale, sub = ""): string {
  return `/${locale}/dashboard${sub}`;
}

/** Locale from a raw cookie/form value, with the default as fallback. */
export function localeOrDefault(value: unknown): Locale {
  return isLocale(value) ? value : defaultLocale;
}
