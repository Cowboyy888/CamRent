# 0003: Public website, search and property details (Step 3)

- Status: accepted
- Date: 2026-10-11
- Scope: blueprint Phase 3 (public site), tasks T-020 to T-026 (search, detail, landlord submission)

## Decisions

### Reads: anonymous client, public views only
`createSupabasePublicClient()` has no cookies and no session, so listing pages
never depend on who is signed in. It reaches only `public_properties`,
`public_property_translations`, `public_property_media` and the files of
published listings. The queries take the client as an argument, so the same
code is tested against the real Data API (`tests/rls/public-queries.test.ts`).

### Search is server-side, one page at a time
Filters are URL parameters validated by zod (invalid values are dropped, not
fatal). A head-only count query is followed by one `range()` query for the
requested page (12 rows), so the browser never receives the catalogue. Pages
past the end are clamped. Free text from the URL is reduced to letters, digits
and a few marks before it reaches a PostgREST `or()` filter.

Rent filters are US dollars and therefore match USD-priced listings only.
Price sorting orders by currency first (USD before KHR, enum order) so amounts
of different currencies are never compared with each other.

### Translations never invent text
Title, description and amenities come from `property_translations` for the
visitor's language, then English, then any other. If a fallback is used the
page says so; if there is no translation the card shows the listing reference.
Fields that are null (size, deposit, lease terms, bathrooms...) are not shown.
The "verified on" badge was removed: the database has no verification date.

### Photos: private bucket + signed URLs
Covers and galleries are signed server-side for one hour using the anonymous
client (the storage policy allows it only for published listings). Images are
rendered with `unoptimized` because per-request signed URLs cannot be cached
by the image optimiser.

### Public forms write through the server
Visitors have no table privileges, so enquiries (-> `leads`, unassigned,
`source = website_form`) and landlord submissions (-> `landlord_submissions`)
are validated with zod in Server Actions and inserted with the service-role
key. Protections: honeypot field, consent checkbox, an hourly limit per phone
or email (5), existence check that an enquired property is public, no data
returned. A CAPTCHA (e.g. Turnstile) is a recommended later addition.

### Landlord submissions are not properties
Submissions land in their own table for a manager to review; they never create
a `properties` row or anything public.

### "Featured" is "newest"
The schema has no featured flag, so the homepage section is titled "Newest
rentals" and shows the six most recently created published listings.

### Popular locations are reference data
Eight district names with translated labels link to a search for the district
term. They show no counts or prices, so they cannot misstate inventory. The
Khmer names and the English search terms need confirmation by the agency.

### Old URLs
`/search`, `/rent/residential`, `/rent/commercial` and `/landlords` redirect
permanently (query string preserved) to the new routes.

## Known limits
- A listing that is unpublished returns the "not available" page with HTTP 200
  (streamed after the shell), not a 404 status.
- No map, saved searches or share links yet.
- Contact details stay hidden until set in `src/config/site.ts`.
