import type { Metadata } from "next";
import { locales, localeMeta, defaultLocale, type Locale } from "@/i18n/config";
import { localizedPath } from "@/i18n/paths";

/**
 * Canonical + hreflang alternates for a page that exists in every language.
 * `path` is locale-independent, e.g. "/" or "/about".
 */
export function localeAlternates(locale: Locale, path: string): Metadata["alternates"] {
  const languages: Record<string, string> = {};
  for (const code of locales) {
    languages[localeMeta[code].htmlLang] = localizedPath(code, path);
  }
  languages["x-default"] = localizedPath(defaultLocale, path);
  return { canonical: localizedPath(locale, path), languages };
}
