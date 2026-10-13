import { notFound } from "next/navigation";
import { locale as localeParam } from "next/root-params";
import { isLocale, type Locale } from "./config";
import { loadDictionary, type Dictionary } from "./dictionaries";

/**
 * Current locale from the `[locale]` root segment. Usable in any Server
 * Component under app/[locale] without prop drilling. Unknown values 404.
 */
export async function getLocale(): Promise<Locale> {
  const value = await localeParam();
  if (!isLocale(value)) notFound();
  return value;
}

export async function getDictionary(): Promise<Dictionary> {
  return loadDictionary(await getLocale());
}
