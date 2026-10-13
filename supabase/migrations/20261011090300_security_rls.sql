-- 0004: role helpers, guard triggers, grants and Row Level Security.
--
-- Principles
--   * The caller's role is read from public.profiles (never from JWT user
--     metadata, which users can edit) by SECURITY DEFINER helpers that also
--     require is_active. A user without an active profile row has no access,
--     so enabling Supabase sign-up by mistake would still not grant data.
--   * anon has NO privileges on any table. Public listings are served by
--     views (migration 0005).
--   * authenticated gets only the verbs it needs; there is no DELETE on
--     business tables (properties are archived, never deleted).
--   * Policies state who may act; triggers below protect columns a policy
--     cannot compare (role changes, publication, ownership, payments).

-- Role helpers --------------------------------------------------------------
create function private.auth_role()
returns public.staff_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid()) and p.is_active
$$;

create function private.has_role(variadic allowed public.staff_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.role = any (allowed)
     from public.profiles p
     where p.id = (select auth.uid()) and p.is_active),
    false)
$$;

-- Relationship helpers (SECURITY DEFINER so they can look across tables
-- without triggering recursive policy evaluation).
create function private.can_read_property(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.properties p
    where p.id = pid
      and (
        private.has_role('super_admin', 'manager', 'marketing', 'finance')
        or (
          private.has_role('agent')
          and (
            p.publication_status = 'published'
            or p.assigned_agent_id = (select auth.uid())
            or p.created_by = (select auth.uid())
          )
        )
      )
  )
$$;

-- May change the property's own record (not just its marketing content).
create function private.can_write_property(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.properties p
    where p.id = pid
      and (
        private.has_role('super_admin', 'manager')
        or (
          private.has_role('agent')
          and p.archived_at is null
          and (p.assigned_agent_id = (select auth.uid())
               or p.created_by = (select auth.uid()))
        )
      )
  )
$$;

-- May edit translations and media: everyone who can write the property,
-- plus marketing for any non-archived property.
create function private.can_edit_property_content(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_write_property(pid)
    or (
      private.has_role('marketing')
      and exists (
        select 1 from public.properties p
        where p.id = pid and p.archived_at is null
      )
    )
$$;

create function private.can_access_lead(lid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.leads l
    where l.id = lid
      and (
        private.has_role('super_admin', 'manager')
        or (private.has_role('agent') and l.assigned_agent_id = (select auth.uid()))
      )
  )
$$;

-- Landlord contact details are visible to an agent only for landlords they
-- registered or whose property is assigned to / created by them.
create function private.agent_can_see_landlord(lid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.landlords l
    where l.id = lid and l.created_by = (select auth.uid())
  )
  or exists (
    select 1
    from public.property_ownership o
    join public.properties p on p.id = o.property_id
    where o.landlord_id = lid
      and (p.assigned_agent_id = (select auth.uid())
           or p.created_by = (select auth.uid()))
  )
$$;

create function private.is_deal_agent(did uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.rental_deals d
    where d.id = did and d.agent_id = (select auth.uid())
  )
$$;

-- Function privileges ---------------------------------------------------------
revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;

-- Guard triggers -----------------------------------------------------------------
-- Rows may never change owner.
create function private.keep_created_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'created_by cannot be changed'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger properties_keep_created_by
  before update on public.properties
  for each row execute function private.keep_created_by();
create trigger landlords_keep_created_by
  before update on public.landlords
  for each row execute function private.keep_created_by();
create trigger tasks_keep_created_by
  before update on public.tasks
  for each row execute function private.keep_created_by();

-- Agents may draft and submit listings but cannot publish, unpublish,
-- archive, re-assign or re-code them. Managers and administrators (and
-- trusted server code using the service role) are not restricted here.
create function private.guard_property_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.auth_role() is distinct from 'agent' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.publication_status not in ('draft', 'submitted') then
      raise exception 'agents can only create draft or submitted listings'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  if new.listing_code is distinct from old.listing_code
     or new.assigned_agent_id is distinct from old.assigned_agent_id
     or new.archived_at is distinct from old.archived_at then
    raise exception 'agents cannot change listing code, assignment or archive state'
      using errcode = 'insufficient_privilege';
  end if;

  if new.publication_status is distinct from old.publication_status
     and not (
       old.publication_status in ('draft', 'submitted', 'changes_requested')
       and new.publication_status in ('draft', 'submitted')
     ) then
    raise exception 'agents cannot change publication status from % to %',
      old.publication_status, new.publication_status
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger properties_guard_changes
  before insert or update on public.properties
  for each row execute function private.guard_property_changes();

-- Agents cannot mark a landlord as verified.
create function private.guard_landlord_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.auth_role() is distinct from 'agent' then
    return new;
  end if;
  if (tg_op = 'INSERT' and new.verification_status <> 'unverified')
     or (tg_op = 'UPDATE'
         and new.verification_status is distinct from old.verification_status) then
    raise exception 'agents cannot change landlord verification status'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger landlords_guard_changes
  before insert or update on public.landlords
  for each row execute function private.guard_landlord_changes();

-- Managers can adjust commission terms (overrides) but only finance and
-- administrators record payments.
create function private.guard_commission_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.auth_role() = 'manager' then
    if tg_op = 'INSERT'
       and (new.amount_paid_minor <> 0 or new.payment_status <> 'pending') then
      raise exception 'managers cannot record commission payments'
        using errcode = 'insufficient_privilege';
    end if;
    if tg_op = 'UPDATE'
       and (new.amount_paid_minor is distinct from old.amount_paid_minor
            or new.payment_status is distinct from old.payment_status) then
      raise exception 'managers cannot record commission payments'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

create trigger commissions_guard_changes
  before insert or update on public.commissions
  for each row execute function private.guard_commission_changes();

-- Privileged operation: change a staff member's role or active flag.
-- Only a super admin may call it, and not on themselves, so the agency can
-- never lock itself out. Exposed as an RPC; there is no column grant for
-- role or is_active on profiles.
create function public.set_staff_role(
  target_user uuid,
  new_role public.staff_role,
  make_active boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.auth_role() is distinct from 'super_admin' then
    raise exception 'only a super admin can change staff roles'
      using errcode = 'insufficient_privilege';
  end if;
  if target_user = (select auth.uid()) then
    raise exception 'you cannot change your own role or active status'
      using errcode = 'insufficient_privilege';
  end if;

  update public.profiles
  set role = new_role, is_active = make_active
  where id = target_user;

  if not found then
    raise exception 'no staff profile for that user' using errcode = 'no_data_found';
  end if;
end;
$$;

revoke all on function public.set_staff_role(uuid, public.staff_role, boolean)
  from public, anon;
grant execute on function public.set_staff_role(uuid, public.staff_role, boolean)
  to authenticated;

-- Table privileges --------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

grant select on public.profiles to authenticated;
-- No role / is_active here: see public.set_staff_role().
grant update (full_name, phone, preferred_language) on public.profiles to authenticated;

grant select, insert, update on
  public.landlords, public.properties, public.property_ownership,
  public.leads, public.viewing_appointments, public.tasks,
  public.rental_deals, public.commissions
  to authenticated;
grant select, insert, update, delete on
  public.property_translations, public.property_media
  to authenticated;
grant select, insert on public.lead_activities to authenticated;

-- Row Level Security --------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.landlords enable row level security;
alter table public.properties enable row level security;
alter table public.property_translations enable row level security;
alter table public.property_media enable row level security;
alter table public.property_ownership enable row level security;
alter table public.leads enable row level security;
alter table public.lead_activities enable row level security;
alter table public.viewing_appointments enable row level security;
alter table public.tasks enable row level security;
alter table public.rental_deals enable row level security;
alter table public.commissions enable row level security;

-- profiles: own row; administrators and managers see the whole team. -----------
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (select private.has_role('super_admin', 'manager'))
  );

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- landlords ---------------------------------------------------------------------
create policy landlords_select on public.landlords
  for select to authenticated
  using (
    (select private.has_role('super_admin', 'manager'))
    or ((select private.has_role('agent')) and private.agent_can_see_landlord(id))
  );

create policy landlords_insert on public.landlords
  for insert to authenticated
  with check (
    (select private.has_role('super_admin', 'manager'))
    or ((select private.has_role('agent')) and created_by = (select auth.uid()))
  );

create policy landlords_update on public.landlords
  for update to authenticated
  using (
    (select private.has_role('super_admin', 'manager'))
    or ((select private.has_role('agent')) and private.agent_can_see_landlord(id))
  )
  with check (
    (select private.has_role('super_admin', 'manager'))
    or ((select private.has_role('agent')) and private.agent_can_see_landlord(id))
  );

-- properties --------------------------------------------------------------------
create policy properties_select on public.properties
  for select to authenticated
  using (
    (select private.has_role('super_admin', 'manager', 'marketing', 'finance'))
    or (
      (select private.has_role('agent'))
      and (
        publication_status = 'published'
        or assigned_agent_id = (select auth.uid())
        or created_by = (select auth.uid())
      )
    )
  );

create policy properties_insert on public.properties
  for insert to authenticated
  with check (
    (select private.has_role('super_admin', 'manager'))
    or (
      (select private.has_role('agent'))
      and created_by = (select auth.uid())
      and (assigned_agent_id is null or assigned_agent_id = (select auth.uid()))
    )
  );

create policy properties_update on public.properties
  for update to authenticated
  using (private.can_write_property(id))
  with check (
    (select private.has_role('super_admin', 'manager'))
    or (
      (select private.has_role('agent'))
      and (assigned_agent_id = (select auth.uid())
           or created_by = (select auth.uid()))
    )
  );

-- property_translations / property_media -------------------------------------------
create policy property_translations_select on public.property_translations
  for select to authenticated
  using (private.can_read_property(property_id));
create policy property_translations_insert on public.property_translations
  for insert to authenticated
  with check (private.can_edit_property_content(property_id));
create policy property_translations_update on public.property_translations
  for update to authenticated
  using (private.can_edit_property_content(property_id))
  with check (private.can_edit_property_content(property_id));
create policy property_translations_delete on public.property_translations
  for delete to authenticated
  using (private.can_edit_property_content(property_id));

create policy property_media_select on public.property_media
  for select to authenticated
  using (private.can_read_property(property_id));
create policy property_media_insert on public.property_media
  for insert to authenticated
  with check (private.can_edit_property_content(property_id));
create policy property_media_update on public.property_media
  for update to authenticated
  using (private.can_edit_property_content(property_id))
  with check (private.can_edit_property_content(property_id));
create policy property_media_delete on public.property_media
  for delete to authenticated
  using (private.can_edit_property_content(property_id));

-- property_ownership ------------------------------------------------------------------
create policy property_ownership_select on public.property_ownership
  for select to authenticated
  using (
    (select private.has_role('super_admin', 'manager'))
    or ((select private.has_role('agent')) and private.can_write_property(property_id))
  );

-- Agents can propose an authorisation; managers approve it by updating.
create policy property_ownership_insert on public.property_ownership
  for insert to authenticated
  with check (
    (select private.has_role('super_admin', 'manager'))
    or (
      (select private.has_role('agent'))
      and authorization_status = 'pending'
      and private.can_write_property(property_id)
    )
  );

create policy property_ownership_update on public.property_ownership
  for update to authenticated
  using ((select private.has_role('super_admin', 'manager')))
  with check ((select private.has_role('super_admin', 'manager')));

-- leads ---------------------------------------------------------------------------------
create policy leads_select on public.leads
  for select to authenticated
  using (
    (select private.has_role('super_admin', 'manager'))
    or ((select private.has_role('agent')) and assigned_agent_id = (select auth.uid()))
  );

create policy leads_insert on public.leads
  for insert to authenticated
  with check (
    (select private.has_role('super_admin', 'manager'))
    or ((select private.has_role('agent')) and assigned_agent_id = (select auth.uid()))
  );

-- WITH CHECK keeps an agent from handing a lead to someone else or
-- un-assigning it; only managers re-assign.
create policy leads_update on public.leads
  for update to authenticated
  using (
    (select private.has_role('super_admin', 'manager'))
    or ((select private.has_role('agent')) and assigned_agent_id = (select auth.uid()))
  )
  with check (
    (select private.has_role('super_admin', 'manager'))
    or ((select private.has_role('agent')) and assigned_agent_id = (select auth.uid()))
  );

-- lead_activities -------------------------------------------------------------------------
create policy lead_activities_select on public.lead_activities
  for select to authenticated
  using (private.can_access_lead(lead_id));

create policy lead_activities_insert on public.lead_activities
  for insert to authenticated
  with check (
    performed_by = (select auth.uid())
    and private.can_access_lead(lead_id)
  );

-- viewing_appointments ------------------------------------------------------------------------
create policy viewing_appointments_select on public.viewing_appointments
  for select to authenticated
  using (
    (select private.has_role('super_admin', 'manager'))
    or (
      (select private.has_role('agent'))
      and (agent_id = (select auth.uid()) or private.can_access_lead(lead_id))
    )
  );

create policy viewing_appointments_insert on public.viewing_appointments
  for insert to authenticated
  with check (
    (select private.has_role('super_admin', 'manager'))
    or (
      (select private.has_role('agent'))
      and agent_id = (select auth.uid())
      and private.can_access_lead(lead_id)
    )
  );

create policy viewing_appointments_update on public.viewing_appointments
  for update to authenticated
  using (
    (select private.has_role('super_admin', 'manager'))
    or ((select private.has_role('agent')) and agent_id = (select auth.uid()))
  )
  with check (
    (select private.has_role('super_admin', 'manager'))
    or ((select private.has_role('agent')) and agent_id = (select auth.uid()))
  );

-- tasks --------------------------------------------------------------------------------------------
create policy tasks_select on public.tasks
  for select to authenticated
  using (
    (select private.has_role('super_admin', 'manager'))
    or assigned_to = (select auth.uid())
    or created_by = (select auth.uid())
  );

create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      (select private.has_role('super_admin', 'manager'))
      or (
        (assigned_to is null or assigned_to = (select auth.uid()))
        and (lead_id is null or private.can_access_lead(lead_id))
        and (property_id is null or private.can_read_property(property_id))
      )
    )
  );

create policy tasks_update on public.tasks
  for update to authenticated
  using (
    (select private.has_role('super_admin', 'manager'))
    or assigned_to = (select auth.uid())
    or created_by = (select auth.uid())
  )
  with check (
    (select private.has_role('super_admin', 'manager'))
    or (
      (assigned_to is null or assigned_to = (select auth.uid()))
      and (lead_id is null or private.can_access_lead(lead_id))
      and (property_id is null or private.can_read_property(property_id))
    )
  );

-- rental_deals --------------------------------------------------------------------------------------------
create policy rental_deals_select on public.rental_deals
  for select to authenticated
  using (
    (select private.has_role('super_admin', 'manager', 'finance'))
    or ((select private.has_role('agent')) and agent_id = (select auth.uid()))
  );

create policy rental_deals_insert on public.rental_deals
  for insert to authenticated
  with check (
    (select private.has_role('super_admin', 'manager'))
    or (
      (select private.has_role('agent'))
      and agent_id = (select auth.uid())
      and stage = 'negotiation'
      and private.can_access_lead(lead_id)
    )
  );

-- Agents work a deal until the lease is signed; invoicing and collection
-- stages belong to managers and finance.
create policy rental_deals_update on public.rental_deals
  for update to authenticated
  using (
    (select private.has_role('super_admin', 'manager'))
    or (
      (select private.has_role('agent'))
      and agent_id = (select auth.uid())
      and stage in ('negotiation', 'reserved')
    )
  )
  with check (
    (select private.has_role('super_admin', 'manager'))
    or (
      (select private.has_role('agent'))
      and agent_id = (select auth.uid())
      and stage in ('negotiation', 'reserved', 'lease_signed', 'lost')
    )
  );

-- commissions -------------------------------------------------------------------------------------------------
create policy commissions_select on public.commissions
  for select to authenticated
  using (
    (select private.has_role('super_admin', 'manager', 'finance'))
    or ((select private.has_role('agent')) and private.is_deal_agent(deal_id))
  );

create policy commissions_insert on public.commissions
  for insert to authenticated
  with check ((select private.has_role('super_admin', 'manager', 'finance')));

create policy commissions_update on public.commissions
  for update to authenticated
  using ((select private.has_role('super_admin', 'manager', 'finance')))
  with check ((select private.has_role('super_admin', 'manager', 'finance')));
