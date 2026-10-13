-- 0011: access rules, balance views, reports and storage for finance (Step 5).
--
-- Who may do what (details in docs/finance.md):
--   super_admin  everything
--   finance      receivables and payments, payouts (create, mark paid),
--                expenses (create), reports, audit log
--   manager      deals, approves payouts and expenses, reads financial records
--   agent        own deals; own commission rows and payouts (read only)
--   marketing    nothing

-- Helpers ------------------------------------------------------------------------------
create function private.can_read_deal(did uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.rental_deals d
    where d.id = did
      and (
        private.has_role('super_admin', 'manager', 'finance')
        or (private.has_role('agent') and d.agent_id = (select auth.uid()))
      )
  )
$$;

create function private.can_read_commission(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.commissions c
    where c.id = cid and private.can_read_deal(c.deal_id)
  )
$$;

-- Finance and managers need the customer's, landlord's and agent's *names* on
-- a deal without being able to read the lead or landlord records themselves.
create function private.deal_lead_name(did uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select l.customer_name
  from public.rental_deals d
  join public.leads l on l.id = d.lead_id
  where d.id = did and private.can_read_deal(did)
$$;

create function private.deal_landlord_name(did uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(ll.business_name, ll.full_name)
  from public.rental_deals d
  join public.landlords ll on ll.id = d.landlord_id
  where d.id = did and private.can_read_deal(did)
$$;

create function private.uuid_from_path(object_name text, segment integer)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when (storage.foldername(object_name))[segment]
         ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then ((storage.foldername(object_name))[segment])::uuid
  end
$$;

-- Deals: new statuses in the policies -----------------------------------------------------
drop policy rental_deals_update on public.rental_deals;
create policy rental_deals_update on public.rental_deals
  for update to authenticated
  using (
    (select private.has_role('super_admin', 'manager'))
    or (
      (select private.has_role('agent'))
      and agent_id = (select auth.uid())
      and stage in ('negotiation', 'reserved', 'agreement_pending')
    )
  )
  with check (
    (select private.has_role('super_admin', 'manager'))
    or (
      (select private.has_role('agent'))
      and agent_id = (select auth.uid())
      and stage in ('negotiation', 'reserved', 'agreement_pending', 'closed_lost')
    )
  );

-- Commissions (receivables): money moves only through the ledger ----------------------------
revoke update on public.commissions from authenticated;
grant update (agreed_amount_minor, due_date, invoiced_on, notes) on public.commissions to authenticated;

drop policy commissions_update on public.commissions;
create policy commissions_update on public.commissions
  for update to authenticated
  using ((select private.has_role('super_admin', 'finance')))
  with check ((select private.has_role('super_admin', 'finance')));

-- New tables -----------------------------------------------------------------------------------
alter table public.finance_settings enable row level security;
alter table public.commission_transactions enable row level security;
alter table public.agent_payouts enable row level security;
alter table public.expenses enable row level security;
alter table public.deal_documents enable row level security;
alter table public.financial_audit_log enable row level security;

revoke all on
  public.finance_settings, public.commission_transactions, public.agent_payouts,
  public.expenses, public.deal_documents, public.financial_audit_log
  from anon, authenticated;

grant select on public.finance_settings to authenticated;
grant update (
  commission_earned_rule, payout_eligibility_rule,
  default_commission_method, default_commission_rate, default_commission_fixed_minor,
  default_agent_share_method, default_agent_share_rate, default_agent_share_fixed_minor,
  updated_by
) on public.finance_settings to authenticated;

grant select, insert on public.commission_transactions to authenticated;
grant select, insert on public.agent_payouts to authenticated;
grant update (status, reason, notes, paid_on, payment_method, payment_reference)
  on public.agent_payouts to authenticated;
grant select, insert on public.expenses to authenticated;
grant update (
  expense_date, category, description, amount_minor, currency, payment_method,
  vendor, receipt_path, paid_on, status, rejection_reason
) on public.expenses to authenticated;
grant select, insert on public.deal_documents to authenticated;
grant select on public.financial_audit_log to authenticated;

create policy finance_settings_select on public.finance_settings
  for select to authenticated
  using ((select private.has_role('super_admin', 'manager', 'finance')));
create policy finance_settings_update on public.finance_settings
  for update to authenticated
  using ((select private.has_role('super_admin')))
  with check ((select private.has_role('super_admin')));

create policy commission_transactions_select on public.commission_transactions
  for select to authenticated
  using (private.can_read_commission(commission_id));
create policy commission_transactions_insert on public.commission_transactions
  for insert to authenticated
  with check ((select private.has_role('super_admin', 'finance')));

create policy agent_payouts_select on public.agent_payouts
  for select to authenticated
  using (
    (select private.has_role('super_admin', 'manager', 'finance'))
    or ((select private.has_role('agent')) and agent_id = (select auth.uid()))
  );
create policy agent_payouts_insert on public.agent_payouts
  for insert to authenticated
  with check ((select private.has_role('super_admin', 'manager', 'finance')));
create policy agent_payouts_update on public.agent_payouts
  for update to authenticated
  using ((select private.has_role('super_admin', 'manager', 'finance')))
  with check ((select private.has_role('super_admin', 'manager', 'finance')));

create policy expenses_select on public.expenses
  for select to authenticated
  using ((select private.has_role('super_admin', 'manager', 'finance')));
create policy expenses_insert on public.expenses
  for insert to authenticated
  with check ((select private.has_role('super_admin', 'manager', 'finance')));
create policy expenses_update on public.expenses
  for update to authenticated
  using ((select private.has_role('super_admin', 'manager', 'finance')))
  with check ((select private.has_role('super_admin', 'manager', 'finance')));

create policy deal_documents_select on public.deal_documents
  for select to authenticated
  using (private.can_read_deal(deal_id));
create policy deal_documents_insert on public.deal_documents
  for insert to authenticated
  with check (uploaded_by = (select auth.uid()) and private.can_read_deal(deal_id));

create policy financial_audit_log_select on public.financial_audit_log
  for select to authenticated
  using ((select private.has_role('super_admin', 'manager', 'finance')));

-- Balance views -----------------------------------------------------------------------------------
-- security_invoker: the caller's RLS applies, so each role sees only its rows.
create view public.commission_balances
with (security_invoker = true) as
select
  c.id as commission_id,
  c.deal_id,
  c.fee_payer as payer,
  c.currency,
  d.agent_id,
  d.lead_id,
  private.deal_lead_name(d.id) as customer_name,
  p.listing_code as property_reference,
  p.property_type,
  c.agreed_amount_minor + c.adjustment_minor as due_minor,
  c.amount_paid_minor as collected_minor,
  c.written_off_minor,
  c.agreed_amount_minor + c.adjustment_minor - c.amount_paid_minor - c.written_off_minor
    as outstanding_minor,
  c.due_date,
  c.invoiced_on,
  c.notes,
  lp.occurred_on as last_payment_on,
  lp.payment_method as last_payment_method,
  lp.reference as last_payment_reference,
  case
    when c.agreed_amount_minor + c.adjustment_minor - c.amount_paid_minor - c.written_off_minor = 0
         and c.written_off_minor > 0 then 'written_off'
    when c.agreed_amount_minor + c.adjustment_minor - c.amount_paid_minor - c.written_off_minor = 0
      then 'paid'
    when c.due_date is not null
         and c.due_date < (now() at time zone 'Asia/Phnom_Penh')::date then 'overdue'
    when c.amount_paid_minor > 0 then 'partially_paid'
    when c.due_date is not null
         and c.due_date <= (now() at time zone 'Asia/Phnom_Penh')::date then 'due'
    else 'not_due'
  end as collection_status
from public.commissions c
join public.rental_deals d on d.id = c.deal_id
left join public.properties p on p.id = d.property_id
left join lateral (
  select t.occurred_on, t.payment_method, t.reference
  from public.commission_transactions t
  where t.commission_id = c.id and t.entry_type = 'payment'
  order by t.occurred_on desc, t.created_at desc
  limit 1
) lp on true;

create view public.deal_financials
with (security_invoker = true) as
select
  d.id as deal_id,
  d.agent_id,
  d.currency,
  d.stage,
  d.closing_date,
  d.commission_expected_minor as expected_minor,
  case
    when d.stage in ('closed_won', 'lease_expired') then
      case s.commission_earned_rule
        when 'on_closed_won' then coalesce(d.commission_expected_minor, 0)
        else least(coalesce(r.collected, 0), coalesce(d.commission_expected_minor, 0))
      end
    else 0
  end as earned_minor,
  coalesce(r.invoiced, 0) as invoiced_minor,
  coalesce(r.due, 0) as receivable_minor,
  coalesce(r.collected, 0) as collected_minor,
  coalesce(r.written_off, 0) as written_off_minor,
  coalesce(r.due, 0) - coalesce(r.collected, 0) - coalesce(r.written_off, 0) as outstanding_minor,
  d.agent_share_expected_minor as agent_share_minor,
  private.agent_eligible_minor(d.id) as agent_eligible_minor,
  coalesce(pp.paid, 0) as agent_paid_minor,
  coalesce(pp.pending, 0) as agent_pending_minor,
  greatest(private.agent_eligible_minor(d.id) - coalesce(pp.paid, 0), 0) as agent_outstanding_minor
from public.rental_deals d
cross join public.finance_settings s
left join lateral (
  select
    sum(c.agreed_amount_minor + c.adjustment_minor) as due,
    sum(c.amount_paid_minor) as collected,
    sum(c.written_off_minor) as written_off,
    sum(case when c.invoiced_on is not null then c.agreed_amount_minor + c.adjustment_minor end)
      as invoiced
  from public.commissions c where c.deal_id = d.id
) r on true
left join lateral (
  select
    sum(case when a.status = 'paid' then a.amount_minor end) as paid,
    sum(case when a.status in ('pending_approval', 'approved') then a.amount_minor end) as pending
  from public.agent_payouts a where a.deal_id = d.id
) pp on true;

-- One row per deal with display names, for the deals list and detail.
create view public.deal_overview
with (security_invoker = true) as
select
  d.id,
  d.lead_id,
  d.property_id,
  d.agent_id,
  d.landlord_id,
  d.stage,
  d.currency,
  d.agreed_monthly_rent_minor,
  d.lease_start,
  d.lease_end,
  d.lease_months,
  d.deposit_minor,
  d.advance_rent_minor,
  d.closing_date,
  d.agreement_reference,
  d.commission_method,
  d.commission_expected_minor,
  d.agent_share_expected_minor,
  d.created_at,
  d.updated_at,
  private.deal_lead_name(d.id) as customer_name,
  private.deal_landlord_name(d.id) as landlord_name,
  p.listing_code as property_reference,
  p.property_type,
  n.full_name as agent_name
from public.rental_deals d
left join public.properties p on p.id = d.property_id
left join public.staff_names n on n.id = d.agent_id;

revoke all on public.commission_balances, public.deal_financials, public.deal_overview
  from anon, authenticated;
grant select on public.commission_balances, public.deal_financials, public.deal_overview
  to authenticated;

-- Dashboard summary: earned / outstanding now come from the ledger ----------------------------
create or replace function public.crm_dashboard_summary(
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
      where stage in ('closed_won', 'lease_expired')
        and closing_date >= (month_start at time zone 'Asia/Phnom_Penh')::date
        and closing_date < (month_end at time zone 'Asia/Phnom_Penh')::date),
    'commission_earned', coalesce((
      select jsonb_agg(jsonb_build_object('currency', currency, 'amount_minor', total))
      from (select currency, sum(earned_minor) as total
            from public.deal_financials group by currency) c), '[]'::jsonb),
    'commission_outstanding', coalesce((
      select jsonb_agg(jsonb_build_object('currency', currency, 'amount_minor', total))
      from (select currency, sum(outstanding_minor) as total
            from public.commission_balances group by currency) c), '[]'::jsonb)
  )
$$;

-- Finance report -------------------------------------------------------------------------------------
-- Every figure is per currency; nothing is converted or added across
-- currencies. Definitions are documented in docs/finance.md. SECURITY INVOKER:
-- a caller's report covers only what RLS lets them read.
create function public.finance_report(from_date date, to_date date)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with
  cur as (select unnest(enum_range(null::public.currency_code)) as currency),
  settings as (select commission_earned_rule from public.finance_settings),
  pay as (  -- net cash collected in the period, per receivable
    select c.deal_id, c.currency,
           sum(case t.entry_type when 'payment' then t.amount_minor
                                 when 'reversal' then -t.amount_minor end) as net
    from public.commission_transactions t
    join public.commissions c on c.id = t.commission_id
    where t.entry_type in ('payment', 'reversal')
      and t.occurred_on between from_date and to_date
    group by c.deal_id, c.currency
  ),
  deals_in_period as (
    select d.* from public.rental_deals d
    where coalesce(d.closing_date, (d.created_at at time zone 'Asia/Phnom_Penh')::date)
          between from_date and to_date
  ),
  expected as (
    select currency, sum(commission_expected_minor) as amount
    from deals_in_period
    where stage in ('negotiation', 'reserved', 'agreement_pending', 'closed_won', 'lease_expired')
    group by currency
  ),
  earned as (
    select d.currency, sum(d.commission_expected_minor) as amount
    from public.rental_deals d
    where d.stage in ('closed_won', 'lease_expired')
      and d.closing_date between from_date and to_date
      and (select commission_earned_rule from settings) = 'on_closed_won'
    group by d.currency
    union all
    select currency, sum(net)
    from pay
    where (select commission_earned_rule from settings) = 'on_collection'
    group by currency
  ),
  collected as (select currency, sum(net) as amount from pay group by currency),
  receivables as (
    select currency,
           sum(outstanding_minor) as outstanding,
           sum(outstanding_minor) filter (where collection_status = 'overdue') as overdue,
           sum(written_off_minor) as written_off
    from public.commission_balances group by currency
  ),
  payouts_paid as (
    select currency, sum(amount_minor) as amount
    from public.agent_payouts
    where status = 'paid' and paid_on between from_date and to_date
    group by currency
  ),
  payouts_open as (
    select currency, sum(agent_outstanding_minor) as amount
    from public.deal_financials group by currency
  ),
  expenses_approved as (
    select currency, sum(amount_minor) as amount
    from public.expenses
    where status = 'approved' and expense_date between from_date and to_date
    group by currency
  ),
  expenses_pending as (
    select currency, sum(amount_minor) as amount
    from public.expenses
    where status = 'pending' and expense_date between from_date and to_date
    group by currency
  ),
  expenses_paid as (
    select currency, sum(amount_minor) as amount
    from public.expenses
    where status = 'approved' and paid_on between from_date and to_date
    group by currency
  ),
  by_currency as (
    select
      cur.currency,
      coalesce(e.amount, 0) as expected_minor,
      coalesce((select sum(amount) from earned x where x.currency = cur.currency), 0) as earned_minor,
      coalesce(co.amount, 0) as collected_minor,
      coalesce(r.outstanding, 0) as outstanding_minor,
      coalesce(r.overdue, 0) as overdue_minor,
      coalesce(r.written_off, 0) as written_off_minor,
      coalesce(pp.amount, 0) as payouts_paid_minor,
      coalesce(po.amount, 0) as payouts_outstanding_minor,
      coalesce(ea.amount, 0) as expenses_approved_minor,
      coalesce(ep.amount, 0) as expenses_pending_minor,
      coalesce(co.amount, 0) as cash_in_minor,
      coalesce(pp.amount, 0) + coalesce(xp.amount, 0) as cash_out_minor,
      coalesce(co.amount, 0) - coalesce(pp.amount, 0) - coalesce(xp.amount, 0) as net_minor
    from cur
    left join expected e on e.currency = cur.currency
    left join collected co on co.currency = cur.currency
    left join receivables r on r.currency = cur.currency
    left join payouts_paid pp on pp.currency = cur.currency
    left join payouts_open po on po.currency = cur.currency
    left join expenses_approved ea on ea.currency = cur.currency
    left join expenses_pending ep on ep.currency = cur.currency
    left join expenses_paid xp on xp.currency = cur.currency
  )
  select jsonb_build_object(
    'by_currency', (select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) from by_currency b),
    'deals_by_month', (
      select coalesce(jsonb_agg(m order by m.month), '[]'::jsonb)
      from (
        select to_char(closing_date, 'YYYY-MM') as month, count(*) as deals
        from public.rental_deals
        where stage in ('closed_won', 'lease_expired')
          and closing_date between from_date and to_date
        group by 1
      ) m),
    'revenue_by_agent', (
      select coalesce(jsonb_agg(a), '[]'::jsonb)
      from (
        select d.agent_id, pay.currency, sum(pay.net) as collected_minor
        from pay join public.rental_deals d on d.id = pay.deal_id
        group by d.agent_id, pay.currency
      ) a),
    'revenue_by_property_type', (
      select coalesce(jsonb_agg(t), '[]'::jsonb)
      from (
        select p.property_type, pay.currency, sum(pay.net) as collected_minor
        from pay
        join public.rental_deals d on d.id = pay.deal_id
        left join public.properties p on p.id = d.property_id
        group by p.property_type, pay.currency
      ) t)
  )
$$;

-- Exports are themselves audited.
create function public.log_financial_export(report text, details jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.financial_audit_log (actor_id, actor_role, action, entity_type, new_data)
  select (select auth.uid()), private.auth_role(), 'export', report, details
  where private.auth_role() is not null
$$;

revoke all on function public.finance_report(date, date) from public, anon;
revoke all on function public.log_financial_export(text, jsonb) from public, anon;
grant execute on function public.finance_report(date, date) to authenticated;
grant execute on function public.log_financial_export(text, jsonb) to authenticated;

-- Private documents ------------------------------------------------------------------------------------
-- Layout inside the private-docs bucket:
--   deals/<deal_id>/<file>        agreements and supporting documents
--   expenses/<expense_id>/<file>  receipts
create policy private_docs_deal_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'private-docs'
    and (storage.foldername(name))[1] = 'deals'
    and private.can_read_deal(private.uuid_from_path(name, 2))
  );
create policy private_docs_deal_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'private-docs'
    and (storage.foldername(name))[1] = 'deals'
    and private.can_read_deal(private.uuid_from_path(name, 2))
  );

create policy private_docs_expense_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'private-docs'
    and (storage.foldername(name))[1] = 'expenses'
    and (select private.has_role('super_admin', 'manager', 'finance'))
  );
create policy private_docs_expense_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'private-docs'
    and (storage.foldername(name))[1] = 'expenses'
    and (select private.has_role('super_admin', 'manager', 'finance'))
  );
