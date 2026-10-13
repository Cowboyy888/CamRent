import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { interpolate, type Dictionary } from "@/i18n/dictionaries";
import { localizedPath } from "@/i18n/paths";
import { getDictionary, getLocale } from "@/i18n/server";
import { localeAlternates } from "@/lib/metadata";
import { PagePlaceholder } from "./page-placeholder";

type PlaceholderKey = keyof Dictionary["pages"];

/**
 * Builds the metadata + page component for a planned public section, so each
 * route file stays a two-line declaration until the real page is built.
 */
export function placeholderRoute(key: PlaceholderKey, path: string) {
  async function generateMetadata(): Promise<Metadata> {
    const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
    return {
      title: interpolate(dict.pages[key].title, { brand: siteConfig.name }),
      alternates: localeAlternates(locale, path),
      robots: { index: false, follow: true },
    };
  }

  async function Page() {
    const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
    const values = { brand: siteConfig.name };
    return (
      <PagePlaceholder
        title={interpolate(dict.pages[key].title, values)}
        body={interpolate(dict.pages[key].body, values)}
        badge={dict.common.comingSoon}
        backLabel={dict.common.backToHome}
        backHref={localizedPath(locale)}
      />
    );
  }

  return { generateMetadata, Page };
}
