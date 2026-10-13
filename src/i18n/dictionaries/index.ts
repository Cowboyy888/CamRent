import type { Locale } from "../config";
import type { Dictionary } from "./en";

export type { Dictionary } from "./en";

/**
 * Lazy loaders so each request only loads the dictionary it needs.
 * Pure module (no Next.js imports) so tests can load every locale.
 */
const loaders: Record<Locale, () => Promise<Dictionary>> = {
  en: () => import("./en").then((m) => m.en),
  km: () => import("./km").then((m) => m.km),
  zh: () => import("./zh").then((m) => m.zh),
};

export function loadDictionary(locale: Locale): Promise<Dictionary> {
  return loaders[locale]();
}

/** Replaces `{name}` placeholders: interpolate("Hi {name}", { name: "Dara" }). */
export function interpolate(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
