<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## CamRent project rules

- Requirements: `docs/CAMBODIA_PROPERTY_RENTAL_AGENCY_BLUEPRINT.md`. Decisions: `docs/decisions/`.
- Every user-facing string goes in `src/i18n/dictionaries/` (en, km, zh) with identical keys.
- Facts (prices, sizes, dates, references) come from structured data and are formatted with `src/lib/format.ts`, never translated as free text.
- Money is integer minor units + currency code. Never mix rent with agency revenue.
- Never render invented listings or figures on the website or CRM. Use honest empty states.
- Every protected admin page and data function calls `requireAdminAccess()`; layouts and `proxy.ts` are not the only guard.
- Before finishing a change, run `npm run check` and `npm run build`.
