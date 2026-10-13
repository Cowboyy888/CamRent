-- 0012: tasks, in-app notifications and the follow-up automation engine (Step 6).
--
-- Automation runs inside the database (a function), triggered on a schedule
-- by pg_cron, by a protected HTTP endpoint (hosting cron) or by a manager
-- ("run now"). It does not depend on any browser being open, and it never
-- contacts customers: it only creates tasks, notifications and flags.

-- Tasks: system-created tasks and links ------------------------------------------
alter table public.tasks
  alter column created_by drop not null,
  add column deal_id uuid references public.rental_deals (id) on delete restrict,
  add column source text check (length(source) <= 60),
  add column automation_key text check (length(automation_key) <= 200),
  add column completed_at timestamptz;

create unique index tasks_automation_key_key
  on public.tasks (automation_key) where automation_key is not null;
create index tasks_deal_idx on public.tasks (deal_id);
create index tasks_open_due_idx on public.tasks (due_at)
  where status in ('todo', 'in_progress');

create function private.tasks_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger tasks_completion
  before insert or update on public.tasks
  for each row execute function private.tasks_completion();

-- Lead flag raised by the "no contact within SLA" rule.
alter table public.leads add column sla_breached_at timestamptz;

-- The lead list shows the flag. Columns may only be appended to a view; the
-- existing grants and security_invoker setting are kept by CREATE OR REPLACE.
create or replace view public.crm_lead_list
with (security_invoker = true) as
select
  l.id, l.customer_name, l.email, l.phone, l.preferred_language, l.source, l.stage,
  l.assigned_agent_id, n.full_name as agent_name, l.property_id,
  p.listing_code as property_reference, p.property_type as property_type,
  p.district as property_district, l.preferred_area, l.property_category,
  l.next_follow_up_at, l.created_at, l.updated_at,
  l.sla_breached_at
from public.leads l
left join public.properties p on p.id = l.property_id
left join public.staff_names n on n.id = l.assigned_agent_id;

-- Notifications -----------------------------------------------------------------------
create type public.notification_type as enum (
  'lead_assigned', 'lead_reassigned', 'lead_unassigned', 'lead_sla_breached',
  'viewing_scheduled', 'viewing_upcoming', 'viewing_rescheduled',
  'task_assigned', 'task_overdue',
  'payout_updated', 'commission_updated', 'lease_expiring'
);

-- Content is deliberately minimal: a type and a pointer. The words, and any
-- names, are produced when the recipient looks at it, through their own
-- permissions, in their own language.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete restrict,
  type public.notification_type not null,
  entity_type text not null check (entity_type in ('lead', 'task', 'deal', 'commission')),
  entity_id uuid not null,
  dedupe_key text not null check (length(dedupe_key) <= 200),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint notifications_dedupe unique (recipient_id, dedupe_key)
);
create index notifications_recipient_idx
  on public.notifications (recipient_id, created_at desc);
create index notifications_unread_idx
  on public.notifications (recipient_id) where read_at is null;

create table public.notification_preferences (
  user_id uuid not null references public.profiles (id) on delete restrict,
  type public.notification_type not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, type)
);

create function private.notify(
  recipient uuid,
  ntype public.notification_type,
  etype text,
  eid uuid,
  dedupe text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if recipient is null then
    return;
  end if;
  if not exists (select 1 from public.profiles p where p.id = recipient and p.is_active) then
    return;
  end if;
  if exists (
    select 1 from public.notification_preferences np
    where np.user_id = recipient and np.type = ntype and not np.enabled
  ) then
    return;
  end if;
  insert into public.notifications (recipient_id, type, entity_type, entity_id, dedupe_key)
  values (recipient, ntype, etype, eid, dedupe)
  on conflict (recipient_id, dedupe_key) do nothing;
end;
$$;

-- Everyone who manages the team (used for escalations).
create function private.notify_managers(
  ntype public.notification_type,
  etype text,
  eid uuid,
  dedupe text,
  except_user uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
begin
  for m in
    select p.id from public.profiles p
    where p.is_active and p.role in ('super_admin', 'manager')
      and p.id is distinct from except_user
  loop
    perform private.notify(m.id, ntype, etype, eid, dedupe);
  end loop;
end;
$$;

-- Event notifications written by the database itself -------------------------------------
create function private.leads_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    if new.assigned_agent_id is not null and new.assigned_agent_id is distinct from actor then
      perform private.notify(new.assigned_agent_id, 'lead_assigned', 'lead', new.id,
        'lead_assigned:' || new.id || ':' || gen_random_uuid());
    end if;
    return new;
  end if;

  if new.assigned_agent_id is distinct from old.assigned_agent_id then
    if new.assigned_agent_id is not null and new.assigned_agent_id is distinct from actor then
      perform private.notify(new.assigned_agent_id, 'lead_assigned', 'lead', new.id,
        'lead_assigned:' || new.id || ':' || gen_random_uuid());
    end if;
    if old.assigned_agent_id is not null
       and old.assigned_agent_id is distinct from actor
       and old.assigned_agent_id is distinct from new.assigned_agent_id then
      perform private.notify(old.assigned_agent_id, 'lead_reassigned', 'lead', new.id,
        'lead_reassigned:' || new.id || ':' || gen_random_uuid());
    end if;
  end if;
  return new;
end;
$$;

create trigger leads_notify
  after insert or update on public.leads
  for each row execute function private.leads_notify();

create function private.tasks_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if new.assigned_to is not null
     and new.assigned_to is distinct from actor
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) then
    perform private.notify(new.assigned_to, 'task_assigned', 'task', new.id,
      'task_assigned:' || new.id || ':' || gen_random_uuid());
  end if;
  return new;
end;
$$;

create trigger tasks_notify
  after insert or update on public.tasks
  for each row execute function private.tasks_notify();

create function private.viewings_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  owner uuid;
begin
  if tg_op = 'INSERT' then
    if new.agent_id is distinct from actor then
      perform private.notify(new.agent_id, 'viewing_scheduled', 'lead', new.lead_id,
        'viewing_scheduled:' || new.id || ':' || gen_random_uuid());
    end if;
    return new;
  end if;

  if new.scheduled_at is distinct from old.scheduled_at
     and new.status in ('scheduled', 'confirmed') then
    if new.agent_id is distinct from actor then
      perform private.notify(new.agent_id, 'viewing_rescheduled', 'lead', new.lead_id,
        'viewing_rescheduled:' || new.id || ':' || gen_random_uuid());
    end if;
    select l.assigned_agent_id into owner from public.leads l where l.id = new.lead_id;
    if owner is not null and owner is distinct from actor and owner is distinct from new.agent_id then
      perform private.notify(owner, 'viewing_rescheduled', 'lead', new.lead_id,
        'viewing_rescheduled:' || new.id || ':' || gen_random_uuid());
    end if;
  end if;
  return new;
end;
$$;

create trigger viewings_notify
  after insert or update on public.viewing_appointments
  for each row execute function private.viewings_notify();

-- Payout and commission status changes reach only people who may read them.
create function private.payouts_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    perform private.notify_managers('payout_updated', 'deal', new.deal_id,
      'payout:' || new.id || ':pending_approval', actor);
  elsif new.status is distinct from old.status then
    if new.agent_id is distinct from actor then
      perform private.notify(new.agent_id, 'payout_updated', 'deal', new.deal_id,
        'payout:' || new.id || ':' || new.status);
    end if;
  end if;
  return new;
end;
$$;

create trigger agent_payouts_notify
  after insert or update on public.agent_payouts
  for each row execute function private.payouts_notify();

create function private.commissions_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  agent uuid;
begin
  if new.payment_status is distinct from old.payment_status then
    select d.agent_id into agent from public.rental_deals d where d.id = new.deal_id;
    if agent is not null and agent is distinct from actor then
      perform private.notify(agent, 'commission_updated', 'commission', new.id,
        'commission:' || new.id || ':' || new.payment_status || ':' || gen_random_uuid());
    end if;
  end if;
  return new;
end;
$$;

create trigger commissions_notify
  after update on public.commissions
  for each row execute function private.commissions_notify();

-- Automation: rules, runs, events ---------------------------------------------------------
create table public.automation_rules (
  code text primary key,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles (id) on delete restrict,
  updated_at timestamptz not null default now()
);

create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null check (trigger in ('schedule', 'manual', 'retry')),
  started_by uuid references public.profiles (id) on delete restrict,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'succeeded', 'partial', 'failed', 'skipped')),
  summary jsonb not null default '{}'::jsonb
);
create index automation_runs_started_idx on public.automation_runs (started_at desc);

-- One row per piece of work. The unique idempotency key is what makes a rule
-- safe to run any number of times: the same subject in the same bucket is
-- processed once.
create table public.automation_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.automation_runs (id) on delete restrict,
  rule_code text not null references public.automation_rules (code) on delete restrict,
  subject_type text not null,
  subject_id uuid not null,
  idempotency_key text not null,
  status text not null check (status in ('done', 'failed')),
  outcome text,
  error_summary text check (length(error_summary) <= 200),
  attempts integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automation_events_key unique (idempotency_key)
);
create index automation_events_run_idx on public.automation_events (run_id);
create index automation_events_failed_idx on public.automation_events (status, created_at desc)
  where status = 'failed';

create trigger automation_rules_set_updated_at
  before update on public.automation_rules
  for each row execute function private.set_updated_at();
create trigger automation_events_set_updated_at
  before update on public.automation_events
  for each row execute function private.set_updated_at();

-- Defaults. Every number below is a starting point the agency can change.
insert into public.automation_rules (code, enabled, config) values
  ('new_inquiry_task', true, '{"due_hours": 2, "lookback_days": 7}'),
  ('unassigned_inquiry_notify', true, '{"after_minutes": 30, "lookback_days": 7}'),
  ('no_contact_sla', true, '{"sla_hours": 24, "lookback_days": 14}'),
  ('viewing_confirmation_task', true, '{"hours_before": 24, "lookback_days": 14}'),
  ('viewing_completed_prompt', true, '{"grace_minutes": 60, "lookback_days": 14}'),
  ('negotiation_followup', true, '{"interval_days": 3, "due_hours": 24}'),
  ('overdue_task_reminder', true, '{"repeat_hours": 24, "lookback_days": 30}'),
  ('upcoming_viewing_reminder', true, '{"hours_before": 24}'),
  ('lease_expiry_renewal', true, '{"reminder_days": [90, 30]}');

-- Settings are validated in the database, so no client can store nonsense.
create function private.validate_automation_config()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  limits jsonb := '{
    "due_hours": [1, 720], "lookback_days": [1, 90], "after_minutes": [1, 10080],
    "sla_hours": [1, 720], "hours_before": [1, 720], "grace_minutes": [0, 10080],
    "interval_days": [1, 90], "repeat_hours": [1, 720]
  }';
  k text;
  v jsonb;
  lo int;
  hi int;
begin
  if jsonb_typeof(new.config) <> 'object' then
    raise exception 'config must be an object' using errcode = 'check_violation';
  end if;
  for k, v in select * from jsonb_each(new.config) loop
    if k = 'reminder_days' then
      if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) not between 1 and 6
         or exists (
           select 1 from jsonb_array_elements(v) e
           where jsonb_typeof(e) <> 'number' or (e #>> '{}')::numeric <> floor((e #>> '{}')::numeric)
              or (e #>> '{}')::int not between 1 and 730
         ) then
        raise exception 'reminder_days must be 1 to 6 whole numbers between 1 and 730'
          using errcode = 'check_violation';
      end if;
    elsif limits ? k then
      lo := (limits -> k ->> 0)::int;
      hi := (limits -> k ->> 1)::int;
      if jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric <> floor((v #>> '{}')::numeric)
         or (v #>> '{}')::int not between lo and hi then
        raise exception '% must be a whole number from % to %', k, lo, hi
          using errcode = 'check_violation';
      end if;
    else
      raise exception 'unknown setting %', k using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end;
$$;

create trigger automation_rules_validate
  before update on public.automation_rules
  for each row execute function private.validate_automation_config();

-- Idempotent claim of one piece of work. Returns the event id, or null when
-- this key has already been completed (nothing to do).
create function private.claim_event(
  run uuid,
  rule text,
  stype text,
  sid uuid,
  key text,
  result text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  eid uuid;
begin
  insert into public.automation_events
    (run_id, rule_code, subject_type, subject_id, idempotency_key, status, outcome)
  values (run, rule, stype, sid, key, 'done', result)
  on conflict (idempotency_key) do update
    set status = 'done', run_id = excluded.run_id, outcome = excluded.outcome,
        error_summary = null, attempts = public.automation_events.attempts + 1
    where public.automation_events.status = 'failed'
  returning id into eid;
  return eid;
end;
$$;

create function private.fail_event(
  run uuid,
  rule text,
  stype text,
  sid uuid,
  key text,
  state text,
  constraint_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only the SQL state and constraint name are kept: never row contents.
  insert into public.automation_events
    (run_id, rule_code, subject_type, subject_id, idempotency_key, status, error_summary)
  values (run, rule, stype, sid, key, 'failed',
          left(state || coalesce(':' || nullif(constraint_name, ''), ''), 200))
  on conflict (idempotency_key) do update
    set status = 'failed', run_id = excluded.run_id, error_summary = excluded.error_summary,
        attempts = public.automation_events.attempts + 1
    where public.automation_events.status = 'failed';
end;
$$;

-- Rules ------------------------------------------------------------------------------------
-- Each rule looks at a bounded window of recent records, claims every piece
-- of work by key, and creates tasks / notifications with their own unique
-- keys as a second line of defence. Candidates are skipped when the owner
-- (assigned agent) is missing, so work always lands with the right person.

create function private.rule_new_inquiry_task(run uuid, cfg jsonb, only_subject uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r record; k text; st text; cn text;
begin
  for r in
    select l.id, l.assigned_agent_id from public.leads l
    where l.assigned_agent_id is not null and l.stage = 'new'
      and l.created_at > now() - make_interval(days => (cfg ->> 'lookback_days')::int)
      and (only_subject is null or l.id = only_subject)
  loop
    k := 'new_inquiry_task:lead:' || r.id;
    begin
      if private.claim_event(run, 'new_inquiry_task', 'lead', r.id, k, 'task_created') is null then
        continue;
      end if;
      insert into public.tasks (title, assigned_to, lead_id, due_at, priority, source, automation_key)
      values ('Contact the new inquiry', r.assigned_agent_id, r.id,
              now() + make_interval(hours => (cfg ->> 'due_hours')::int), 'high',
              'new_inquiry_task', k)
      on conflict (automation_key) where automation_key is not null do nothing;
    exception when others then
      get stacked diagnostics st = returned_sqlstate, cn = constraint_name;
      perform private.fail_event(run, 'new_inquiry_task', 'lead', r.id, k, st, cn);
    end;
  end loop;
end $$;

create function private.rule_unassigned_inquiry_notify(run uuid, cfg jsonb, only_subject uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r record; k text; st text; cn text;
begin
  for r in
    select l.id from public.leads l
    where l.assigned_agent_id is null and l.stage = 'new'
      and l.created_at > now() - make_interval(days => (cfg ->> 'lookback_days')::int)
      and l.created_at < now() - make_interval(mins => (cfg ->> 'after_minutes')::int)
      and (only_subject is null or l.id = only_subject)
  loop
    k := 'unassigned_inquiry_notify:lead:' || r.id;
    begin
      if private.claim_event(run, 'unassigned_inquiry_notify', 'lead', r.id, k, 'managers_notified') is null then
        continue;
      end if;
      perform private.notify_managers('lead_unassigned', 'lead', r.id, 'lead_unassigned:' || r.id);
    exception when others then
      get stacked diagnostics st = returned_sqlstate, cn = constraint_name;
      perform private.fail_event(run, 'unassigned_inquiry_notify', 'lead', r.id, k, st, cn);
    end;
  end loop;
end $$;

create function private.rule_no_contact_sla(run uuid, cfg jsonb, only_subject uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r record; k text; st text; cn text;
begin
  for r in
    select l.id, l.assigned_agent_id from public.leads l
    where l.assigned_agent_id is not null and l.stage = 'new' and l.sla_breached_at is null
      and l.created_at > now() - make_interval(days => (cfg ->> 'lookback_days')::int)
      and l.created_at < now() - make_interval(hours => (cfg ->> 'sla_hours')::int)
      and not exists (
        select 1 from public.lead_activities a
        where a.lead_id = l.id and a.activity_type in ('call', 'message', 'email', 'meeting', 'note'))
      and (only_subject is null or l.id = only_subject)
  loop
    k := 'no_contact_sla:lead:' || r.id;
    begin
      if private.claim_event(run, 'no_contact_sla', 'lead', r.id, k, 'flagged') is null then
        continue;
      end if;
      update public.leads set sla_breached_at = now() where id = r.id and sla_breached_at is null;
      perform private.notify(r.assigned_agent_id, 'lead_sla_breached', 'lead', r.id, 'lead_sla:' || r.id);
      perform private.notify_managers('lead_sla_breached', 'lead', r.id, 'lead_sla:' || r.id);
    exception when others then
      get stacked diagnostics st = returned_sqlstate, cn = constraint_name;
      perform private.fail_event(run, 'no_contact_sla', 'lead', r.id, k, st, cn);
    end;
  end loop;
end $$;

create function private.rule_viewing_confirmation_task(run uuid, cfg jsonb, only_subject uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r record; k text; st text; cn text;
begin
  for r in
    select v.id, v.agent_id, v.lead_id, v.scheduled_at from public.viewing_appointments v
    where v.status = 'scheduled' and v.scheduled_at > now()
      and v.created_at > now() - make_interval(days => (cfg ->> 'lookback_days')::int)
      and (only_subject is null or v.id = only_subject)
  loop
    -- A new time is a new job: rescheduling asks for a fresh confirmation.
    k := 'viewing_confirmation_task:viewing:' || r.id || ':' || extract(epoch from r.scheduled_at)::bigint;
    begin
      if private.claim_event(run, 'viewing_confirmation_task', 'viewing', r.id, k, 'task_created') is null then
        continue;
      end if;
      insert into public.tasks (title, assigned_to, lead_id, due_at, priority, source, automation_key)
      values ('Confirm the viewing with the customer', r.agent_id, r.lead_id,
              greatest(now(), r.scheduled_at - make_interval(hours => (cfg ->> 'hours_before')::int)),
              'normal', 'viewing_confirmation_task', k)
      on conflict (automation_key) where automation_key is not null do nothing;
    exception when others then
      get stacked diagnostics st = returned_sqlstate, cn = constraint_name;
      perform private.fail_event(run, 'viewing_confirmation_task', 'viewing', r.id, k, st, cn);
    end;
  end loop;
end $$;

create function private.rule_viewing_completed_prompt(run uuid, cfg jsonb, only_subject uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r record; k text; st text; cn text;
begin
  for r in
    select v.id, v.agent_id, v.lead_id from public.viewing_appointments v
    where v.status in ('scheduled', 'confirmed')
      and v.scheduled_at < now() - make_interval(mins => (cfg ->> 'grace_minutes')::int)
      and v.scheduled_at > now() - make_interval(days => (cfg ->> 'lookback_days')::int)
      and (only_subject is null or v.id = only_subject)
  loop
    k := 'viewing_completed_prompt:viewing:' || r.id;
    begin
      if private.claim_event(run, 'viewing_completed_prompt', 'viewing', r.id, k, 'task_created') is null then
        continue;
      end if;
      insert into public.tasks (title, assigned_to, lead_id, due_at, priority, source, automation_key)
      values ('Record the viewing result and the next step', r.agent_id, r.lead_id,
              now() + interval '4 hours', 'high', 'viewing_completed_prompt', k)
      on conflict (automation_key) where automation_key is not null do nothing;
    exception when others then
      get stacked diagnostics st = returned_sqlstate, cn = constraint_name;
      perform private.fail_event(run, 'viewing_completed_prompt', 'viewing', r.id, k, st, cn);
    end;
  end loop;
end $$;

create function private.rule_negotiation_followup(run uuid, cfg jsonb, only_subject uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r record; k text; st text; cn text; bucket bigint;
begin
  bucket := floor(extract(epoch from now()) / ((cfg ->> 'interval_days')::int * 86400))::bigint;
  for r in
    select l.id, l.assigned_agent_id from public.leads l
    where l.assigned_agent_id is not null and l.stage in ('negotiation', 'reserved')
      and greatest(
            l.updated_at,
            coalesce((select max(a.created_at) from public.lead_activities a where a.lead_id = l.id), l.created_at)
          ) < now() - make_interval(days => (cfg ->> 'interval_days')::int)
      and not exists (
        select 1 from public.tasks t
        where t.lead_id = l.id and t.source = 'negotiation_followup' and t.status in ('todo', 'in_progress'))
      and (only_subject is null or l.id = only_subject)
  loop
    k := 'negotiation_followup:lead:' || r.id || ':' || bucket;
    begin
      if private.claim_event(run, 'negotiation_followup', 'lead', r.id, k, 'task_created') is null then
        continue;
      end if;
      insert into public.tasks (title, assigned_to, lead_id, due_at, priority, source, automation_key)
      values ('Follow up on the negotiation', r.assigned_agent_id, r.id,
              now() + make_interval(hours => (cfg ->> 'due_hours')::int), 'normal',
              'negotiation_followup', k)
      on conflict (automation_key) where automation_key is not null do nothing;
    exception when others then
      get stacked diagnostics st = returned_sqlstate, cn = constraint_name;
      perform private.fail_event(run, 'negotiation_followup', 'lead', r.id, k, st, cn);
    end;
  end loop;
end $$;

create function private.rule_overdue_task_reminder(run uuid, cfg jsonb, only_subject uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r record; k text; st text; cn text; bucket bigint;
begin
  bucket := floor(extract(epoch from now()) / ((cfg ->> 'repeat_hours')::int * 3600))::bigint;
  for r in
    select t.id, t.assigned_to from public.tasks t
    where t.status in ('todo', 'in_progress') and t.assigned_to is not null
      and t.due_at < now()
      and t.due_at > now() - make_interval(days => (cfg ->> 'lookback_days')::int)
      and (only_subject is null or t.id = only_subject)
  loop
    k := 'overdue_task_reminder:task:' || r.id || ':' || bucket;
    begin
      if private.claim_event(run, 'overdue_task_reminder', 'task', r.id, k, 'notified') is null then
        continue;
      end if;
      perform private.notify(r.assigned_to, 'task_overdue', 'task', r.id,
        'task_overdue:' || r.id || ':' || bucket);
    exception when others then
      get stacked diagnostics st = returned_sqlstate, cn = constraint_name;
      perform private.fail_event(run, 'overdue_task_reminder', 'task', r.id, k, st, cn);
    end;
  end loop;
end $$;

create function private.rule_upcoming_viewing_reminder(run uuid, cfg jsonb, only_subject uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r record; k text; st text; cn text;
begin
  for r in
    select v.id, v.agent_id, v.lead_id, v.scheduled_at from public.viewing_appointments v
    where v.status in ('scheduled', 'confirmed')
      and v.scheduled_at > now()
      and v.scheduled_at <= now() + make_interval(hours => (cfg ->> 'hours_before')::int)
      and (only_subject is null or v.id = only_subject)
  loop
    k := 'upcoming_viewing_reminder:viewing:' || r.id || ':' || extract(epoch from r.scheduled_at)::bigint;
    begin
      if private.claim_event(run, 'upcoming_viewing_reminder', 'viewing', r.id, k, 'notified') is null then
        continue;
      end if;
      perform private.notify(r.agent_id, 'viewing_upcoming', 'lead', r.lead_id,
        'viewing_upcoming:' || r.id || ':' || extract(epoch from r.scheduled_at)::bigint);
    exception when others then
      get stacked diagnostics st = returned_sqlstate, cn = constraint_name;
      perform private.fail_event(run, 'upcoming_viewing_reminder', 'viewing', r.id, k, st, cn);
    end;
  end loop;
end $$;

create function private.rule_lease_expiry_renewal(run uuid, cfg jsonb, only_subject uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r record; k text; st text; cn text;
  today date := (now() at time zone 'Asia/Phnom_Penh')::date;
  periods int[];
  widest int;
  picked int;
begin
  select array_agg((e #>> '{}')::int order by (e #>> '{}')::int)
  into periods from jsonb_array_elements(cfg -> 'reminder_days') e;
  widest := periods[array_upper(periods, 1)];

  for r in
    select d.id, d.agent_id, d.lease_end, (d.lease_end - today) as days_left
    from public.rental_deals d
    where d.stage = 'closed_won' and d.lease_end is not null
      and d.lease_end >= today and d.lease_end - today <= widest
      and (only_subject is null or d.id = only_subject)
  loop
    -- The tightest reminder period that already applies (e.g. 30 before 90).
    select min(p) into picked from unnest(periods) p where p >= r.days_left;
    k := 'lease_expiry_renewal:deal:' || r.id || ':' || picked;
    begin
      if private.claim_event(run, 'lease_expiry_renewal', 'deal', r.id, k, 'task_created') is null then
        continue;
      end if;
      insert into public.tasks (title, assigned_to, deal_id, due_at, priority, source, automation_key)
      values ('Renewal follow-up: the lease ends soon', r.agent_id, r.id,
              now() + interval '3 days', 'normal', 'lease_expiry_renewal', k)
      on conflict (automation_key) where automation_key is not null do nothing;
      perform private.notify(r.agent_id, 'lease_expiring', 'deal', r.id,
        'lease_expiring:' || r.id || ':' || picked);
    exception when others then
      get stacked diagnostics st = returned_sqlstate, cn = constraint_name;
      perform private.fail_event(run, 'lease_expiry_renewal', 'deal', r.id, k, st, cn);
    end;
  end loop;
end $$;

-- Dispatcher ---------------------------------------------------------------------------------
create function private.run_rule(code text, run uuid, cfg jsonb, only_subject uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  case code
    when 'new_inquiry_task' then perform private.rule_new_inquiry_task(run, cfg, only_subject);
    when 'unassigned_inquiry_notify' then perform private.rule_unassigned_inquiry_notify(run, cfg, only_subject);
    when 'no_contact_sla' then perform private.rule_no_contact_sla(run, cfg, only_subject);
    when 'viewing_confirmation_task' then perform private.rule_viewing_confirmation_task(run, cfg, only_subject);
    when 'viewing_completed_prompt' then perform private.rule_viewing_completed_prompt(run, cfg, only_subject);
    when 'negotiation_followup' then perform private.rule_negotiation_followup(run, cfg, only_subject);
    when 'overdue_task_reminder' then perform private.rule_overdue_task_reminder(run, cfg, only_subject);
    when 'upcoming_viewing_reminder' then perform private.rule_upcoming_viewing_reminder(run, cfg, only_subject);
    when 'lease_expiry_renewal' then perform private.rule_lease_expiry_renewal(run, cfg, only_subject);
    else raise exception 'unknown rule %', code;
  end case;
end;
$$;

-- Runs every enabled rule (or one rule for one subject, for retries) and
-- records the result. A single advisory lock stops two runs overlapping.
create function private.run_automation(
  trigger_kind text,
  by_user uuid default null,
  only_rule text default null,
  only_subject uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  run uuid;
  rule record;
  st text;
  cn text;
  failed int;
  done int;
begin
  insert into public.automation_runs (trigger, started_by)
  values (trigger_kind, by_user) returning id into run;

  if not pg_try_advisory_xact_lock(hashtext('camrent.automation')) then
    update public.automation_runs
    set status = 'skipped', finished_at = now(), summary = '{"reason": "another run is in progress"}'
    where id = run;
    return run;
  end if;

  for rule in
    select r.code, r.config from public.automation_rules r
    where r.enabled and (only_rule is null or r.code = only_rule)
    order by r.code
  loop
    begin
      perform private.run_rule(rule.code, run, rule.config, only_subject);
    exception when others then
      get stacked diagnostics st = returned_sqlstate, cn = constraint_name;
      perform private.fail_event(run, rule.code, 'rule', run,
        'rule_failure:' || rule.code || ':' || run, st, cn);
    end;
  end loop;

  select count(*) filter (where status = 'failed'), count(*) filter (where status = 'done')
  into failed, done from public.automation_events where run_id = run;

  update public.automation_runs
  set finished_at = now(),
      status = case when failed = 0 then 'succeeded' when done > 0 then 'partial' else 'failed' end,
      summary = jsonb_build_object('done', done, 'failed', failed)
  where id = run;
  return run;
end;
$$;

-- Entry points -----------------------------------------------------------------------------------
-- Scheduled (service role / pg_cron only).
create function public.run_automation_scheduled()
returns uuid
language sql
security definer
set search_path = ''
as $$ select private.run_automation('schedule') $$;

-- "Run now" for managers and administrators.
create function public.run_automation_now()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.auth_role() is null or private.auth_role() not in ('super_admin', 'manager') then
    raise exception 'only a manager can run automation' using errcode = 'insufficient_privilege';
  end if;
  return private.run_automation('manual', (select auth.uid()));
end;
$$;

-- Retry one failed piece of work (same key, so no duplicates).
create function public.retry_automation_event(event uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.automation_events;
begin
  if private.auth_role() is null or private.auth_role() not in ('super_admin', 'manager') then
    raise exception 'only a manager can retry automation' using errcode = 'insufficient_privilege';
  end if;
  select * into e from public.automation_events where id = event;
  if not found or e.status <> 'failed' or e.subject_type = 'rule' then
    raise exception 'this event cannot be retried' using errcode = 'check_violation';
  end if;
  return private.run_automation('retry', (select auth.uid()), e.rule_code, e.subject_id);
end;
$$;

revoke all on function public.run_automation_scheduled() from public, anon, authenticated;
grant execute on function public.run_automation_scheduled() to service_role;
revoke all on function public.run_automation_now() from public, anon;
grant execute on function public.run_automation_now() to authenticated;
revoke all on function public.retry_automation_event(uuid) from public, anon;
grant execute on function public.retry_automation_event(uuid) to authenticated;

-- Security ------------------------------------------------------------------------------------------
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.automation_rules enable row level security;
alter table public.automation_runs enable row level security;
alter table public.automation_events enable row level security;

revoke all on
  public.notifications, public.notification_preferences,
  public.automation_rules, public.automation_runs, public.automation_events
  from anon, authenticated;

grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select, insert on public.notification_preferences to authenticated;
grant update (enabled) on public.notification_preferences to authenticated;
grant select on public.automation_runs, public.automation_events to authenticated;
grant select on public.automation_rules to authenticated;
grant update (enabled, config, updated_by) on public.automation_rules to authenticated;

create policy notifications_select on public.notifications
  for select to authenticated using (recipient_id = (select auth.uid()));
create policy notifications_update on public.notifications
  for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

create policy notification_preferences_select on public.notification_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy notification_preferences_insert on public.notification_preferences
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy notification_preferences_update on public.notification_preferences
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy automation_rules_select on public.automation_rules
  for select to authenticated
  using ((select private.has_role('super_admin', 'manager')));
create policy automation_rules_update on public.automation_rules
  for update to authenticated
  using ((select private.has_role('super_admin', 'manager')))
  with check ((select private.has_role('super_admin', 'manager')));
create policy automation_runs_select on public.automation_runs
  for select to authenticated
  using ((select private.has_role('super_admin', 'manager')));
create policy automation_events_select on public.automation_events
  for select to authenticated
  using ((select private.has_role('super_admin', 'manager')));

-- Rule changes are part of the audit trail.
create trigger automation_rules_audit
  after update on public.automation_rules
  for each row execute function private.audit_financial('code');

-- Schedule ------------------------------------------------------------------------------------------
-- pg_cron is available on Supabase. If the extension cannot be created here,
-- the migration still succeeds and the HTTP endpoint (CRON_SECRET) or the
-- "run now" button can be used instead; see docs/automation.md.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule(
    'camrent-automation',
    '*/10 * * * *',
    $job$select private.run_automation('schedule')$job$
  );
exception when others then
  raise notice 'pg_cron schedule not created: %', sqlerrm;
end;
$$;
