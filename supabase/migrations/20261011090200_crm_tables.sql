-- 0003: leads, activities, viewings, tasks, deals and commissions.
--
-- Rent and agency revenue are kept apart on purpose: rental_deals holds what
-- the tenant pays the landlord (agreed_monthly_rent_minor); commissions holds
-- what the agency earns. They are never summed together.

-- leads ---------------------------------------------------------------------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null check (length(btrim(customer_name)) > 0),
  email text,
  phone text,
  preferred_language public.locale_code not null default 'en',
  source public.lead_source not null default 'other',
  campaign text,
  property_id uuid references public.properties (id) on delete restrict,
  budget_min_minor numeric(18, 0) check (budget_min_minor >= 0),
  budget_max_minor numeric(18, 0) check (budget_max_minor >= 0),
  currency public.currency_code not null default 'USD',
  preferred_area text,
  property_category public.property_category,
  assigned_agent_id uuid references public.profiles (id) on delete restrict,
  stage public.lead_stage not null default 'new',
  next_follow_up_at timestamptz,
  lost_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_has_contact check (email is not null or phone is not null),
  constraint leads_budget_order check (
    budget_min_minor is null or budget_max_minor is null
    or budget_max_minor >= budget_min_minor
  ),
  constraint leads_lost_needs_reason check (
    stage <> 'lost' or length(btrim(coalesce(lost_reason, ''))) > 0
  )
);

create index leads_assigned_agent_idx on public.leads (assigned_agent_id, stage);
create index leads_follow_up_idx on public.leads (next_follow_up_at)
  where next_follow_up_at is not null;
create index leads_property_idx on public.leads (property_id);

create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function private.set_updated_at();

-- lead_activities (append-only audit trail of customer contact) ---------------
create table public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete restrict,
  performed_by uuid not null references public.profiles (id) on delete restrict,
  activity_type public.activity_type not null,
  notes text,
  created_at timestamptz not null default now()
);

create index lead_activities_lead_idx on public.lead_activities (lead_id, created_at desc);

create function private.forbid_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% on % is not allowed: the table is append-only', tg_op, tg_table_name
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger lead_activities_append_only
  before update or delete on public.lead_activities
  for each row execute function private.forbid_change();

-- viewing_appointments --------------------------------------------------------
create table public.viewing_appointments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete restrict,
  property_id uuid not null references public.properties (id) on delete restrict,
  agent_id uuid not null references public.profiles (id) on delete restrict,
  scheduled_at timestamptz not null,
  status public.viewing_status not null default 'scheduled',
  outcome public.viewing_outcome,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint viewing_outcome_only_when_completed check (
    outcome is null or status = 'completed'
  )
);

create index viewing_appointments_agent_idx
  on public.viewing_appointments (agent_id, scheduled_at);
create index viewing_appointments_lead_idx on public.viewing_appointments (lead_id);
create index viewing_appointments_property_idx on public.viewing_appointments (property_id);

create trigger viewing_appointments_set_updated_at
  before update on public.viewing_appointments
  for each row execute function private.set_updated_at();

-- tasks ---------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) > 0),
  description text,
  assigned_to uuid references public.profiles (id) on delete restrict,
  created_by uuid not null references public.profiles (id) on delete restrict,
  lead_id uuid references public.leads (id) on delete restrict,
  property_id uuid references public.properties (id) on delete restrict,
  due_at timestamptz,
  priority public.task_priority not null default 'normal',
  status public.task_status not null default 'todo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_assigned_idx on public.tasks (assigned_to, status, due_at);
create index tasks_lead_idx on public.tasks (lead_id);
create index tasks_property_idx on public.tasks (property_id);

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function private.set_updated_at();

-- rental_deals ----------------------------------------------------------------
create table public.rental_deals (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete restrict,
  property_id uuid not null references public.properties (id) on delete restrict,
  agent_id uuid not null references public.profiles (id) on delete restrict,
  agreed_monthly_rent_minor numeric(18, 0) check (agreed_monthly_rent_minor >= 0),
  currency public.currency_code not null default 'USD',
  lease_start date,
  lease_end date,
  stage public.deal_stage not null default 'negotiation',
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rental_deals_lease_dates check (
    lease_start is null or lease_end is null or lease_end > lease_start
  ),
  constraint rental_deals_signed_needs_terms check (
    stage not in ('lease_signed', 'commission_invoiced', 'commission_collected')
    or (agreed_monthly_rent_minor is not null and lease_start is not null)
  )
);

create index rental_deals_agent_idx on public.rental_deals (agent_id, stage);
create index rental_deals_lead_idx on public.rental_deals (lead_id);
create index rental_deals_property_idx on public.rental_deals (property_id);

create trigger rental_deals_set_updated_at
  before update on public.rental_deals
  for each row execute function private.set_updated_at();

-- commissions -----------------------------------------------------------------
-- A deal can carry one commission per fee payer (landlord and/or tenant).
create table public.commissions (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.rental_deals (id) on delete restrict,
  fee_payer public.fee_payer not null,
  calculation_type public.commission_calculation not null,
  -- Percent (e.g. 50.0000 = 50 %) or number of months, depending on
  -- calculation_type. Null for fixed_amount.
  agreed_rate numeric(9, 4) check (agreed_rate >= 0),
  agreed_amount_minor numeric(18, 0) not null check (agreed_amount_minor >= 0),
  currency public.currency_code not null default 'USD',
  amount_paid_minor numeric(18, 0) not null default 0 check (amount_paid_minor >= 0),
  payment_status public.commission_payment_status not null default 'pending',
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commissions_one_per_payer unique (deal_id, fee_payer),
  constraint commissions_rate_matches_type check (
    (calculation_type = 'fixed_amount') = (agreed_rate is null)
  ),
  constraint commissions_paid_within_amount check (amount_paid_minor <= agreed_amount_minor)
);

create index commissions_status_idx on public.commissions (payment_status, due_date);

create trigger commissions_set_updated_at
  before update on public.commissions
  for each row execute function private.set_updated_at();
