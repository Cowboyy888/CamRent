import { defaultLocale, isLocale, type Locale } from "./config";

/** Maps a BCP 47 language tag (e.g. "zh-CN", "km-KH") to a supported locale. */
export function matchLanguageTag(tag: string): Locale | null {
  const primary = tag.trim().toLowerCase().split(/[-_]/)[0];
  if (primary === "en") return "en";
  if (primary === "km") return "km";
  // We only publish Simplified Chinese; it is the closest match for any
  // Chinese variant until a Traditional Chinese locale exists.
  if (primary === "zh") return "zh";
  return null;
}

/**
 * Parses an Accept-Language header into language tags ordered by quality,
 * e.g. "km-KH,km;q=0.9,en;q=0.8" -> ["km-KH", "km", "en"].
 */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const qParam = params.find((p) => p.trim().startsWith("q="));
      const quality = qParam ? Number.parseFloat(qParam.trim().slice(2)) : 1;
      return { tag: tag.trim(), quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter(({ tag, quality }) => tag !== "" && tag !== "*" && quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index)
    .map(({ tag }) => tag);
}

const BOT_PATTERN = /bot|crawler|spider|crawling|slurp|facebookexternalhit|preview/i;

export function isLikelyBot(userAgent: string | null | undefined): boolean {
  return !!userAgent && BOT_PATTERN.test(userAgent);
}

/**
 * Chooses the locale for a request that arrived without a locale prefix.
 * Order: saved cookie -> Accept-Language -> default. Crawlers always get the
 * default so every language version stays crawlable at its own URL.
 */
export function resolvePreferredLocale(input: {
  cookieLocale?: string | null;
  acceptLanguage?: string | null;
  userAgent?: string | null;
}): Locale {
  if (isLikelyBot(input.userAgent)) return defaultLocale;
  if (isLocale(input.cookieLocale)) return input.cookieLocale;
  for (const tag of parseAcceptLanguage(input.acceptLanguage)) {
    const match = matchLanguageTag(tag);
    if (match) return match;
  }
  return defaultLocale;
}
