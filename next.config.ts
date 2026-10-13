import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components + Partial Prefetching are the create-next-app 16.4
  // defaults and become mandatory in the next major release, so we adopt
  // them from day one instead of migrating later.
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  experimental: {
    // Receipt and agreement uploads go through Server Actions (max 4 MB file).
    serverActions: { bodySizeLimit: "5mb" },
  },
  // Step 1 placeholder URLs now live under the new public routes. Query
  // strings are carried over, so old shared search links keep working.
  async redirects() {
    return [
      { source: "/:locale(en|km|zh)/search", destination: "/:locale/properties", permanent: true },
      {
        source: "/:locale(en|km|zh)/rent/residential",
        destination: "/:locale/properties?category=residential",
        permanent: true,
      },
      {
        source: "/:locale(en|km|zh)/rent/commercial",
        destination: "/:locale/properties?category=commercial",
        permanent: true,
      },
      {
        source: "/:locale(en|km|zh)/landlords",
        destination: "/:locale/list-your-property",
        permanent: true,
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
