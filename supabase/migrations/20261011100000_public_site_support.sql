-- 0006: support for the public website (Step 3).
--   * public_properties gains created_at (for "newest first" sorting);
--   * leads can carry the visitor's enquiry message;
--   * landlord_submissions stores "list your property" requests.

-- A view's new columns must be appended, so created_at goes last.
create or replace view public.public_properties
with (security_invoker = false) as
select
  p.id,
  p.listing_code,
  p.category,
  p.property_type,
  p.city,
  p.district,
  p.neighborhood,
  p.monthly_rent_minor,
  p.currency,
  p.bedrooms,
  p.bathrooms,
  p.floor_area,
  p.area_unit,
  p.furnishing_status,
  p.deposit_amount_minor,
  p.lease_terms,
  p.availability_status,
  p.available_from,
  p.updated_at,
  p.created_at
from public.properties p
where p.publication_status = 'published'
  and p.archived_at is null
  and p.availability_status in ('available', 'available_from');

-- Browsing and sorting the public catalogue.
create index properties_public_sort_idx
  on public.properties (created_at desc)
  where publication_status = 'published' and archived_at is null;

alter table public.leads
  add column enquiry_message text
  check (enquiry_message is null or length(enquiry_message) <= 2000);

create type public.submitter_relationship as enum
  ('owner', 'authorized_representative', 'developer', 'other_agent', 'other');

create type public.submission_status as enum
  ('new', 'contacted', 'accepted', 'declined', 'spam');

-- Requests from the public form. Rows are created only by trusted server code
-- (service role); staff review them here and create the real landlord and
-- property records themselves. Nothing here is ever shown publicly.
create table public.landlord_submissions (
  id uuid primary key default gen_random_uuid(),
  submitter_name text not null check (length(btrim(submitter_name)) between 1 and 120),
  relationship public.submitter_relationship not null,
  phone text check (length(phone) <= 40),
  email text check (length(email) <= 254),
  preferred_language public.locale_code not null default 'en',
  property_category public.property_category not null,
  property_type public.property_type,
  district text check (length(district) <= 120),
  neighborhood text check (length(neighborhood) <= 120),
  address text check (length(address) <= 300),
  bedrooms smallint check (bedrooms >= 0 and bedrooms <= 50),
  expected_rent_minor numeric(18, 0) check (expected_rent_minor >= 0),
  currency public.currency_code not null default 'USD',
  description text check (length(description) <= 2000),
  status public.submission_status not null default 'new',
  internal_notes text,
  handled_by uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint landlord_submissions_has_contact check (phone is not null or email is not null)
);

create index landlord_submissions_status_idx
  on public.landlord_submissions (status, created_at desc);

create trigger landlord_submissions_set_updated_at
  before update on public.landlord_submissions
  for each row execute function private.set_updated_at();

alter table public.landlord_submissions enable row level security;
revoke all on public.landlord_submissions from anon, authenticated;
grant select, update on public.landlord_submissions to authenticated;

create policy landlord_submissions_select on public.landlord_submissions
  for select to authenticated
  using ((select private.has_role('super_admin', 'manager')));

create policy landlord_submissions_update on public.landlord_submissions
  for update to authenticated
  using ((select private.has_role('super_admin', 'manager')))
  with check ((select private.has_role('super_admin', 'manager')));
