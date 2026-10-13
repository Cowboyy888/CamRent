# CamRent: website + CRM

Public property rental website and private CRM for **CamRent**, a property rental
agency in Phnom Penh, Cambodia. It covers residential and commercial rentals, in
English, Khmer and Simplified Chinese.

> **Status: Step 5, rental deals, commissions and finance** (on top of Step 4 CRM, Step 3 public website and Step 2 database and authentication). Supabase schema migrations,
> Row Level Security, staff sign-in and role checks are implemented and were
> tested against a **local** Supabase stack. **No hosted Supabase project is
> connected and no migration has been applied to one**; see
> [`docs/supabase-setup.md`](docs/supabase-setup.md). The public site reads published listings from Supabase and shows honest empty
> states until some exist. Requirements are in
> [`docs/CAMBODIA_PROPERTY_RENTAL_AGENCY_BLUEPRINT.md`](docs/CAMBODIA_PROPERTY_RENTAL_AGENCY_BLUEPRINT.md);
> technical decisions are in [`docs/decisions/`](docs/decisions/).

## Requirements

- **Node.js 20.9 or newer** (22 LTS recommended; see `.nvmrc`)
- **npm 11 or newer.** npm 10.9 has a dependency-resolver bug with this
  project's test runner. Check with `npm -v`; upgrade with `npm install -g npm@11`
  (Node 24 already ships npm 11).

## Getting started

```bash
npm install
cp .env.example .env.local   # optional: all variables have safe defaults
npm run dev
```

Open http://localhost:3000. You are redirected to `/en`, `/km` or `/zh` based
on your browser language.

### Database and staff sign-in (local)

```bash
npx supabase start      # Docker required; applies migrations + dev seed
npx supabase status     # copy the API URL and publishable key into .env.local
npm run dev
```

Open http://localhost:3000/en/login and sign in as `dev-admin@camrent.test`
(password `Dev-password-12345`, local development seed only). Full setup,
including creating a hosted project and the first super admin, is in
[`docs/supabase-setup.md`](docs/supabase-setup.md). Without Supabase variables
the public site works and `/{locale}/dashboard` redirects to the login page, which says
sign-in is not configured.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server on http://localhost:3000 |
| `npm run build` | Production build (also type-checks) |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint (Next.js core-web-vitals + TypeScript rules) |
| `npm run typecheck` | Generate route types, then `tsc --noEmit` |
| `npm test` | Unit and component tests (Vitest) |
| `npm run test:watch` | Tests in watch mode |
| `npm run check` | Lint + type check + tests, all in one |
| `npm run test:rls` | Database security tests against the local Supabase stack |
| `npm run db:types` | Regenerate `src/types/database.ts` from the local database |

Before committing, run `npm run check && npm run build`.

## Environment variables

See [`.env.example`](.env.example). Only names are committed; real values go in
`.env.local`, which Git ignores.

| Variable | Used for | Default |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Canonical and hreflang URLs, robots.txt | `http://localhost:3000` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | none (sign-in disabled) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon / publishable key (browser-safe) | none |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only.** Bypasses RLS; used to invite staff and to store public form submissions | none (forms report "not available") |

Variables are validated by `src/config/env.ts` and `src/config/supabase-env.ts`,
which fail with a clear message if a value is invalid.

## Routes

| Path | Page |
|---|---|
| `/` | Redirects to the visitor's language |
| `/{en,km,zh}` | Homepage: hero, property search, listings placeholder, verification steps, landlord CTA |
| `/{locale}/properties` | Search and listings: filters in the URL, sorting, 12 per page, loading / empty / error states |
| `/{locale}/properties/[id]` | Property details: gallery, key facts, amenities, enquiry form, similar properties |
| `/{locale}/list-your-property` | Landlord submission form (stored privately for staff review) |
| `/{locale}/contact` | Contact page with enquiry form; details appear once set in `siteConfig` |
| `/{locale}/about` | "Coming soon" placeholder (`noindex`) |
| `/{locale}/anything-else` | Localised 404 |
| `/{locale}/search`, `/rent/residential`, `/rent/commercial`, `/landlords` | Permanent redirects (Step 1 URLs) to the routes above |
| `/{locale}/login` | Staff sign-in (no public registration) |
| `/{locale}/forgot-password` | Request a password-reset email |
| `/{locale}/reset-password` | Choose a password (from an invitation or reset email) |
| `/auth/confirm` | Verifies the one-time email link, then starts a session |
| `/{locale}/dashboard` | CRM dashboard: live summary cards, recent inquiries, viewings, overdue follow-ups, agent performance, activity |
| `/{locale}/dashboard/leads` | Lead list: search, filters, sort, pagination |
| `/{locale}/dashboard/leads/[id]` | Lead detail: edit details and requirements, change status, assign, notes, viewings, history |
| `/{locale}/dashboard/deals`, `/deals/new`, `/deals/[id]` | Rental deals: terms, commission arrangement, status, receivables, payouts, documents, history |
| `/{locale}/dashboard/commissions`, `/commissions/[id]` | Commission receivables and their append-only ledger (payments, reversals, adjustments, write-offs) |
| `/{locale}/dashboard/payouts` | Agent payouts: request, approve, record as paid |
| `/{locale}/dashboard/expenses` | Expenses with receipts and approval |
| `/{locale}/dashboard/finance` | Financial report by date range, definitions, CSV export, agency finance rules, audit log |
| `/admin` | Permanent redirect to the dashboard (Step 1-3 URL) |

## Project structure

```text
docs/                          Blueprint and decision records
src/
  app/
    [locale]/                  Public website (root layout per language)
      layout.tsx               <html lang>, header, footer, metadata
      page.tsx                 Homepage
      search/page.tsx          Search (URL filters, Suspense)
      not-found.tsx            Localised 404
      [...rest]/page.tsx       Unknown paths -> localised 404
      login/ forgot-password/ reset-password/   Staff authentication
      rent/ landlords/ about/ contact/   Placeholder sections
    auth/confirm/              Email-link verification (Route Handler)
    [locale]/(crm)/dashboard/  Private CRM: dashboard and leads (own chrome, noindex)
      (protected)/             Routes that require staff access
    globals.css                Design tokens (Tailwind v4 @theme)
    robots.ts, icon.svg
  components/
    ui/                        Button, Badge, Field/Input/Select, Container, Icon
    layout/                    Header, footer, nav, language switcher, logo
    home/                      Homepage sections
    property/                  Search panel, property card, empty state
    crm/                       CRM shell, nav, lead forms and tables, panels
    auth/                      Sign-in, forgot and reset forms
  config/                      site.ts (brand, contact), env.ts (validated env)
  fonts/                       Self-hosted fonts + OFL licences
  i18n/                        Locale config, negotiation, paths, dictionaries
  lib/                         Formatting, validation, staff roles
    supabase/                  Browser, server and proxy Supabase clients
  server/
    auth/                      Access checks, sign-in/out actions, invitations
    db/                        Service-role client (server only)
  types/                       Domain types; generated database.ts
  proxy.ts                     Locale redirects + session refresh + admin guard
supabase/
  config.toml                  Local stack and Auth settings (sign-up disabled)
  migrations/                  Versioned SQL (schema, RLS, views, storage)
  seeds/development.sql        Fictional local-only data
  templates/                   Invitation and password-reset emails
tests/
  unit/                        i18n, formatting, validation, config, auth logic
  components/                  Server-rendered component checks
  rls/                         Database security tests (need local Supabase)
```

More: [database design](docs/database.md) ·
[roles and permissions](docs/roles-and-permissions.md) ·
[RLS and auth testing](docs/rls-testing.md) ·
[finance rules and definitions](docs/finance.md).

## Working with languages

- **Add or change text:** edit `src/i18n/dictionaries/en.ts`, then add the same
  key to `km.ts` and `zh.ts`. TypeScript and the tests fail if a key, a
  `{placeholder}` or a value is missing.
- **Read text in a Server Component:** `const dict = await getDictionary()` and
  `const locale = await getLocale()` from `@/i18n/server`. No prop drilling is
  needed for the locale.
- **Facts are not translated:** prices, sizes, dates and references are formatted
  by `src/lib/format.ts`, so they read the same in every language
  (e.g. `USD 1,200`).
- **Khmer typography:** `globals.css` raises line height and removes
  letter-spacing for Khmer, so stacked vowels and consonant clusters render
  correctly.

The Khmer and Chinese text is a draft and needs review by native speakers
before launch.

## Branding

Change the agency name, wordmark split, legal name and contact details in
[`src/config/site.ts`](src/config/site.ts). The logo mark is a placeholder in
`src/components/layout/brand-logo.tsx` (and `src/app/icon.svg`). Contact fields
stay `null`, and are hidden, until real details are confirmed.

## Not built yet (by design)

Property management screens, CRM workflows, commission tracking, the staff
management UI, analytics and payments are later phases. The tables for most of
them already exist (Step 2) but no screen uses them yet. See blueprint section 15
and the backlog in section 18.

## Known issues

- `npm audit` reports high-severity advisories in a dev-only lint dependency
  (`braces`, via `@next/eslint-plugin-next`). They do not affect the built
  site, and npm's suggested fix would break the Next.js 16 ESLint config.
  Details are in `docs/decisions/0001-project-foundation.md`.
