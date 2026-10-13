-- 0013: numbered, private, generated documents (Step 6).
--
-- Every PDF is a row here (who, when, what, which language) plus a file in
-- the private bucket. Numbers come from a per-type, per-year counter.
-- Nothing generated is a signed or legally binding document.

create type public.document_type as enum (
  'listing_sheet', 'inquiry_summary', 'viewing_confirmation', 'deal_summary',
  'commission_statement', 'payout_statement', 'landlord_submission', 'agreement_draft'
);

create table public.document_counters (
  doc_type public.document_type not null,
  year integer not null,
  last_value integer not null default 0,
  primary key (doc_type, year)
);

create table public.generated_documents (
  id uuid primary key default gen_random_uuid(),
  doc_type public.document_type not null,
  reference text not null unique,
  -- What the document is about: property, lead, viewing, deal, commission,
  -- or landlord submission, depending on doc_type.
  entity_id uuid not null,
  locale public.locale_code not null,
  storage_path text,
  file_name text,
  generated_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);
create index generated_documents_entity_idx on public.generated_documents (doc_type, entity_id);
create index generated_documents_created_idx on public.generated_documents (created_at desc);

create function private.document_prefix(dt public.document_type)
returns text
language sql
immutable
set search_path = ''
as $$
  select case dt
    when 'listing_sheet' then 'LS'
    when 'inquiry_summary' then 'IN'
    when 'viewing_confirmation' then 'VC'
    when 'deal_summary' then 'DS'
    when 'commission_statement' then 'CS'
    when 'payout_statement' then 'PS'
    when 'landlord_submission' then 'LU'
    when 'agreement_draft' then 'DA'
  end
$$;

-- Who may produce (and later read) a document about this record. Reuses the
-- existing record-level helpers, so a document is never easier to get than
-- the record itself.
create function private.can_generate_document(dt public.document_type, eid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return case dt
    when 'listing_sheet' then
      private.has_role('super_admin', 'manager', 'agent', 'marketing')
      and private.can_read_property(eid)
    when 'inquiry_summary' then
      private.can_access_lead(eid)
    when 'viewing_confirmation' then
      exists (select 1 from public.viewing_appointments v
              where v.id = eid and private.can_access_lead(v.lead_id))
    when 'deal_summary' then
      private.has_role('super_admin', 'manager', 'finance', 'agent') and private.can_read_deal(eid)
    when 'commission_statement' then
      private.has_role('super_admin', 'manager', 'finance')
      and exists (select 1 from public.commissions c where c.id = eid)
    when 'payout_statement' then
      private.has_role('super_admin', 'manager', 'finance', 'agent') and private.can_read_deal(eid)
    when 'landlord_submission' then
      private.has_role('super_admin', 'manager')
      and exists (select 1 from public.landlord_submissions s where s.id = eid)
    when 'agreement_draft' then
      private.has_role('super_admin', 'manager') and private.can_read_deal(eid)
    else false
  end;
end;
$$;

create function private.generated_documents_before()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  yr integer := extract(year from (now() at time zone 'Asia/Phnom_Penh'))::integer;
  n integer;
begin
  if tg_op = 'INSERT' then
    insert into public.document_counters as c (doc_type, year, last_value)
    values (new.doc_type, yr, 1)
    on conflict (doc_type, year) do update set last_value = c.last_value + 1
    returning c.last_value into n;

    new.reference := private.document_prefix(new.doc_type) || '-' || yr || '-' || lpad(n::text, 6, '0');
    new.generated_by := coalesce((select auth.uid()), new.generated_by);
    new.storage_path := null;
    new.file_name := null;
    return new;
  end if;

  -- The record may only be completed once, with its file.
  if new.doc_type is distinct from old.doc_type
     or new.entity_id is distinct from old.entity_id
     or new.reference is distinct from old.reference
     or new.locale is distinct from old.locale
     or new.generated_by is distinct from old.generated_by
     or new.created_at is distinct from old.created_at then
    raise exception 'a generated document cannot be changed' using errcode = 'check_violation';
  end if;
  if old.storage_path is not null then
    raise exception 'the file of a generated document cannot be replaced' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger generated_documents_before
  before insert or update on public.generated_documents
  for each row execute function private.generated_documents_before();

create function private.forbid_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'records of generated documents are kept' using errcode = 'insufficient_privilege';
end;
$$;

create trigger generated_documents_no_delete
  before delete on public.generated_documents
  for each row execute function private.forbid_delete();

alter table public.document_counters enable row level security;
alter table public.generated_documents enable row level security;
revoke all on public.document_counters, public.generated_documents from anon, authenticated;
grant select, insert on public.generated_documents to authenticated;
grant update (storage_path, file_name) on public.generated_documents to authenticated;

create policy generated_documents_select on public.generated_documents
  for select to authenticated
  using (private.can_generate_document(doc_type, entity_id));
create policy generated_documents_insert on public.generated_documents
  for insert to authenticated
  with check (
    generated_by = (select auth.uid())
    and private.can_generate_document(doc_type, entity_id)
  );
create policy generated_documents_update on public.generated_documents
  for update to authenticated
  using (generated_by = (select auth.uid()) and storage_path is null)
  with check (generated_by = (select auth.uid()));

-- Files: generated/<document id>/<file>. Readable by whoever can read the
-- document record; writable once, by whoever generated it.
create policy private_docs_generated_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'private-docs'
    and (storage.foldername(name))[1] = 'generated'
    and exists (
      select 1 from public.generated_documents d
      where d.id = private.uuid_from_path(name, 2)
    )
  );
create policy private_docs_generated_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'private-docs'
    and (storage.foldername(name))[1] = 'generated'
    and exists (
      select 1 from public.generated_documents d
      where d.id = private.uuid_from_path(name, 2)
        and d.generated_by = (select auth.uid())
        and d.storage_path is null
    )
  );

