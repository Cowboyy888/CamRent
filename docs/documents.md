# Document center

`/{locale}/dashboard/documents` generates numbered PDFs from CRM records.

| Type | Roles | Languages |
|---|---|---|
| Property listing sheet | super admin, manager, agent, marketing | en, km, zh |
| Customer inquiry summary | super admin, manager, agent | en, km, zh |
| Viewing confirmation sheet | super admin, manager, agent | en, km, zh |
| Rental deal summary | super admin, manager, agent, finance | en, km, zh |
| Agent payout statement | super admin, manager, agent, finance | en, km, zh |
| Commission statement | super admin, manager, finance | en, km, zh |
| Landlord submission summary | super admin, manager | en, km, zh |
| Draft agreement template | super admin, manager | **English only** |

Every document shows the agency name, a reference (for example `IN-2026-000001`, allocated
by a database counter), the issue date in Phnom Penh time, the staff member who
prepared it and the document language. Record details are read with the
caller's own session, so RLS decides what can be printed. Names, references and
notes are printed exactly as recorded and are never machine-translated.

## What documents are not

- Summaries and statements say they are **not** agreements, receipts, or
  payment confirmations. There are no signatures, stamps, approvals or legal
  terms.
- The **draft agreement template** is a skeleton in English with placeholders,
  headed "DRAFT TEMPLATE FOR REVIEW BY QUALIFIED LOCAL COUNSEL - NOT FOR USE AS
  IT IS". No legal wording is invented; Khmer and Chinese legal versions must be
  prepared by counsel, not by machine translation.

## Storage and access

PDFs are stored in the private `private-docs` bucket under
`generated/<id>/CamRent_<reference>_<locale>.pdf`. The download route
(`/{locale}/dashboard/documents/[id]/download`) re-checks the session and role,
streams the file with `Cache-Control: no-store`, and 404s otherwise. Rows in
`generated_documents` cannot be deleted. There is no public URL.

## Fonts

pdfkit + fontkit embed Noto Sans (Latin), Kantumruy Pro (Khmer, same family as
the site) and Noto Sans SC (Chinese), all SIL OFL, as WOFF files in
`src/fonts/pdf`. Text is split into per-script runs so mixed text (a Khmer name
inside a Chinese document) uses the right font. The Chinese font is a subset of
common characters; a rare character would print as a missing glyph.
