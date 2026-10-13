-- 0002: staff profiles, landlords and the property catalogue.
--
-- Conventions
--   * UUID primary keys; foreign keys are ON DELETE RESTRICT so business and
--     financial history can never disappear through a cascade. The only
--     cascades are property -> translations / media (content that has no
--     meaning without its property).
--   * Money is stored as integer minor units (USD cents, KHR riel) in
--     NUMERIC(18,0) columns named *_minor, with a currency code next to it.
--   * Properties, landlords and staff are never hard-deleted: properties
--     use archived_at, staff use is_active.

-- profiles ------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  full_name text not null check (length(btrim(full_name)) > 0),
  phone text,
  role public.staff_role not null,
  preferred_language public.locale_code not null default 'en',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- landlords -----------------------------------------------------------------
create table public.landlords (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(btrim(full_name)) > 0),
  business_name text,
  phone text,
  email text,
  preferred_language public.locale_code not null default 'en',
  verification_status public.verification_status not null default 'unverified',
  internal_notes text,
  created_by uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint landlords_has_contact check (phone is not null or email is not null)
);

create index landlords_created_by_idx on public.landlords (created_by);

create trigger landlords_set_updated_at
  before update on public.landlords
  for each row execute function private.set_updated_at();

-- properties ----------------------------------------------------------------
create table public.properties (
  id uuid primary key default gen_random_uuid(),
  listing_code text not null,
  category public.property_category not null,
  property_type public.property_type not null,
  city text not null default 'Phnom Penh',
  district text,
  neighborhood text,
  address text,
  latitude numeric(9, 6) check (latitude between -90 and 90),
  longitude numeric(9, 6) check (longitude between -180 and 180),
  monthly_rent_minor numeric(18, 0) not null check (monthly_rent_minor >= 0),
  currency public.currency_code not null default 'USD',
  bedrooms smallint check (bedrooms >= 0),
  bathrooms smallint check (bathrooms >= 0),
  floor_area numeric(10, 2) check (floor_area > 0),
  area_unit public.area_unit not null default 'sqm',
  furnishing_status public.furnishing_status,
  deposit_amount_minor numeric(18, 0) check (deposit_amount_minor >= 0),
  lease_terms text,
  availability_status public.availability_status not null default 'available',
  -- Only meaningful for 'available_from'; the date the unit becomes free.
  available_from date,
  publication_status public.publication_status not null default 'draft',
  assigned_agent_id uuid references public.profiles (id) on delete restrict,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,

  constraint properties_listing_code_key unique (listing_code),
  constraint properties_listing_code_not_blank check (length(btrim(listing_code)) > 0),
  constraint properties_type_matches_category check (
    (category = 'residential' and property_type in
      ('apartment', 'condo', 'serviced_apartment', 'villa', 'house', 'flat'))
    or
    (category = 'commercial' and property_type in
      ('office', 'retail_shop', 'shophouse', 'warehouse', 'commercial_space'))
  ),
  constraint properties_coordinates_together check (
    (latitude is null) = (longitude is null)
  ),
  constraint properties_available_from_needs_date check (
    availability_status <> 'available_from' or available_from is not null
  ),
  -- Soft archiving: archived_at and the 'archived' status always agree.
  constraint properties_archive_consistent check (
    (archived_at is not null) = (publication_status = 'archived')
  )
);

create index properties_publication_idx
  on public.properties (publication_status, availability_status)
  where archived_at is null;
create index properties_assigned_agent_idx on public.properties (assigned_agent_id);
create index properties_created_by_idx on public.properties (created_by);
create index properties_area_idx on public.properties (city, district, neighborhood);

create trigger properties_set_updated_at
  before update on public.properties
  for each row execute function private.set_updated_at();

-- property_translations -----------------------------------------------------
create table public.property_translations (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  locale public.locale_code not null,
  title text not null check (length(btrim(title)) > 0),
  description text,
  amenities text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint property_translations_one_per_locale unique (property_id, locale)
);

create trigger property_translations_set_updated_at
  before update on public.property_translations
  for each row execute function private.set_updated_at();

-- property_media ------------------------------------------------------------
-- Files live in the private "property-media" storage bucket; storage_path is
-- "<property_id>/<file name>". Public access goes through RLS on both this
-- table's public view and storage.objects (see migration 0005).
create table public.property_media (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  storage_path text not null check (length(btrim(storage_path)) > 0),
  media_type public.media_type not null default 'image',
  caption text,
  display_order integer not null default 0 check (display_order >= 0),
  is_cover boolean not null default false,
  created_at timestamptz not null default now(),
  constraint property_media_storage_path_key unique (storage_path)
);

create index property_media_property_idx
  on public.property_media (property_id, display_order);
-- At most one cover image per property.
create unique index property_media_one_cover_idx
  on public.property_media (property_id) where is_cover;

-- property_ownership --------------------------------------------------------
-- Which landlord authorised us to market which property, and for how long.
create table public.property_ownership (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete restrict,
  landlord_id uuid not null references public.landlords (id) on delete restrict,
  authorization_status public.authorization_status not null default 'pending',
  authorization_start date,
  authorization_end date,
  created_at timestamptz not null default now(),
  constraint property_ownership_dates check (
    authorization_end is null
    or authorization_start is null
    or authorization_end >= authorization_start
  )
);

create index property_ownership_property_idx on public.property_ownership (property_id);
create index property_ownership_landlord_idx on public.property_ownership (landlord_id);
