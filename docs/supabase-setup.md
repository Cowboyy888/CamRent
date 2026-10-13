# Supabase setup guide

CamRent uses Supabase for PostgreSQL, Auth and Storage. Nothing in this
repository contains credentials: you create the project and supply the keys.

> Status: the migrations in `supabase/migrations/` are written and have been
> applied and tested against a **local** Supabase stack only. They have **not**
> been applied to any hosted project; follow section 2 to do that.

## 1. Run it locally first (recommended)

Requires Docker (Docker Desktop, Colima, or similar).

```bash
npm install
npx supabase start          # first run downloads the images
npx supabase status         # prints the local URL and keys
```

The local stack uses ports 55321-55329 (not Supabase's defaults) so it can run
beside another Supabase project. `supabase start` applies every migration and
then loads `supabase/seeds/development.sql` (fictional data, six staff
accounts, password `Dev-password-12345`). Put the values from `status` in
`.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Publishable key from `supabase status`>
```

Then `npm run dev`, open http://localhost:3000/en/login and sign in as
`dev-admin@camrent.test`. Outgoing emails (password reset, invitations) land in
the local mailbox at http://127.0.0.1:55324.

Useful commands:

| Command | What it does |
|---|---|
| `npx supabase db reset` | Drop the local database, re-apply all migrations, re-seed |
| `npx supabase stop` | Stop the local stack |
| `npm run db:types` | Regenerate `src/types/database.ts` from the local database |
| `npm run test:rls` | Run the database security tests (needs the stack running) |

## 2. Create a hosted project

1. Go to https://supabase.com/dashboard and choose **New project**. Pick the
   region closest to your staff and visitors (Singapore for Cambodia), set a
   strong database password and save it in your password manager.
2. **Project Settings -> API**: copy the **Project URL** and the **anon** (or
   **publishable**) key.
3. **Authentication -> Sign In / Providers**:
   - turn **off** "Allow new users to sign up" (staff are invited, never
     self-registered);
   - keep Email enabled; set minimum password length to 12.
4. **Authentication -> URL Configuration**: set **Site URL** to your public
   site URL, and add `http://localhost:3000` to **Redirect URLs** for local use.
5. **Authentication -> Email Templates**: edit **Invite user** and **Reset
   password** so the link is
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite`
   (and `&type=recovery` for reset). The same HTML is in `supabase/templates/`.
   Without this the emailed links will not log people in.
6. **Authentication -> Rate limits / Attack protection**: leave Supabase's
   default rate limits on; enable CAPTCHA for production if sign-in abuse
   appears.
7. For production, configure custom SMTP (Authentication -> SMTP); the built-in
   mailer is heavily rate limited.

## 3. Apply the migrations to the hosted project

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>   # from the dashboard URL
npx supabase db push                                  # applies supabase/migrations
```

`db push` never runs the development seed. Verify in the dashboard
(**Database -> Tables**) that every table shows RLS **enabled**.

## 4. Create the first super admin

Staff cannot register themselves, so the first account is created by you:

1. **Authentication -> Users -> Add user -> Create new user**, with email and
   password, "Auto Confirm User" ticked.
2. In **SQL Editor**, give that user a staff profile (replace the email):

```sql
insert into public.profiles (id, full_name, role)
select id, 'Your Name', 'super_admin'
from auth.users
where email = 'you@example.com';
```

Without a row in `public.profiles` a user can sign in but gets no access.
After this, further staff are invited through `inviteStaffMember()` (see
`src/server/auth/staff-invitations.ts`; its screen arrives with the settings
module) or by repeating the two steps above.

## 5. Environment variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Where it is used | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser and server clients | No |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser and server clients (anon or publishable key) | No: protected by RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Only `src/server/db/admin-client.ts` (inviting staff) | **Yes. Server only. Bypasses RLS** |

Rules:

- Never give the service-role key a `NEXT_PUBLIC_` prefix; the file importing it
  also uses `server-only`, so the build fails if a client component imports it.
- In Vercel, add the variables under Project Settings -> Environment Variables
  (mark the service-role key as Sensitive) or use `vercel env add`.
- If the URL or anon key is missing, the app still builds and public pages work;
  sign-in shows "Sign-in is not available because the service is not
  configured yet" and `/{locale}/dashboard` redirects to the login page.

## 6. Storage

Migration 0005 creates two **private** buckets:

| Bucket | Contents | Who can read |
|---|---|---|
| `property-media` | Listing photos/videos, path `<property_id>/<file>` | Anyone, only while the property is published and available; staff who can read the property |
| `private-docs` | Landlord ID, title deeds, authorisations | Super admin and manager only |

Because the buckets are private, the website must use signed URLs
(`createSignedUrl`) rather than public URLs. That arrives with the property
pages.

## 7. Troubleshooting

| Symptom | Likely cause |
|---|---|
| "Email logins are disabled" | `[auth.email] enable_signup` was set to false; it must stay true. Public sign-up is blocked by `[auth] enable_signup = false` |
| Signed in, but "does not have access" | The user has no active row in `public.profiles` |
| Emailed link says expired immediately | Email template still uses `{{ .ConfirmationURL }}` (step 2.5) |
| `supabase start` cannot pull images | Docker credential helper missing; run `docker logout` or pull anonymously |
