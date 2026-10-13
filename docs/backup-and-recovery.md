# Backup, restore and failed-deployment recovery

> **Status: documented, not exercised.** No hosted Supabase project was
> available while this was written, so none of the restore procedures below has
> been run end to end by the project. Run a restore drill on staging before
> launch and record the date here.

## What holds data

| Data | Where | Backed up by |
|---|---|---|
| Business tables, auth users, ledger, audit log | Supabase Postgres | Supabase backups (plan dependent) + your own dumps |
| Property photos, receipts, agreements, generated PDFs | Supabase Storage (`property-media`, `private-docs`) | **Not** included in database backups; needs its own copy |
| Application code | Git (GitHub) | Git history |
| Secrets | Hosting provider + password manager | Password manager |

## Verify the plan before relying on backups

Supabase's backup features depend on the plan (at the time of writing: daily
backups with limited retention on paid plans, Point-in-Time Recovery as a paid
add-on, and no automated backups on the free tier). **Check the Database ->
Backups page of the real project and write the actual retention below:**

- Plan: ______  Daily backups: yes/no  Retention: ___ days  PITR: yes/no

If the plan has no backups, take manual dumps (below) on a schedule.

## Manual logical backup (any plan)

Use the direct connection string (Project Settings -> Database). Never commit
it. Store dumps encrypted, outside the repo.

```bash
# schema + data of the application schemas
pg_dump "$SUPABASE_DB_URL" --format=custom --no-owner \
  --schema=public --schema=auth --schema=storage \
  --file="camrent-$(date +%F).dump"
```

Or with the Supabase CLI: `npx supabase db dump --linked -f schema.sql`
(schema) and `npx supabase db dump --linked --data-only -f data.sql`.

Storage objects are not in the dump. Copy the buckets (for example with the
Supabase Storage API or `rclone` using S3-compatible credentials from the
dashboard) at the same time as the dump.

## Before any risky migration

1. Take a fresh dump and a storage copy; confirm the files open
   (`pg_restore --list camrent-....dump`).
2. Apply the migration to **staging**, restored from a recent production dump
   (anonymise personal data if staging is shared).
3. Run `npm run test:rls` against a local database and the smoke tests against
   staging.
4. Apply to production in a quiet period.

## Restore

- **Platform backup / PITR:** Database -> Backups -> restore. This replaces the
  project's database, so announce downtime and take a dump of the current state
  first if it is still readable.
- **From a dump into a new project (preferred for drills):** create a new
  project, `supabase db push` the migrations, then
  `pg_restore --data-only --disable-triggers` the dump of `public` (and
  `auth`), re-upload storage objects, update the environment variables to the
  new project, and run the smoke tests. Ledger and audit tables are
  append-only by trigger; restore with triggers disabled as the owner, then
  re-enable and verify totals with the finance report.

## Recovering from a failed deployment

1. **Application only broke:** promote the previous deployment (instant, no
   data change).
2. **A migration failed halfway:** Supabase runs each migration file in a
   transaction; check `supabase migration list`. Fix forward with a new
   migration. Do not edit applied files.
3. **A migration succeeded but is wrong:** write a corrective migration; if
   data was damaged, restore from the pre-migration backup into a *new* project
   and compare before cutting over.
4. **Scheduler misbehaving:** disable rules on the Automation page (history is
   kept) or `select cron.unschedule(jobid) from cron.job;` as the owner.

## Never

- Never run `supabase db reset`, the development seed or the RLS tests against
  a hosted database.
- Never "fix" a financial record by editing or deleting ledger rows. Reverse
  with a new entry; the database blocks edits on purpose.
