-- 0001: enumerated types and shared helpers.
--
-- Allowed values are Postgres enums so they are enforced by the database and
-- appear as string unions in the generated TypeScript types. Values for
-- property domains mirror src/types/property.ts; keep them in sync.

-- Helper functions that policies call live in a schema the Data API does not
-- expose. Only the roles that evaluate policies may use it.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- Safe by default: tables created later are not readable by anon or
-- authenticated until a migration grants access explicitly.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

create type public.staff_role as enum
  ('super_admin', 'manager', 'agent', 'marketing', 'finance');

create type public.locale_code as enum ('en', 'km', 'zh');
create type public.currency_code as enum ('USD', 'KHR');

create type public.verification_status as enum
  ('unverified', 'pending', 'verified', 'rejected');

create type public.property_category as enum ('residential', 'commercial');

create type public.property_type as enum (
  'apartment', 'condo', 'serviced_apartment', 'villa', 'house', 'flat',
  'office', 'retail_shop', 'shophouse', 'warehouse', 'commercial_space'
);

create type public.furnishing_status as enum
  ('unfurnished', 'partially_furnished', 'fully_furnished');

create type public.area_unit as enum ('sqm', 'sqft');

-- Whether a unit can be rented. Separate from publication status.
create type public.availability_status as enum
  ('available', 'available_from', 'reserved', 'rented', 'off_market');

-- Whether a listing is visible on the public website.
create type public.publication_status as enum (
  'draft', 'submitted', 'in_review', 'changes_requested',
  'published', 'unpublished', 'archived'
);

create type public.media_type as enum ('image', 'video', 'floor_plan');

create type public.authorization_status as enum
  ('pending', 'active', 'expired', 'revoked');

create type public.lead_source as enum (
  'website_form', 'phone', 'walk_in', 'referral', 'social_media',
  'partner_agent', 'other'
);

-- Lead pipeline (blueprint 8.6, L1-L5, D1, D3, X).
create type public.lead_stage as enum (
  'new', 'contacted', 'qualified', 'viewing_scheduled', 'viewed',
  'negotiation', 'won', 'lost'
);

create type public.activity_type as enum (
  'note', 'call', 'message', 'email', 'meeting',
  'stage_change', 'assignment', 'viewing'
);

create type public.viewing_status as enum
  ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show');

create type public.viewing_outcome as enum
  ('interested', 'not_interested', 'needs_follow_up', 'wants_another_viewing');

create type public.task_priority as enum ('low', 'normal', 'high', 'urgent');
create type public.task_status as enum ('todo', 'in_progress', 'done', 'cancelled');

-- Deal pipeline (blueprint 8.6, D1-D5, X).
create type public.deal_stage as enum (
  'negotiation', 'reserved', 'lease_signed',
  'commission_invoiced', 'commission_collected', 'lost'
);

create type public.fee_payer as enum ('landlord', 'tenant');

create type public.commission_calculation as enum
  ('percentage_of_rent', 'months_of_rent', 'fixed_amount');

create type public.commission_payment_status as enum
  ('pending', 'partial', 'paid', 'overdue', 'waived');

-- Keeps updated_at honest regardless of what the client sends.
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
