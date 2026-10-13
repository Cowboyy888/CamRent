# Security audit (Step 7)

Scope: the whole application as of Step 7, tested against the **local**
Supabase stack and a production build. Nothing was run against a hosted
project. Date: 2026-10-13.

## Method

- `tests/rls/audit.test.ts`: schema-wide structural checks (RLS on every
  table, anonymous privileges, function privileges, `search_path`, bucket
  privacy, view security mode, tamper resistance).
- `tests/rls/*.test.ts`: 121 database tests across roles.
- `audit.mjs` (kept outside the repo, described in the report): direct REST /
  GraphQL / storage requests as anonymous, agent, manager and finance; header,
  CSRF, robots and sitemap checks; bundle secret scan.
- `workflow.mjs`: the ten business workflows end to end in a browser.
- `npm audit`, ESLint, TypeScript, unit tests, production build.

## Findings and fixes

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | Medium | Public form rate limit was per phone/email only; rotating contact details bypassed it and could flood the CRM | **Fixed**: per-client (hashed address) throttle, `form_attempts`, migration 20261016090000 |
| 2 | Medium | `private.*` automation and notification functions were executable by signed-in roles through the PUBLIC default (not exposed by the Data API, but reachable by any direct SQL session) | **Fixed**: migration 20261016090100 revokes execute |
| 3 | Low | No security response headers | **Fixed**: nosniff, frame deny, referrer, permissions, HSTS |
| 4 | Low | `robots.txt` blocked only `/admin`; no sitemap | **Fixed**: dashboard/login/api blocked; dynamic sitemap with hreflang |
| 5 | Info | Sitemap would have been frozen at build time | **Fixed**: rendered per request |

## Verified (evidence: tests above)

- RLS enabled on every `public` table; anonymous role has `SELECT` only on the
  three public views; no `public` function is executable by anonymous.
- Agents cannot read or modify another agent's leads, deals or ledger rows, and
  cannot change their own role.
- The commission ledger and the financial audit log cannot be updated or
  deleted, including by finance and super admin.
- Private buckets; non-PDF/image uploads rejected by bucket policy; generated
  documents readable only per role.
- Cross-origin Server Action requests are rejected (framework Origin check).
- Customer-provided text is rendered as text (`<script>` in an inquiry is
  shown escaped); filter text is not interpolated into SQL (parameterised
  queries; the search term is sanitised before use in a PostgREST filter).
- No service-role key in `.next/static` or the prerendered output.
- `npm audit --omit=dev`: 0 vulnerabilities.

## Known limitations (not fixed)

1. **No Content-Security-Policy.** A strict CSP needs per-request nonces for
   Next.js inline scripts; not done. XSS is mitigated by React escaping and
   the absence of `dangerouslySetInnerHTML` on user data, but CSP would add a
   second layer. **Recommended next.**
2. **Dev-only advisories**: `npm audit` reports 5 high advisories in the ESLint
   toolchain (`braces` via `eslint-config-next`). Not in the production
   bundle; the suggested fix is a breaking downgrade.
3. **Rate limiting is application-level and uses the first
   `X-Forwarded-For` entry.** Behind Vercel this is the client address; behind
   other proxies verify the header cannot be spoofed. Login attempts rely on
   Supabase Auth's built-in limits and CAPTCHA is not enabled.
4. **No MFA** for staff accounts (Supabase supports TOTP; not wired).
5. **No staff management screen**; accounts are created in the Supabase
   dashboard. There is no UI to deactivate staff other than SQL.
6. **No error monitoring** is installed.
7. Customer notification channels (email/Telegram) are not built, so there is
   no outbound message risk, but also no customer confirmation emails.
8. Hosted-project settings (redirect URLs, SMTP, backups, SSL enforcement)
   cannot be verified from the repository; see the launch checklist.
