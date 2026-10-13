-- 0010: rental deal terms, commission arrangement, receivable ledger, agent
-- payouts, expenses, documents and the financial audit trail (Step 5).
--
-- Money rules (see docs/finance.md)
--   * integer minor units in NUMERIC(18,0) columns named *_minor, always next
--     to a currency; there is no cross-currency arithmetic anywhere;
--   * percentages are NUMERIC(9,4) "percent" values (50 = 50 %) and results
--     are rounded half up to the nearest minor unit;
--   * collections, write-offs and corrections are rows in an append-only
--     ledger; balances stored on commissions are caches rebuilt from it.

create extension if not exists btree_gist with schema extensions;

-- Types ------------------------------------------------------------------------
create type public.commission_method as enum (
  'fixed_amount', 'percent_of_monthly_rent', 'percent_of_total_rent', 'custom_amount'
);
create type public.agent_share_method as enum ('none', 'percent_of_commission', 'fixed_amount');
create type public.ledger_entry_type as enum (
  'payment', 'reversal', 'write_off', 'adjustment_up', 'adjustment_down'
);
create type public.payment_method as enum ('cash', 'bank_transfer', 'aba', 'wing', 'other');
create type public.payout_status as enum (
  'pending_approval', 'approved', 'paid', 'rejected', 'cancelled', 'reversed'
);
create type public.expense_category as enum (
  'advertising', 'transportation', 'office_rent', 'staff_costs',
  'marketing_materials', 'utilities', 'other'
);
create type public.expense_status as enum ('pending', 'approved', 'rejected');
create type public.commission_earned_rule as enum ('on_closed_won', 'on_collection');
create type public.payout_eligibility_rule as enum ('on_collected', 'on_earned');
create type public.document_kind as enum ('agreement', 'receipt', 'other');

-- Agency settings -----------------------------------------------------------------
-- One row. These are *defaults and rules the agency chooses*; the commission
-- arrangement of each deal is copied onto the deal, so changing a default never
-- changes a historical deal. Nothing here is pre-filled with an invented rate.
create table public.finance_settings (
  singleton boolean primary key default true check (singleton),
  commission_earned_rule public.commission_earned_rule not null default 'on_closed_won',
  payout_eligibility_rule public.payout_eligibility_rule not null default 'on_collected',
  default_commission_method public.commission_method,
  default_commission_rate numeric(9, 4) check (default_commission_rate between 0 and 100),
  default_commission_fixed_minor numeric(18, 0) check (default_commission_fixed_minor >= 0),
  default_agent_share_method public.agent_share_method not null default 'none',
  default_agent_share_rate numeric(9, 4) check (default_agent_share_rate between 0 and 100),
  default_agent_share_fixed_minor numeric(18, 0) check (default_agent_share_fixed_minor >= 0),
  updated_by uuid references public.profiles (id) on delete restrict,
  updated_at timestamptz not null default now()
);
insert into public.finance_settings default values;

create trigger finance_settings_set_updated_at
  before update on public.finance_settings
  for each row execute function private.set_updated_at();

-- Money helpers ----------------------------------------------------------------------
-- Rounded half up to the nearest minor unit. NULL when the inputs are not
-- enough to say (an incomplete arrangement has no expected commission).
create function private.commission_amount(
  method public.commission_method,
  rate numeric,
  fixed_minor numeric,
  monthly_rent_minor numeric,
  lease_months integer
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case method
    when 'fixed_amount' then fixed_minor
    when 'custom_amount' then fixed_minor
    when 'percent_of_monthly_rent' then
      case when rate is null or monthly_rent_minor is null then null
           else floor(monthly_rent_minor * rate / 100 + 0.5) end
    when 'percent_of_total_rent' then
      case when rate is null or monthly_rent_minor is null
                or lease_months is null or lease_months < 1 then null
           else floor(monthly_rent_minor * lease_months * rate / 100 + 0.5) end
  end
$$;

-- Rental deals ---------------------------------------------------------------------------
alter table public.rental_deals
  add column landlord_id uuid references public.landlords (id) on delete restrict,
  add column deposit_minor numeric(18, 0) check (deposit_minor >= 0),
  add column advance_rent_minor numeric(18, 0) check (advance_rent_minor >= 0),
  add column agreement_reference text check (length(agreement_reference) <= 120),
  add column closing_date date,
  add column notes text check (length(notes) <= 2000),
  add column status_reason text check (length(status_reason) <= 500),
  add column lease_months smallint,
  add column commission_method public.commission_method,
  add column commission_rate numeric(9, 4) check (commission_rate between 0 and 100),
  add column commission_fixed_minor numeric(18, 0) check (commission_fixed_minor >= 0),
  add column commission_expected_minor numeric(18, 0),
  add column agent_share_method public.agent_share_method not null default 'none',
  add column agent_share_rate numeric(9, 4) check (agent_share_rate between 0 and 100),
  add column agent_share_fixed_minor numeric(18, 0) check (agent_share_fixed_minor >= 0),
  add column agent_share_expected_minor numeric(18, 0);

-- Existing deals move to the new statuses. Commission progress is now tracked
-- by the receivable ledger, not by the deal status.
update public.rental_deals
set stage = 'closed_won',
    closing_date = coalesce(closed_at::date, lease_start, created_at::date)
where stage in ('lease_signed', 'commission_invoiced', 'commission_collected');
update public.rental_deals set stage = 'closed_lost' where stage = 'lost';

alter table public.rental_deals drop constraint rental_deals_signed_needs_terms;
drop trigger rental_deals_stamp_closed_at on public.rental_deals;
drop function private.stamp_deal_closed_at();

-- The arrangement is all-or-nothing and matches its method.
alter table public.rental_deals
  add constraint rental_deals_commission_arrangement check (
    (commission_method is null and commission_rate is null and commission_fixed_minor is null)
    or (commission_method in ('fixed_amount', 'custom_amount')
        and commission_fixed_minor is not null and commission_rate is null)
    or (commission_method in ('percent_of_monthly_rent', 'percent_of_total_rent')
        and commission_rate is not null and commission_fixed_minor is null)
  ),
  add constraint rental_deals_agent_share_arrangement check (
    (agent_share_method = 'none' and agent_share_rate is null and agent_share_fixed_minor is null)
    or (agent_share_method = 'percent_of_commission'
        and agent_share_rate is not null and agent_share_fixed_minor is null)
    or (agent_share_method = 'fixed_amount'
        and agent_share_fixed_minor is not null and agent_share_rate is null)
  ),
  -- NOT VALID: rows migrated from earlier steps are not re-checked until they
  -- are next edited; every new or edited deal must satisfy it.
  add constraint rental_deals_won_needs_terms check (
    stage not in ('closed_won', 'lease_expired')
    or (
      agreed_monthly_rent_minor is not null
      and lease_start is not null and lease_end is not null
      and landlord_id is not null
      and closing_date is not null
      and length(btrim(coalesce(agreement_reference, ''))) > 0
      and commission_method is not null
      and commission_expected_minor is not null
    )
  ) not valid,
  add constraint rental_deals_ended_needs_reason check (
    stage not in ('closed_lost', 'cancelled')
    or length(btrim(coalesce(status_reason, ''))) > 0
  ) not valid;

-- One live deal per lead and property, and no two signed leases on the same
-- property that overlap in time.
create unique index rental_deals_one_active_per_transaction
  on public.rental_deals (lead_id, property_id)
  where stage in ('negotiation', 'reserved', 'agreement_pending', 'closed_won');

alter table public.rental_deals
  add constraint rental_deals_no_overlapping_leases exclude using gist (
    property_id with =,
    daterange(lease_start, lease_end, '[]') with &&
  ) where (stage = 'closed_won' and lease_start is not null and lease_end is not null);

create index rental_deals_landlord_idx on public.rental_deals (landlord_id);
create index rental_deals_closing_idx on public.rental_deals (closing_date);

create function private.deal_transition_allowed(
  from_stage public.deal_stage,
  to_stage public.deal_stage
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case from_stage
    when 'negotiation' then to_stage in ('reserved', 'agreement_pending', 'closed_lost', 'cancelled')
    when 'reserved' then to_stage in ('negotiation', 'agreement_pending', 'closed_lost', 'cancelled')
    when 'agreement_pending' then to_stage in ('reserved', 'closed_won', 'closed_lost', 'cancelled')
    when 'closed_won' then to_stage in ('lease_expired', 'cancelled')
    when 'closed_lost' then to_stage in ('negotiation')
    when 'cancelled' then to_stage in ('negotiation')
    else false
  end
$$;

create function private.rental_deal_before()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.staff_role := private.auth_role();
begin
  -- Derived values are always recomputed here, never trusted from a client.
  if new.lease_start is not null and new.lease_end is not null then
    new.lease_months := nullif(
      extract(year from age(new.lease_end + 1, new.lease_start)) * 12
      + extract(month from age(new.lease_end + 1, new.lease_start)), 0)::smallint;
  else
    new.lease_months := null;
  end if;

  new.commission_expected_minor := case
    when new.commission_method is null then null
    else private.commission_amount(
      new.commission_method, new.commission_rate, new.commission_fixed_minor,
      new.agreed_monthly_rent_minor, new.lease_months)
  end;

  new.agent_share_expected_minor := case new.agent_share_method
    when 'none' then 0
    when 'fixed_amount' then new.agent_share_fixed_minor
    when 'percent_of_commission' then
      case when new.commission_expected_minor is null then null
           else floor(new.commission_expected_minor * new.agent_share_rate / 100 + 0.5) end
  end;

  if new.agent_share_expected_minor is not null
     and new.commission_expected_minor is not null
     and new.agent_share_expected_minor > new.commission_expected_minor then
    raise exception 'the agent share cannot exceed the agency commission'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' then
    if new.stage is distinct from old.stage then
      if not private.deal_transition_allowed(old.stage, new.stage) then
        raise exception 'a deal cannot move from % to %', old.stage, new.stage
          using errcode = 'check_violation';
      end if;
      -- Agents work a deal up to the agreement; closing and ending are management's.
      if actor_role = 'agent'
         and new.stage in ('closed_won', 'lease_expired', 'cancelled') then
        raise exception 'only a manager can set a deal to %', new.stage
          using errcode = 'insufficient_privilege';
      end if;
      if new.stage in ('closed_won') and new.closed_at is null then
        new.closed_at := now();
      end if;
    end if;

    -- A signed deal's terms are frozen: corrections are ledger entries, so a
    -- later edit can never rewrite what was agreed.
    if old.stage in ('closed_won', 'lease_expired') and (
         new.lead_id is distinct from old.lead_id
         or new.property_id is distinct from old.property_id
         or new.agent_id is distinct from old.agent_id
         or new.landlord_id is distinct from old.landlord_id
         or new.agreed_monthly_rent_minor is distinct from old.agreed_monthly_rent_minor
         or new.currency is distinct from old.currency
         or new.lease_start is distinct from old.lease_start
         or new.lease_end is distinct from old.lease_end
         or new.deposit_minor is distinct from old.deposit_minor
         or new.advance_rent_minor is distinct from old.advance_rent_minor
         or new.closing_date is distinct from old.closing_date
         or new.commission_method is distinct from old.commission_method
         or new.commission_rate is distinct from old.commission_rate
         or new.commission_fixed_minor is distinct from old.commission_fixed_minor
         or new.agent_share_method is distinct from old.agent_share_method
         or new.agent_share_rate is distinct from old.agent_share_rate
         or new.agent_share_fixed_minor is distinct from old.agent_share_fixed_minor
       ) then
      raise exception 'the terms of a closed deal cannot be changed'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger rental_deals_before
  before insert or update on public.rental_deals
  for each row execute function private.rental_deal_before();

-- A signed deal means the customer's lead is won (logged against the user).
create function private.rental_deal_after()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.stage = 'closed_won' and (tg_op = 'INSERT' or old.stage is distinct from new.stage) then
    update public.leads set stage = 'won' where id = new.lead_id and stage <> 'won';
  end if;
  return new;
end;
$$;

create trigger rental_deals_after
  after insert or update on public.rental_deals
  for each row execute function private.rental_deal_after();

-- Deal documents (agreements, receipts, supporting files) --------------------------------------
create table public.deal_documents (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.rental_deals (id) on delete restrict,
  kind public.document_kind not null default 'other',
  storage_path text not null check (length(btrim(storage_path)) > 0),
  file_name text not null check (length(btrim(file_name)) between 1 and 200),
  uploaded_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint deal_documents_path_key unique (storage_path)
);
create index deal_documents_deal_idx on public.deal_documents (deal_id);

-- Commission receivables and their ledger ---------------------------------------------------------
alter table public.commissions
  add column invoiced_on date,
  add column adjustment_minor numeric(18, 0) not null default 0,
  add column written_off_minor numeric(18, 0) not null default 0 check (written_off_minor >= 0),
  add column notes text check (length(notes) <= 1000);

alter table public.commissions drop constraint commissions_paid_within_amount;
alter table public.commissions
  add constraint commissions_balance_not_negative check (
    amount_paid_minor + written_off_minor <= agreed_amount_minor + adjustment_minor
  ),
  add constraint commissions_due_not_negative check (agreed_amount_minor + adjustment_minor >= 0);

create table public.commission_transactions (
  id uuid primary key default gen_random_uuid(),
  commission_id uuid not null references public.commissions (id) on delete restrict,
  entry_type public.ledger_entry_type not null,
  amount_minor numeric(18, 0) not null check (amount_minor > 0),
  currency public.currency_code not null,
  occurred_on date not null,
  payment_method public.payment_method,
  reference text check (length(reference) <= 120),
  reason text check (length(reason) <= 500),
  notes text check (length(notes) <= 1000),
  reverses_id uuid references public.commission_transactions (id) on delete restrict,
  recorded_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint ledger_reversal_links check ((entry_type = 'reversal') = (reverses_id is not null)),
  constraint ledger_payment_has_method check (entry_type <> 'payment' or payment_method is not null),
  constraint ledger_correction_has_reason check (
    entry_type in ('payment') or length(btrim(coalesce(reason, ''))) > 0
  )
);
create index commission_transactions_commission_idx
  on public.commission_transactions (commission_id, occurred_on);
create index commission_transactions_date_idx on public.commission_transactions (occurred_on);

create trigger commission_transactions_append_only
  before update or delete on public.commission_transactions
  for each row execute function private.forbid_change();

-- A receivable can only be raised against a signed deal, in the deal's
-- currency, and all receivables of a deal together cannot exceed the
-- commission the deal's arrangement expects.
create function private.commission_before()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  deal public.rental_deals;
  allocated numeric;
begin
  select * into deal from public.rental_deals where id = new.deal_id for update;
  if not found then
    raise exception 'deal not found' using errcode = 'no_data_found';
  end if;

  if tg_op = 'INSERT' then
    if deal.stage <> 'closed_won' then
      raise exception 'commission receivables can only be raised on a closed-won deal'
        using errcode = 'check_violation';
    end if;
    new.currency := deal.currency;
    new.amount_paid_minor := 0;
    new.adjustment_minor := 0;
    new.written_off_minor := 0;
    new.payment_status := 'pending';
  else
    if new.agreed_amount_minor is distinct from old.agreed_amount_minor
       and exists (select 1 from public.commission_transactions t where t.commission_id = old.id) then
      raise exception 'the amount of a receivable with entries is changed by adjustment entries'
        using errcode = 'check_violation';
    end if;
  end if;

  select coalesce(sum(c.agreed_amount_minor), 0) into allocated
  from public.commissions c
  where c.deal_id = new.deal_id and c.id is distinct from new.id;

  if allocated + new.agreed_amount_minor > coalesce(deal.commission_expected_minor, 0) then
    raise exception 'receivables (%) would exceed the deal''s expected commission (%)',
      allocated + new.agreed_amount_minor, coalesce(deal.commission_expected_minor, 0)
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger commissions_before
  before insert or update on public.commissions
  for each row execute function private.commission_before();

drop trigger commissions_guard_changes on public.commissions;
drop function private.guard_commission_changes();

-- Ledger rules. Locks the receivable row, so two people recording a payment
-- at the same moment are applied one after the other against the real balance.
create function private.commission_ledger_before()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.commissions;
  due numeric;
  outstanding numeric;
  original public.commission_transactions;
  already_reversed numeric;
begin
  select * into c from public.commissions where id = new.commission_id for update;
  if not found then
    raise exception 'receivable not found' using errcode = 'no_data_found';
  end if;

  new.currency := c.currency;
  new.recorded_by := coalesce((select auth.uid()), new.recorded_by);
  if new.occurred_on > (now() at time zone 'Asia/Phnom_Penh')::date then
    raise exception 'an entry cannot be dated in the future' using errcode = 'check_violation';
  end if;

  due := c.agreed_amount_minor + c.adjustment_minor;
  outstanding := due - c.amount_paid_minor - c.written_off_minor;

  if new.entry_type <> 'reversal' and new.reverses_id is not null then
    raise exception 'only a reversal can reference another entry' using errcode = 'check_violation';
  end if;

  case new.entry_type
    when 'payment' then
      if new.amount_minor > outstanding then
        raise exception 'payment (%) exceeds the outstanding balance (%)',
          new.amount_minor, outstanding using errcode = 'check_violation';
      end if;
    when 'write_off' then
      if new.amount_minor > outstanding then
        raise exception 'write-off (%) exceeds the outstanding balance (%)',
          new.amount_minor, outstanding using errcode = 'check_violation';
      end if;
    when 'adjustment_down' then
      if new.amount_minor > outstanding then
        raise exception 'adjustment (%) would make the balance negative (outstanding %)',
          new.amount_minor, outstanding using errcode = 'check_violation';
      end if;
    when 'reversal' then
      select * into original from public.commission_transactions where id = new.reverses_id;
      if not found or original.commission_id <> new.commission_id
         or original.entry_type <> 'payment' then
        raise exception 'a reversal must reference a payment of the same receivable'
          using errcode = 'check_violation';
      end if;
      select coalesce(sum(t.amount_minor), 0) into already_reversed
      from public.commission_transactions t
      where t.reverses_id = original.id;
      if new.amount_minor > original.amount_minor - already_reversed then
        raise exception 'reversal exceeds the unreversed part of the payment'
          using errcode = 'check_violation';
      end if;
    else
      null;
  end case;
  return new;
end;
$$;

create trigger commission_transactions_before
  before insert on public.commission_transactions
  for each row execute function private.commission_ledger_before();

-- The balances on `commissions` are caches rebuilt from the ledger.
create function private.commission_ledger_after()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  paid numeric;
  written_off numeric;
  adjustment numeric;
  due numeric;
  outstanding numeric;
begin
  select
    coalesce(sum(amount_minor) filter (where entry_type = 'payment'), 0)
      - coalesce(sum(amount_minor) filter (where entry_type = 'reversal'), 0),
    coalesce(sum(amount_minor) filter (where entry_type = 'write_off'), 0),
    coalesce(sum(amount_minor) filter (where entry_type = 'adjustment_up'), 0)
      - coalesce(sum(amount_minor) filter (where entry_type = 'adjustment_down'), 0)
  into paid, written_off, adjustment
  from public.commission_transactions
  where commission_id = new.commission_id;

  select agreed_amount_minor + adjustment into due
  from public.commissions where id = new.commission_id;
  outstanding := due - paid - written_off;

  update public.commissions
  set amount_paid_minor = paid,
      written_off_minor = written_off,
      adjustment_minor = adjustment,
      payment_status = (case
        when outstanding = 0 and written_off > 0 then 'waived'
        when outstanding = 0 then 'paid'
        when paid > 0 then 'partial'
        else 'pending'
      end)::public.commission_payment_status
  where id = new.commission_id;
  return new;
end;
$$;

create trigger commission_transactions_after
  after insert on public.commission_transactions
  for each row execute function private.commission_ledger_after();

-- Agent payouts ---------------------------------------------------------------------------------------
create table public.agent_payouts (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.rental_deals (id) on delete restrict,
  agent_id uuid not null references public.profiles (id) on delete restrict,
  amount_minor numeric(18, 0) not null check (amount_minor > 0),
  currency public.currency_code not null,
  status public.payout_status not null default 'pending_approval',
  requested_by uuid not null references public.profiles (id) on delete restrict,
  approved_by uuid references public.profiles (id) on delete restrict,
  approved_at timestamptz,
  paid_on date,
  paid_by uuid references public.profiles (id) on delete restrict,
  payment_method public.payment_method,
  payment_reference text check (length(payment_reference) <= 120),
  reason text check (length(reason) <= 500),
  notes text check (length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_payouts_paid_has_details check (
    status <> 'paid' or (paid_on is not null and payment_method is not null
      and length(btrim(coalesce(payment_reference, ''))) > 0)
  )
);
create index agent_payouts_deal_idx on public.agent_payouts (deal_id);
create index agent_payouts_agent_idx on public.agent_payouts (agent_id, status);

create trigger agent_payouts_set_updated_at
  before update on public.agent_payouts
  for each row execute function private.set_updated_at();

-- How much of the agent's share may be paid out so far, under the agency's
-- configured rule (finance_settings.payout_eligibility_rule):
--   on_collected: the share, in proportion to the part of the expected
--                 commission that has actually been collected;
--   on_earned:    the whole share as soon as the commission is earned.
create function private.agent_eligible_minor(deal uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d public.rental_deals;
  rule public.payout_eligibility_rule;
  collected numeric;
begin
  select * into d from public.rental_deals where id = deal;
  if not found or d.stage not in ('closed_won', 'lease_expired')
     or d.agent_share_expected_minor is null or d.agent_share_expected_minor = 0
     or coalesce(d.commission_expected_minor, 0) = 0 then
    return 0;
  end if;

  select payout_eligibility_rule into rule from public.finance_settings;
  if rule = 'on_earned' then
    return d.agent_share_expected_minor;
  end if;

  select coalesce(sum(amount_paid_minor), 0) into collected
  from public.commissions where deal_id = deal;
  return floor(
    d.agent_share_expected_minor * least(collected, d.commission_expected_minor)
    / d.commission_expected_minor);
end;
$$;

create function private.agent_payout_before()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_role public.staff_role := private.auth_role();
  d public.rental_deals;
  open_total numeric;
  eligible numeric;
begin
  select * into d from public.rental_deals where id = new.deal_id for update;
  if not found then
    raise exception 'deal not found' using errcode = 'no_data_found';
  end if;

  if tg_op = 'INSERT' then
    if d.stage not in ('closed_won', 'lease_expired') then
      raise exception 'payouts can only be requested for a closed-won deal'
        using errcode = 'check_violation';
    end if;
    new.agent_id := d.agent_id;
    new.currency := d.currency;
    new.status := 'pending_approval';
    new.requested_by := coalesce(actor, new.requested_by);
    new.approved_by := null;
    new.approved_at := null;
    new.paid_on := null;
    new.paid_by := null;
    new.payment_method := null;
    new.payment_reference := null;

    eligible := private.agent_eligible_minor(new.deal_id);
    select coalesce(sum(amount_minor), 0) into open_total
    from public.agent_payouts
    where deal_id = new.deal_id and status in ('pending_approval', 'approved', 'paid');
    if new.amount_minor > eligible - open_total then
      raise exception 'payout (%) exceeds the amount still eligible (%)',
        new.amount_minor, eligible - open_total using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- UPDATE: amounts and parties never change; only the workflow moves.
  if new.deal_id is distinct from old.deal_id
     or new.agent_id is distinct from old.agent_id
     or new.amount_minor is distinct from old.amount_minor
     or new.currency is distinct from old.currency
     or new.requested_by is distinct from old.requested_by then
    raise exception 'a payout''s amount and parties cannot be changed'
      using errcode = 'check_violation';
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  -- A caller with no role (service key, migrations) is trusted by the key.
  if actor is not null and actor_role is null then
    raise exception 'no active staff profile' using errcode = 'insufficient_privilege';
  end if;

  case
    when old.status = 'pending_approval' and new.status = 'approved' then
      if actor is not null then
        if actor_role not in ('super_admin', 'manager') then
          raise exception 'only a manager can approve a payout' using errcode = 'insufficient_privilege';
        end if;
        -- Four eyes: nobody approves their own request (a sole super admin may).
        if actor = old.requested_by and actor_role <> 'super_admin' then
          raise exception 'a payout cannot be approved by the person who requested it'
            using errcode = 'insufficient_privilege';
        end if;
      end if;
      select coalesce(sum(amount_minor), 0) into open_total
      from public.agent_payouts
      where deal_id = old.deal_id and id <> old.id and status in ('pending_approval', 'approved', 'paid');
      if old.amount_minor > private.agent_eligible_minor(old.deal_id) - open_total then
        raise exception 'payout exceeds the amount now eligible' using errcode = 'check_violation';
      end if;
      new.approved_by := actor;
      new.approved_at := now();

    when old.status = 'pending_approval' and new.status = 'rejected' then
      if actor is not null and actor_role not in ('super_admin', 'manager') then
        raise exception 'only a manager can reject a payout' using errcode = 'insufficient_privilege';
      end if;
      if length(btrim(coalesce(new.reason, ''))) = 0 then
        raise exception 'a reason is required' using errcode = 'check_violation';
      end if;
      new.approved_by := actor;
      new.approved_at := now();

    when old.status in ('pending_approval', 'approved') and new.status = 'cancelled' then
      if actor is not null and actor_role not in ('super_admin', 'manager')
         and actor is distinct from old.requested_by then
        raise exception 'not allowed to cancel this payout' using errcode = 'insufficient_privilege';
      end if;
      if length(btrim(coalesce(new.reason, ''))) = 0 then
        raise exception 'a reason is required' using errcode = 'check_violation';
      end if;

    when old.status = 'approved' and new.status = 'paid' then
      if actor is not null and actor_role not in ('super_admin', 'finance') then
        raise exception 'only finance can record a payout as paid' using errcode = 'insufficient_privilege';
      end if;
      if new.paid_on is null or new.payment_method is null
         or length(btrim(coalesce(new.payment_reference, ''))) = 0 then
        raise exception 'payment date, method and reference are required'
          using errcode = 'check_violation';
      end if;
      if new.paid_on > (now() at time zone 'Asia/Phnom_Penh')::date then
        raise exception 'a payout cannot be dated in the future' using errcode = 'check_violation';
      end if;
      new.paid_by := actor;

    when old.status = 'paid' and new.status = 'reversed' then
      if actor is not null and actor_role not in ('super_admin', 'finance') then
        raise exception 'only finance can reverse a payout' using errcode = 'insufficient_privilege';
      end if;
      if length(btrim(coalesce(new.reason, ''))) = 0 then
        raise exception 'a reason is required' using errcode = 'check_violation';
      end if;

    else
      raise exception 'a payout cannot move from % to %', old.status, new.status
        using errcode = 'check_violation';
  end case;
  return new;
end;
$$;

create trigger agent_payouts_before
  before insert or update on public.agent_payouts
  for each row execute function private.agent_payout_before();

-- Expenses ------------------------------------------------------------------------------------------------
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  category public.expense_category not null,
  description text not null check (length(btrim(description)) between 1 and 500),
  amount_minor numeric(18, 0) not null check (amount_minor > 0),
  currency public.currency_code not null default 'USD',
  payment_method public.payment_method,
  vendor text check (length(vendor) <= 200),
  receipt_path text,
  paid_on date,
  status public.expense_status not null default 'pending',
  created_by uuid not null references public.profiles (id) on delete restrict,
  approved_by uuid references public.profiles (id) on delete restrict,
  approved_at timestamptz,
  rejection_reason text check (length(rejection_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_paid_after_approval check (paid_on is null or status = 'approved')
);
create index expenses_date_idx on public.expenses (expense_date);
create index expenses_status_idx on public.expenses (status);

create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function private.set_updated_at();

create function private.expense_before()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_role public.staff_role := private.auth_role();
  today date := (now() at time zone 'Asia/Phnom_Penh')::date;
begin
  if tg_op = 'INSERT' then
    if new.expense_date > today then
      raise exception 'an expense cannot be dated in the future' using errcode = 'check_violation';
    end if;
    new.created_by := coalesce(actor, new.created_by);
    -- Seed/service inserts may carry a status; people always start at pending.
    if actor is not null then
      new.status := 'pending';
      new.approved_by := null;
      new.approved_at := null;
      new.paid_on := null;
    end if;
    return new;
  end if;

  if new.created_by is distinct from old.created_by then
    raise exception 'created_by cannot be changed' using errcode = 'insufficient_privilege';
  end if;

  -- Once decided, the record of what was approved does not change.
  if old.status <> 'pending' and (
       new.expense_date is distinct from old.expense_date
       or new.category is distinct from old.category
       or new.amount_minor is distinct from old.amount_minor
       or new.currency is distinct from old.currency
       or new.description is distinct from old.description
     ) then
    raise exception 'a decided expense cannot be edited' using errcode = 'check_violation';
  end if;

  if new.status is distinct from old.status then
    if old.status <> 'pending' then
      raise exception 'an expense that has been decided cannot be decided again'
        using errcode = 'check_violation';
    end if;
    if actor is not null then
      if actor_role not in ('super_admin', 'manager') then
        raise exception 'only a manager can approve or reject expenses'
          using errcode = 'insufficient_privilege';
      end if;
      if actor = old.created_by and actor_role <> 'super_admin' then
        raise exception 'an expense cannot be approved by the person who created it'
          using errcode = 'insufficient_privilege';
      end if;
    end if;
    if new.status = 'rejected' and length(btrim(coalesce(new.rejection_reason, ''))) = 0 then
      raise exception 'a reason is required' using errcode = 'check_violation';
    end if;
    new.approved_by := actor;
    new.approved_at := now();
  else
    -- approval fields are only ever set by the transition above
    new.approved_by := old.approved_by;
    new.approved_at := old.approved_at;
  end if;

  if new.paid_on is not null and new.paid_on > today then
    raise exception 'an expense cannot be paid in the future' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger expenses_before
  before insert or update on public.expenses
  for each row execute function private.expense_before();

-- Audit trail -------------------------------------------------------------------------------------------------
create table public.financial_audit_log (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_id uuid references public.profiles (id) on delete restrict,
  actor_role public.staff_role,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  deal_id uuid,
  reason text,
  old_data jsonb,
  new_data jsonb
);
create index financial_audit_log_time_idx on public.financial_audit_log (occurred_at desc);
create index financial_audit_log_entity_idx on public.financial_audit_log (entity_type, entity_id);
create index financial_audit_log_deal_idx on public.financial_audit_log (deal_id);

create trigger financial_audit_log_append_only
  before update or delete on public.financial_audit_log
  for each row execute function private.forbid_change();

-- Writes who did what, when, to which record, and the stated reason (taken
-- from the row's own reason column, named by the trigger argument).
create function private.audit_financial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_json jsonb := to_jsonb(new);
  old_json jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
begin
  if tg_op = 'UPDATE'
     and (new_json - 'updated_at') = (old_json - 'updated_at') then
    return new;
  end if;

  insert into public.financial_audit_log
    (actor_id, actor_role, action, entity_type, entity_id, deal_id, reason, old_data, new_data)
  values (
    (select auth.uid()),
    private.auth_role(),
    lower(tg_op),
    tg_table_name,
    (new_json ->> 'id')::uuid,
    case
      when tg_table_name = 'rental_deals' then (new_json ->> 'id')::uuid
      when new_json ? 'deal_id' then nullif(new_json ->> 'deal_id', '')::uuid
      when new_json ? 'commission_id' then (
        select c.deal_id from public.commissions c
        where c.id = (new_json ->> 'commission_id')::uuid)
    end,
    nullif(new_json ->> tg_argv[0], ''),
    old_json,
    new_json
  );
  return new;
end;
$$;

create trigger rental_deals_audit
  after insert or update on public.rental_deals
  for each row execute function private.audit_financial('status_reason');
create trigger commissions_audit
  after insert or update on public.commissions
  for each row execute function private.audit_financial('notes');
create trigger commission_transactions_audit
  after insert on public.commission_transactions
  for each row execute function private.audit_financial('reason');
create trigger agent_payouts_audit
  after insert or update on public.agent_payouts
  for each row execute function private.audit_financial('reason');
create trigger expenses_audit
  after insert or update on public.expenses
  for each row execute function private.audit_financial('rejection_reason');
create trigger finance_settings_audit
  after update on public.finance_settings
  for each row execute function private.audit_financial('reason');
