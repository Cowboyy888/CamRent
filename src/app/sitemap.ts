import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { getEnv } from "@/config/env";
import { readSupabasePublicEnv } from "@/config/supabase-env";
import { locales, localeMeta } from "@/i18n/config";
import { localizedPath } from "@/i18n/paths";
import { createSupabasePublicClient } from "@/lib/supabase/public";

const staticPaths = ["/", "/properties", "/list-your-property", "/contact", "/about"];

/**
 * Public pages only: static pages plus published, available listings (read
 * through the anonymous public view). No CRM, login or document URL is listed.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Listings change after the build, so the sitemap is built per request.
  await connection();
  const base = getEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const alternates = (path: string) => ({
    languages: Object.fromEntries(locales.map((l) => [localeMeta[l].htmlLang, `${base}${localizedPath(l, path)}`])),
  });

  const entries: MetadataRoute.Sitemap = staticPaths.flatMap((path) =>
    locales.map((locale) => ({
      url: `${base}${localizedPath(locale, path)}`,
      alternates: alternates(path),
    })),
  );

  if (readSupabasePublicEnv().ok) {
    try {
      const { data } = await createSupabasePublicClient()
        .from("public_properties")
        .select("id, updated_at")
        .order("updated_at", { ascending: false })
        .limit(5000);
      for (const row of data ?? []) {
        if (!row.id) continue;
        const path = `/properties/${row.id}`;
        for (const locale of locales) {
          entries.push({
            url: `${base}${localizedPath(locale, path)}`,
            lastModified: row.updated_at ?? undefined,
            alternates: alternates(path),
          });
        }
      }
    } catch {
      // A database outage must not break the sitemap of static pages.
    }
  }
  return entries;
}
