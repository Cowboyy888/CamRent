import type { MetadataRoute } from "next";
import { getEnv } from "@/config/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/admin/"] }],
    host: getEnv().NEXT_PUBLIC_SITE_URL,
  };
}
