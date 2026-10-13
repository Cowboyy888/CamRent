# Production launch checklist

Work through this top to bottom for **staging first**, then repeat for
production. Tick nothing you have not seen with your own eyes. Never run
`supabase db reset`, tests that insert data, or any seed against production.

Status legend used in the final report: ✅ verified locally · 🔶 needs a manual
check on the real environment · ⛔ not possible without credentials.

## 0. Environments

- [ ] Three separate Supabase projects: `camrent-dev` (local CLI stack is fine),
      `camrent-staging`, `camrent-prod`. No shared keys, no shared buckets.
- [ ] Three separate hosting environments (Vercel: Development / Preview /
      Production) with their own environment variables.
- [ ] Production data is never copied to staging unless anonymised.

## 1. Required environment variables (hosting provider, per environment)

| Variable | Scope | Notes |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | build + runtime | `https://<your-domain>` (no trailing slash). **Inlined at build**: set it before building. |
| `NEXT_PUBLIC_SUPABASE_URL` | build + runtime | Project URL of *that* environment's project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | build + runtime | anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | runtime, **Sensitive** | Server only. Used for public form inserts, staff invitations, the cron route |
| `CRON_SECRET` | runtime, Sensitive | 16+ random chars. Only if you use the HTTP scheduler |
| `RATE_LIMIT_SALT` | runtime, Sensitive | Long random string |

- [ ] None of the secrets has a `NEXT_PUBLIC_` prefix.
- [ ] `.env.local` is not committed (`git ls-files | grep env` shows only `.env.example`).
- [ ] After a production build: `grep -r "<service role key>" .next/static` finds nothing.

## 2. Database

- [ ] Take a backup (see `docs/backup-and-recovery.md`) **before** applying migrations.
- [ ] Link: `npx supabase link --project-ref <ref>`.
- [ ] Review the plan: `npx supabase db push --dry-run`.
- [ ] Apply: `npx supabase db push` (staging first, run the smoke tests, then production).
- [ ] Never run `db reset`, seeds (`supabase/seeds/development.sql`) or the
      RLS test suite against staging/production. The seed refuses to run when
      auth users exist; keep it that way.
- [ ] Confirm migrations in the dashboard list match the repository
      (`supabase migration list`).
- [ ] `pg_cron` extension enabled (Database -> Extensions) so the automation
      job exists; otherwise configure the HTTP scheduler (section 8).

## 3. Supabase project settings (dashboard; not controlled by the repo)

- [ ] Auth -> URL configuration: **Site URL** = production URL;
      **Redirect URLs** = `https://<domain>/auth/confirm` (and the staging URL
      on the staging project only). Remove localhost entries from production.
- [ ] Auth -> Providers -> Email: sign-ups **disabled**; password minimum
      length 12; email confirmation as required by your policy.
- [ ] Auth -> SMTP: custom SMTP configured (the built-in sender is rate
      limited and unsuitable for production). Send a real password-reset email.
- [ ] Auth -> Rate limits reviewed; CAPTCHA considered for sign-in.
- [ ] Storage: buckets `property-media` and `private-docs` exist and are
      **private** (created by migration 0005).
- [ ] API settings: exposed schemas are `public` (+ `graphql_public`) only.
- [ ] Database -> Backups: plan and retention noted (see backup doc).
- [ ] Network/SSL: enforce SSL for direct database connections.

## 4. Admin accounts and roles

- [ ] Create the first super admin exactly as `docs/supabase-setup.md` section 4
      describes (Auth -> Add user, then the `insert into public.profiles` SQL).
      A user without a profile row can sign in but sees nothing.
- [ ] Create the remaining staff the same way. There is **no staff
      management screen yet**; `inviteStaffMember()` exists but is not wired
      to a page.
- [ ] Sign in at `/en/login` with the new super admin.
- [ ] Verify roles with real accounts (one per role):
      - agent sees only own leads/deals; no Expenses, Finance, Automation
      - marketing sees listings only; 404 on deals/finance
      - finance cannot approve payouts; manager cannot mark paid
      - manager/admin can open Automation and Documents
- [ ] Remove or disable any default/test accounts. **No `dev-*@camrent.test` user may exist in production.**

## 5. Domain and HTTPS

- [ ] Domain attached to the hosting project; DNS records correct.
- [ ] HTTPS certificate issued, `http://` redirects to `https://`.
- [ ] `https://<domain>/robots.txt` and `/sitemap.xml` show the production host.
- [ ] Response headers on `/en`: `X-Frame-Options`, `X-Content-Type-Options`,
      `Strict-Transport-Security`, `Referrer-Policy`, `Permissions-Policy`.

## 6. Email

- [ ] Password-reset email arrives, link opens `/auth/confirm` on the
      production domain and ends signed in on the reset page.
- [ ] Staff invitation email arrives.
- [ ] SPF/DKIM/DMARC records for the sending domain.
- [ ] (Not built) Customer-facing or notification emails: out of scope.

## 7. Storage and documents

- [ ] Generate each document type as a manager; download works; the URL is
      not usable by an anonymous browser.
- [ ] A property photo of a **published** listing shows on the public site; a
      draft listing's photo URL is not reachable anonymously.
- [ ] Upload a receipt (PDF) on an expense; a `.html` file is refused.
- [ ] Open a Khmer and a Chinese PDF and check the text is not garbled.

## 8. Scheduled jobs

- [ ] pg_cron job exists: `select jobname, schedule, active from cron.job;`
      shows the automation job every 10 minutes.
- [ ] After 15 minutes: Automation page shows a **Schedule** run with status
      Succeeded or Skipped, and "Last scheduled run" is recent.
- [ ] If using HTTP instead: add `CRON_SECRET`, schedule
      `GET /api/cron/automation` with `Authorization: Bearer <secret>` (Vercel
      Cron requires a plan that allows 10-minute schedules; Hobby allows daily).
- [ ] A second run creates no duplicate tasks (compare task counts).

## 9. Security checks (read-only in production)

- [ ] `npm audit --omit=dev` shows no vulnerabilities (dev-only advisories are
      documented in `docs/security-audit.md`).
- [ ] Anonymous `curl https://<project>.supabase.co/rest/v1/leads` with the
      anon key returns `[]` or a permission error, never rows.
- [ ] `/en/dashboard` redirects to sign-in when signed out.
- [ ] Public listing page source contains no phone, email or internal notes.
- [ ] Do not run destructive tests against production data.

## 10. Performance and SEO

- [ ] Lighthouse (mobile) on `/en`, `/en/properties`, a listing: record scores.
- [ ] Listing images load lazily; no layout shift on the gallery.
- [ ] Submit the sitemap in Google Search Console and Bing Webmaster Tools.
- [ ] `hreflang` alternates present on listing pages (view source).

## 11. Monitoring and logs

- [ ] Hosting logs are accessible to the operations owner.
- [ ] Uptime monitor on `https://<domain>/api/health` (expects `{"status":"ok"}`).
- [ ] Error monitoring (e.g. Sentry) decided and, if used, configured without
      sending form contents or personal data. **Not installed in this repo.**
- [ ] Supabase alerts for database CPU / disk / auth errors.

## 12. Post-deployment smoke tests (production, using a test lead you delete afterwards via an admin-approved procedure, or staging)

1. `GET /api/health` returns ok.
2. Visit `/en`, `/km`, `/zh`; search properties; open a listing.
3. Submit an inquiry (use a clearly labelled test name) → appears in CRM as a
   new unassigned lead.
4. Sign in as manager → assign the lead to an agent.
5. Sign in as agent → sees the lead; cannot see another agent's leads.
6. Finance user: open Commissions; confirm an agent cannot open `/finance`.
7. Generate and download one PDF.
8. Open Automation: rules enabled, schedule shown.

## 13. Rollback

- Application: promote the previous deployment in the hosting dashboard
  (Vercel -> Deployments -> previous -> *Promote to Production*).
- Database: migrations are forward-only. If a migration was applied that
  breaks the app: **stop**, take a fresh backup, then either ship a corrective
  migration or restore (see `docs/backup-and-recovery.md`). Do not edit applied
  migration files.
- Scheduled jobs: disable all rules on the Automation page (history is kept)
  while recovering.
- Communicate the incident and record what happened.
