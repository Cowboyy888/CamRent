import type { Metadata, Viewport } from "next";
import { getEnv } from "@/config/env";
import { siteConfig } from "@/config/site";
import { fontVariables } from "@/fonts";
import { locales, localeMeta } from "@/i18n/config";
import { interpolate } from "@/i18n/dictionaries";
import { getDictionary, getLocale } from "@/i18n/server";
import "../globals.css";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary();
  return {
    metadataBase: new URL(getEnv().NEXT_PUBLIC_SITE_URL),
    title: {
      default: interpolate(dict.meta.title, { brand: siteConfig.name }),
      template: `%s | ${siteConfig.name}`,
    },
    description: dict.meta.description,
    applicationName: siteConfig.name,
  };
}

export const viewport: Viewport = {
  themeColor: "#0b1f2a",
};

/**
 * Root layout for every language: <html lang>, fonts, metadata. The public
 * site chrome lives in (site)/layout.tsx and the CRM chrome in
 * (crm)/dashboard/layout.tsx, so the two never share a header.
 */
export default async function RootLocaleLayout({ children }: LayoutProps<"/[locale]">) {
  const locale = await getLocale();

  return (
    <html lang={localeMeta[locale].htmlLang} className={fontVariables}>
      <body className="flex min-h-dvh flex-col">{children}</body>
    </html>
  );
}
