# 0006: Multilingual operations, documents, notifications and automation

Status: accepted (Step 6)

## Decisions

### Automation lives in the database
Rules are SQL functions run by one idempotent entry point, scheduled by pg_cron
and reachable through one authenticated HTTP route. Idempotency is enforced by
unique constraints (event key, task automation key, notification dedupe key),
not by application logic. Rules never contact customers.

### Documents are generated with the caller's own session
Data is read through RLS, the PDF is rendered in the server action and stored
privately. The reference number comes from a database counter. No service-role
client is used for documents.

### Fonts
Khmer uses Kantumruy Pro (Noto Sans/Serif Khmer crash fontkit's Khmer shaper).
WOFF files are used because the WOFF2 builds rendered garbled glyphs in PDFs.

### Language preference
The language switch in the CRM saves `profiles.preferred_language` and the
`NEXT_LOCALE` cookie and keeps the current page and query. Sign-in still opens
the language of the login page the person chose.

### Not built
Email and Telegram notifications (no integration to configure safely), images
in PDFs, and Khmer/Chinese legal templates (need qualified counsel).

## Consequences
- Money formatting stays `USD 1,200` with Latin digits in all languages (a
  project decision, see Step 3).
- Pages rendered after a streamed `notFound()` return HTTP 200 with the
  not-found UI; the database is the real guard.
