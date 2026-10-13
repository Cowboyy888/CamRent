# 0001: Project foundation (Step 1)

- Status: accepted
- Date: 2026-10-11
- Scope: blueprint Phase 2 groundwork, backlog tasks T-001, T-003, T-004 (partial), T-014 (shell only)

## Context

New repository; no prior application code existed. Requirements come from
`docs/CAMBODIA_PROPERTY_RENTAL_AGENCY_BLUEPRINT.md`. The stack was fixed by
the brief: Next.js App Router, strict TypeScript, Tailwind CSS, ESLint, Git,
with Supabase planned for the next phase.

## Decisions

### Versions: what `create-next-app@16.4.0` ships, pinned

| Package | Version | Why |
|---|---|---|
| next / eslint-config-next | 16.4.0 (exact) | Current stable release |
| react / react-dom | 19.3.0 (exact) | Version Next 16.4 is built and tested with |
| typescript | ^5 (5.9) | Next's TS plugin targets 5.x; TypeScript 7 is newer than Next's tested range |
| eslint | ^9 (9.39) | ESLint 10 exists, but eslint-config-next 16.4 is built on 9 |
| tailwindcss + @tailwindcss/turbopack | ^4 (4.3) | Scaffold default; CSS-first config, no PostCSS file needed |
| zod | 4.6.5 (exact) | Validation for URL params, env vars and, later, forms and API input |
| vitest | 4.1.11 (exact) | Mature, maintained 4.x line; 5.0 is a very recent major |

Only two dependencies were added beyond the scaffold: **zod** (runtime) and
**vitest** (dev). No UI kit, class-merging, i18n or test-renderer libraries.

### Cache Components + Partial Prefetching enabled

These are the 16.4 scaffold defaults and become mandatory in the next major
version. Adopting them now avoids a migration. Consequences we follow:

- Request data (`searchParams`, cookies, sessions) is read inside `<Suspense>`.
- No `new Date()` / `Math.random()` in prerendered code (the copyright year
  comes from `siteConfig`; the skyline uses a fixed seed).
- `dynamicParams` is not used; unknown paths are handled by catch-all
  routes that call `notFound()`.

### Localisation without a library

Built-in pattern from the Next.js i18n guide: `app/[locale]` root layout,
TypeScript dictionaries, and `next/root-params` to read the locale in any
Server Component. TypeScript enforces that `km` and `zh` have exactly the
English keys; tests also check placeholders and empty strings.

- URL segments `/en`, `/km`, `/zh`; `<html lang>` uses `en`, `km`, `zh-Hans`.
- `src/proxy.ts` (Next 16's renamed middleware) redirects locale-less paths
  using cookie, then Accept-Language, then English. Crawlers always get English.
- Language switching uses full page loads so `<html lang>` and fonts update.
- Money and numbers are formatted identically in all languages.

### Self-hosted fonts

Inter, Plus Jakarta Sans and Kantumruy Pro (Khmer) are committed as woff2
files (OFL licences included) and loaded with `next/font/local`. This removes
a build-time dependency on Google Fonts, so builds work offline and in
restricted CI. Kantumruy Pro is not preloaded, so only Khmer pages download it.
Simplified Chinese uses system fonts (PingFang SC, Microsoft YaHei, Noto Sans
CJK SC), avoiding a multi-megabyte CJK web font.

### Admin access seam

`/admin` has its own root layout (English, `noindex`). Access goes through
`src/server/auth/admin-access.ts`:

1. `proxy.ts` sends anonymous requests to `/admin/login` with a real 307;
2. the protected layout and **each protected page** call
   `requireAdminAccess()`.

During verification a layout-only check was found to still send the page's
own output, which is why pages check access themselves. Until Phase 2 there
is no sign-in; `CAMRENT_ADMIN_PREVIEW=true` shows the shell in development
only and is ignored in production builds.

### No fake data

The homepage and search page show honest empty states. `PropertyCard` exists
and is tested with a fixture, but is not rendered until real listings exist.
Contact details in `siteConfig` stay `null` until confirmed.

## Known issues accepted

- `npm audit` reports 5 high-severity advisories in `braces` via
  `@next/eslint-plugin-next` → `fast-glob`. Dev-only (linting), not shipped to
  users. npm's suggested fix downgrades eslint-config-next to 14, which is
  incompatible with Next 16, so we wait for an upstream patch.
- npm 10.9 crashes resolving Vitest's optional peer dependencies
  ("Cannot read properties of null (reading 'edgesOut')"). npm 11 works, so
  `package.json` declares `engines.npm >= 11`.
