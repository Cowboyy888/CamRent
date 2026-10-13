/**
 * Supported locales. The route segment (`/en`, `/km`, `/zh`) is kept short;
 * `htmlLang` is the BCP 47 tag used for `<html lang>` and `hreflang`.
 */
export const locales = ["en", "km", "zh"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

/** Cookie that remembers the visitor's last chosen language. */
export const LOCALE_COOKIE = "NEXT_LOCALE";

export const localeMeta: Record<
  Locale,
  { htmlLang: string; nativeName: string; englishName: string }
> = {
  en: { htmlLang: "en", nativeName: "English", englishName: "English" },
  km: { htmlLang: "km", nativeName: "ខ្មែរ", englishName: "Khmer" },
  zh: {
    htmlLang: "zh-Hans",
    nativeName: "中文",
    englishName: "Simplified Chinese",
  },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}
