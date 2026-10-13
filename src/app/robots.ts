import type { MetadataRoute } from "next";
import { getEnv } from "@/config/env";

/**
 * The CRM, sign-in and API are never for search engines (the dashboard also
 * sends noindex). Locale prefixes are matched with wildcards.
 */
export default function robots(): MetadataRoute.Robots {
  const site = getEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/api/",
          "/auth/",
          "/*/dashboard",
          "/*/login",
          "/*/forgot-password",
          "/*/reset-password",
        ],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
    host: site,
  };
}
