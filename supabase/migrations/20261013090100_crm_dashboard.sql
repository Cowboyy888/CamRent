-- 0008: CRM dashboard and lead management (Step 4).
--   * lead requirement columns;
--   * automatic, tamper-proof history of stage and assignment changes;
--   * staff_names view and crm_lead_list view;
--   * dashboard aggregate functions that run with the caller's RLS.

-- Lead requirements -------------------------------------------------------------
alter table public.leads
  add column desired_move_in date,
  add column rental_period_months smallint
    check (rental_period_months is null or rental_period_months between 1 and 120),
  add column bedrooms_wanted smallint
    check (bedrooms_wanted is null or bedrooms_wanted between 0 and 20),
  add column requirements_notes text
    check (requirements_notes is null or length(requirements_notes) <= 2000);

create index leads_created_at_idx on public.leads (created_at desc);
create index leads_stage_idx on public.leads (stage);

-- Structured history ------------------------------------------------------------
alter table public.lead_activities
  add column from_stage public.lead_stage,
  add column to_stage public.lead_stage,
  add column from_agent_id uuid references public.profiles (id) on delete restrict,
  add column to_agent_id uuid references public.profiles (id) on delete restrict;

-- Every stage change and every assignment is written by the database itself,
-- as the signed-in user, so history cannot be skipped or forged by a client.
-- Updates made without a user (service role, migrations) are not attributed
-- to anyone and are therefore not logged here.
create function private.log_lead_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.assigned_agent_id is not null then
      insert into public.lead_activities (lead_id, performed_by, activity_type, to_agent_id)
      values (new.id, actor, 'assignment', new.assigned_agent_id);
    end if;
    return new;
  end if;

  if new.stage is distinct from old.stage then
    insert into public.lead_activities
      (lead_id, performed_by, activity_type, from_stage, to_stage, notes)
    values (new.id, actor, 'stage_change', old.stage, new.stage,
            case when new.stage in ('lost', 'cancelled', 'unresponsive', 'on_hold')
                 then new.lost_reason end);
  end if;

  if new.assigned_agent_id is distinct from old.assigned_agent_id then
    insert into public.lead_activities
      (lead_id, performed_by, activity_type, from_agent_id, to_agent_id)
    values (new.id, actor, 'assignment', old.assigned_agent_id, new.assigned_agent_id);
  end if;

  return new;
end;
$$;

create trigger leads_log_changes
  after insert or update on public.leads
  for each row execute function private.log_lead_changes();

-- A deal that reaches a signed-lease stage gets its closing timestamp once.
create function private.stamp_deal_closed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.stage in ('lease_signed', 'commission_invoiced', 'commission_collected')
     and new.closed_at is null then
    new.closed_at = now();
  end if;
  return new;
end;
$$;

create trigger rental_deals_stamp_closed_at
  before insert or update on public.rental_deals
  for each row execute function private.stamp_deal_closed_at();

-- Names of colleagues ------------------------------------------------------------
-- Staff need to see who did what, but profiles (phone numbers, role changes)
-- stay private. This exposes only id, name and role of active staff, to
-- signed-in users with an active profile.
create view public.staff_names
with (security_invoker = false) as
select p.id, p.full_name, p.role
from public.profiles p
where p.is_active
  and (select private.auth_role()) is not null;

-- Lead list ----------------------------------------------------------------------
-- security_invoker: the caller's RLS applies to leads and properties, so an
-- agent still sees only their own leads, and a linked property they may not
-- read simply shows no reference.
create view public.crm_lead_list
with (security_invoker = true) as
select
  l.id,
  l.customer_name,
  l.email,
  l.phone,
  l.preferred_language,
  l.source,
  l.stage,
  l.assigned_agent_id,
  n.full_name as agent_name,
  l.property_id,
  p.listing_code as property_reference,
  p.property_type as property_type,
  p.district as property_district,
  l.preferred_area,
  l.property_category,
  l.next_follow_up_at,
  l.created_at,
  l.updated_at
from public.leads l
left join public.properties p on p.id = l.property_id
left join public.staff_names n on n.id = l.assigned_agent_id;

-- Dashboard aggregates -----------------------------------------------------------
-- SECURITY INVOKER: counts cover only the rows the caller may read.
create function public.crm_dashboard_summary(
  day_start timestamptz,
  day_end timestamptz,
  month_start timestamptz,
  month_end timestamptz
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'active_leads', (
      select count(*) from public.leads
      where stage not in ('won', 'lost', 'cancelled', 'unresponsive', 'on_hold')),
    'new_today', (
      select count(*) from public.leads
      where created_at >= day_start and created_at < day_end),
    'follow_ups_due', (
      select count(*) from public.leads
      where next_follow_up_at is not null and next_follow_up_at < day_end
        and stage not in ('won', 'lost', 'cancelled', 'unresponsive', 'on_hold')),
    'viewings_today', (
      select count(*) from public.viewing_appointments
      where scheduled_at >= day_start and scheduled_at < day_end
        and status in ('scheduled', 'confirmed')),
    'deals_negotiation', (
      select count(*) from public.rental_deals where stage = 'negotiation'),
    'deals_closed_month', (
      select count(*) from public.rental_deals
      where closed_at >= month_start and closed_at < month_end
        and stage in ('lease_signed', 'commission_invoiced', 'commission_collected')),
    'commission_earned', coalesce((
      select jsonb_agg(jsonb_build_object('currency', currency, 'amount_minor', total))
      from (select currency, sum(amount_paid_minor) as total
            from public.commissions group by currency) c), '[]'::jsonb),
    'commission_outstanding', coalesce((
      select jsonb_agg(jsonb_build_object('currency', currency, 'amount_minor', total))
      from (select currency, sum(agreed_amount_minor - amount_paid_minor) as total
            from public.commissions
            where payment_status in ('pending', 'partial', 'overdue')
            group by currency) c), '[]'::jsonb)
  )
$$;

create function public.crm_agent_performance(month_start timestamptz, month_end timestamptz)
returns table (
  agent_id uuid,
  agent_name text,
  active_leads bigint,
  leads_received bigint,
  leads_won bigint,
  viewings_done bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id,
    p.full_name,
    (select count(*) from public.leads l
      where l.assigned_agent_id = p.id
        and l.stage not in ('won', 'lost', 'cancelled', 'unresponsive', 'on_hold')),
    (select count(*) from public.leads l
      where l.assigned_agent_id = p.id
        and l.created_at >= month_start and l.created_at < month_end),
    (select count(distinct a.lead_id) from public.lead_activities a
      join public.leads l on l.id = a.lead_id
      where l.assigned_agent_id = p.id and a.to_stage = 'won'
        and a.created_at >= month_start and a.created_at < month_end),
    (select count(*) from public.viewing_appointments v
      where v.agent_id = p.id and v.status = 'completed'
        and v.scheduled_at >= month_start and v.scheduled_at < month_end)
  from public.profiles p
  where p.role = 'agent' and p.is_active
  order by p.full_name
$$;

-- Privileges ----------------------------------------------------------------------
revoke all on public.staff_names, public.crm_lead_list from anon, authenticated;
grant select on public.staff_names, public.crm_lead_list to authenticated;

revoke all on function public.crm_dashboard_summary(timestamptz, timestamptz, timestamptz, timestamptz)
  from public, anon;
revoke all on function public.crm_agent_performance(timestamptz, timestamptz) from public, anon;
grant execute on function public.crm_dashboard_summary(timestamptz, timestamptz, timestamptz, timestamptz)
  to authenticated;
grant execute on function public.crm_agent_performance(timestamptz, timestamptz) to authenticated;
