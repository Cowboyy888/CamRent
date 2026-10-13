import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components + Partial Prefetching are the create-next-app 16.4
  // defaults and become mandatory in the next major release, so we adopt
  // them from day one instead of migrating later.
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // pdfkit reads its own data files at runtime, so it must not be bundled.
  serverExternalPackages: ["pdfkit", "fontkit"],
  // The fonts embedded in generated PDFs are read from disk at runtime.
  outputFileTracingIncludes: {
    "/**": ["./src/fonts/pdf/**/*"],
  },
  experimental: {
    // Receipt and agreement uploads go through Server Actions (max 4 MB file).
    serverActions: { bodySizeLimit: "5mb" },
  },
  // Baseline browser protections for every response. A strict
  // Content-Security-Policy is deliberately not set here: Next.js inline
  // scripts need nonces, which is a separate piece of work (docs/security.md).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
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
