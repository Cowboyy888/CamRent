-- 0005: what the public website may read, and storage buckets.
--
-- anon has no table privileges at all. These views are the only public
-- surface. They are owned by the migration role and therefore run with the
-- owner's rights (security_invoker = false) on purpose: that is what lets
-- them expose a fixed set of columns of rows that pass the filter, without
-- giving anon any access to the base tables. Supabase's "security definer
-- view" lint is expected for these three views.
--
-- Deliberately NOT exposed: address, latitude/longitude, assigned agent,
-- creator, landlords and ownership, internal notes, customers, deals.

create view public.public_properties
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
  p.updated_at
from public.properties p
where p.publication_status = 'published'
  and p.archived_at is null
  and p.availability_status in ('available', 'available_from');

create view public.public_property_translations
with (security_invoker = false) as
select
  t.property_id,
  t.locale,
  t.title,
  t.description,
  t.amenities
from public.property_translations t
join public.public_properties p on p.id = t.property_id;

create view public.public_property_media
with (security_invoker = false) as
select
  m.id,
  m.property_id,
  m.storage_path,
  m.media_type,
  m.caption,
  m.display_order,
  m.is_cover
from public.property_media m
join public.public_properties p on p.id = m.property_id;

grant select on
  public.public_properties,
  public.public_property_translations,
  public.public_property_media
  to anon, authenticated;

-- Storage ------------------------------------------------------------------------------
-- Both buckets are private. Public photos are readable only while their
-- property is published (policy below); a file of a draft or unpublished
-- listing is not reachable by visitors even if the path is known.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('property-media', 'property-media', false, 10485760,
   array['image/jpeg', 'image/png', 'image/webp', 'video/mp4']),
  ('private-docs', 'private-docs', false, 20971520,
   array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- "<property_id>/<file>" -> property_id, or null when the path is malformed.
create function private.property_id_from_path(object_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when (storage.foldername(object_name))[1]
         ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then ((storage.foldername(object_name))[1])::uuid
  end
$$;

revoke all on function private.property_id_from_path(text) from public, anon;
grant execute on function private.property_id_from_path(text)
  to authenticated, service_role;

create policy property_media_public_read on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'property-media'
    and exists (
      select 1 from public.public_property_media m
      where m.storage_path = storage.objects.name
    )
  );

create policy property_media_staff_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'property-media'
    and private.can_read_property(private.property_id_from_path(name))
  );

create policy property_media_staff_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'property-media'
    and private.can_edit_property_content(private.property_id_from_path(name))
  );

create policy property_media_staff_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'property-media'
    and private.can_edit_property_content(private.property_id_from_path(name))
  )
  with check (
    bucket_id = 'property-media'
    and private.can_edit_property_content(private.property_id_from_path(name))
  );

create policy property_media_staff_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'property-media'
    and private.can_edit_property_content(private.property_id_from_path(name))
  );

-- Private documents (landlord ID, title deeds, authorisations): administrators
-- and managers only until a documents table with per-record rules exists.
create policy private_docs_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'private-docs'
    and (select private.has_role('super_admin', 'manager'))
  );

create policy private_docs_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'private-docs'
    and (select private.has_role('super_admin', 'manager'))
  );
