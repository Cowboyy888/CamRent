# Deployment (Vercel + Supabase)

The architecture is unchanged: Next.js on Vercel (Node runtime), Supabase for
Postgres, Auth and Storage. The repository ships no `vercel.json`: a
sub-daily cron entry would make a Hobby-plan deployment fail, and the database
already schedules its own automation job with pg_cron.

**Status at Step 7: not deployed.** The Vercel CLI on the development machine
is signed in, but no Vercel project is linked and no hosted Supabase project or
access token was available, so nothing was created or published.

## One-time setup

1. **Supabase staging and production projects**: follow
   `docs/supabase-setup.md` sections 2-4 for each (region Singapore is closest
   to Cambodia). Apply migrations with `supabase db push`.
2. **Vercel project**: import the GitHub repository
   (`Cowboyy888/CamRent`), framework preset Next.js, Node 22 or newer,
   default build command `npm run build`.
3. **Environment variables** (Project Settings -> Environment Variables), set
   separately for *Preview* (staging Supabase) and *Production* (production
   Supabase). See the table in `PRODUCTION_LAUNCH_CHECKLIST.md` section 1.
   `NEXT_PUBLIC_SITE_URL` must be set before the build because it is inlined.
4. **Domain**: add it under Domains; Vercel issues the HTTPS certificate.
5. **Supabase Auth URLs**: Site URL and redirect URL set to the production
   domain (`/auth/confirm`).

## Release flow

1. Branch -> pull request -> Vercel preview deployment against **staging**.
2. CI (or local): `npm run check` and `npm run build`; `npm run test:rls`
   against a *local* database.
3. Apply new migrations to **staging**, run the smoke tests
   (`PRODUCTION_LAUNCH_CHECKLIST.md` section 12).
4. Back up production, apply migrations to production, then promote/merge.
5. Smoke test production, watch logs for 30 minutes.

Apply migrations **before** promoting code that needs them, and keep each
release backward compatible with the previous schema so a rollback of the
application alone is safe.

## Scheduler

Default: the pg_cron job created by migration 0012 (every 10 minutes).
Alternative (when pg_cron is unavailable): schedule
`GET /api/cron/automation` with `Authorization: Bearer <CRON_SECRET>` from a
Vercel Cron job (needs a plan that allows 10-minute schedules), cron-job.org or
GitHub Actions. Do not enable both unless you want them to share the work; an
overlapping run is recorded as skipped and creates no duplicates.

## Health and smoke test

`GET /api/health` returns `{"status":"ok","database":"ok"}` or 503. Point the
uptime monitor at it.

## Manual deployment commands (once the above exists)

```bash
npx vercel link                 # choose the team and project
npx vercel env add NEXT_PUBLIC_SITE_URL production
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production   # mark Sensitive
npx vercel env add CRON_SECRET production                 # optional
npx vercel env add RATE_LIMIT_SALT production
npx vercel deploy --prod        # or merge to the production branch
```
