-- DEVELOPMENT SEED DATA. NEVER RUN AGAINST A REAL PROJECT.
--
-- Loaded only by `supabase db reset` on a local stack (wired through
-- [db.seed] in supabase/config.toml). `supabase db push` never runs it, and
-- it refuses to run if the database already contains any auth user, so it
-- cannot create the known-password accounts below in a populated project.
--
-- Everything here is fictional and labelled "DEV SEED"; it exists so the CRM
-- has something to show while developing. It is not part of the product.

do $$
begin
  if exists (select 1 from auth.users) then
    raise exception 'Refusing to load development seed: auth.users is not empty.';
  end if;
end;
$$;

-- Staff: one account per role. Password for all: Dev-password-12345
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
select
  '00000000-0000-0000-0000-000000000000', s.id, 'authenticated', 'authenticated',
  s.email, crypt('Dev-password-12345', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', '', '', '', '', ''
from (values
  ('10000000-0000-0000-0000-000000000001'::uuid, 'dev-admin@camrent.test'),
  ('10000000-0000-0000-0000-000000000002'::uuid, 'dev-manager@camrent.test'),
  ('10000000-0000-0000-0000-000000000003'::uuid, 'dev-agent1@camrent.test'),
  ('10000000-0000-0000-0000-000000000004'::uuid, 'dev-agent2@camrent.test'),
  ('10000000-0000-0000-0000-000000000005'::uuid, 'dev-marketing@camrent.test'),
  ('10000000-0000-0000-0000-000000000006'::uuid, 'dev-finance@camrent.test')
) as s(id, email);

insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), u.id, u.id::text, 'email',
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  now(), now(), now()
from auth.users u;

insert into public.profiles (id, full_name, role, preferred_language) values
  ('10000000-0000-0000-0000-000000000001', 'DEV SEED Super Admin', 'super_admin', 'en'),
  ('10000000-0000-0000-0000-000000000002', 'DEV SEED Manager', 'manager', 'en'),
  ('10000000-0000-0000-0000-000000000003', 'DEV SEED Agent One', 'agent', 'en'),
  ('10000000-0000-0000-0000-000000000004', 'DEV SEED Agent Two', 'agent', 'km'),
  ('10000000-0000-0000-0000-000000000005', 'DEV SEED Marketing', 'marketing', 'en'),
  ('10000000-0000-0000-0000-000000000006', 'DEV SEED Finance', 'finance', 'en');

insert into public.landlords (id, full_name, phone, preferred_language, verification_status, created_by) values
  ('20000000-0000-0000-0000-000000000001', 'DEV SEED Landlord A', '+855000000001', 'km', 'verified',
   '10000000-0000-0000-0000-000000000003'),
  ('20000000-0000-0000-0000-000000000002', 'DEV SEED Landlord B', '+855000000002', 'en', 'pending',
   '10000000-0000-0000-0000-000000000004');

insert into public.properties (
  id, listing_code, category, property_type, district, neighborhood,
  monthly_rent_minor, bedrooms, bathrooms, floor_area, furnishing_status,
  availability_status, publication_status, assigned_agent_id, created_by
) values
  ('30000000-0000-0000-0000-000000000001', 'DEV-0001', 'residential', 'apartment',
   'Chamkar Mon', 'BKK1', 90000, 2, 2, 85, 'fully_furnished', 'available', 'published',
   '10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003'),
  ('30000000-0000-0000-0000-000000000002', 'DEV-0002', 'commercial', 'office',
   'Daun Penh', null, 250000, null, 1, 140, 'unfurnished', 'available', 'draft',
   '10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000004'),
  ('30000000-0000-0000-0000-000000000003', 'DEV-0003', 'residential', 'villa',
   'Tuol Kork', null, 220000, 4, 4, 320, 'partially_furnished', 'rented', 'published',
   '10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000004');

insert into public.property_translations (property_id, locale, title, description) values
  ('30000000-0000-0000-0000-000000000001', 'en', 'DEV SEED two-bedroom apartment', 'Fictional listing for development.'),
  ('30000000-0000-0000-0000-000000000002', 'en', 'DEV SEED office (draft)', 'Fictional unpublished listing.');

insert into public.property_ownership (property_id, landlord_id, authorization_status, authorization_start) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'active', current_date),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'pending', null);

insert into public.leads (id, customer_name, email, preferred_language, source, property_id, assigned_agent_id, stage) values
  ('40000000-0000-0000-0000-000000000001', 'DEV SEED Customer One', 'customer1@example.test', 'en',
   'website_form', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'viewing_scheduled'),
  ('40000000-0000-0000-0000-000000000002', 'DEV SEED Customer Two', 'customer2@example.test', 'zh',
   'referral', null, '10000000-0000-0000-0000-000000000004', 'new');

insert into public.lead_activities (lead_id, performed_by, activity_type, notes) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'call', 'Dev seed note.');

insert into public.viewing_appointments (lead_id, property_id, agent_id, scheduled_at) values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000003', '2030-01-15 09:00:00+07');

insert into public.tasks (title, assigned_to, created_by, lead_id) values
  ('DEV SEED follow up', '10000000-0000-0000-0000-000000000003',
   '10000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001');

-- More published listings so search, filters and pagination can be developed.
insert into public.properties (
  id, listing_code, category, property_type, district, neighborhood,
  monthly_rent_minor, currency, bedrooms, bathrooms, floor_area, furnishing_status,
  availability_status, available_from, publication_status, assigned_agent_id, created_by, created_at
)
select
  ('30000000-0000-0000-0000-0000000001' || lpad(n::text, 2, '0'))::uuid,
  'DEV-1' || lpad(n::text, 3, '0'),
  case when n % 4 = 0 then 'commercial'::public.property_category else 'residential'::public.property_category end,
  (case n % 4
     when 0 then 'office'
     when 1 then 'apartment'
     when 2 then 'condo'
     else 'house' end)::public.property_type,
  (array['Chamkar Mon', 'Daun Penh', 'Toul Kork', '7 Makara', 'Sen Sok'])[1 + n % 5],
  (array['BKK1', 'Wat Phnom', 'Boeung Kak', 'Tonle Bassac', 'Phnom Penh Thmey'])[1 + n % 5],
  (40000 + n * 7500),
  'USD',
  case when n % 4 = 0 then null else 1 + n % 4 end,
  1 + n % 3,
  45 + n * 6,
  (array['unfurnished', 'partially_furnished', 'fully_furnished'])[1 + n % 3]::public.furnishing_status,
  case when n % 5 = 0 then 'available_from'::public.availability_status else 'available'::public.availability_status end,
  case when n % 5 = 0 then date '2030-03-01' end,
  'published',
  '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000003',
  now() - make_interval(days => n)
from generate_series(1, 14) as n;

insert into public.property_translations (property_id, locale, title, description, amenities)
select p.id, 'en', 'DEV SEED listing ' || p.listing_code,
       'Fictional development listing. Not a real property.',
       case when p.property_type = 'apartment' then array['Gym', 'Pool', 'Security'] else '{}' end
from public.properties p
where p.listing_code like 'DEV-1%';

-- CRM sample data (fictional): leads at different stages, follow-ups,
-- viewings today and later, a deal with commission. Dates are relative to the
-- time the seed runs, so the dashboard always has something to show.
insert into public.leads (id, customer_name, email, phone, source, stage, assigned_agent_id,
                          property_id, next_follow_up_at, created_at, enquiry_message, lost_reason)
values
  ('40000000-0000-0000-0000-000000000011', 'DEV SEED Lead Unassigned', 'unassigned@example.test', null,
   'website_form', 'new', null, '30000000-0000-0000-0000-000000000101', null, now() - interval '20 minutes',
   'Is this still available?', null),
  ('40000000-0000-0000-0000-000000000012', 'DEV SEED Lead Overdue', null, '+855000000012',
   'phone', 'contacted', '10000000-0000-0000-0000-000000000003', null, now() - interval '2 days',
   now() - interval '6 days', null, null),
  ('40000000-0000-0000-0000-000000000013', 'DEV SEED Lead Negotiating', 'negotiating@example.test', null,
   'referral', 'negotiation', '10000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000102',
   now() + interval '1 day', now() - interval '12 days', null, null),
  ('40000000-0000-0000-0000-000000000014', 'DEV SEED Lead Won', 'won@example.test', null,
   'walk_in', 'won', '10000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001',
   null, now() - interval '30 days', null, null),
  ('40000000-0000-0000-0000-000000000015', 'DEV SEED Lead Lost', 'lost@example.test', null,
   'social_media', 'lost', '10000000-0000-0000-0000-000000000004', null, null, now() - interval '9 days',
   null, 'Budget too low'),
  ('40000000-0000-0000-0000-000000000016', 'DEV SEED Lead On Hold', 'hold@example.test', null,
   'other', 'on_hold', '10000000-0000-0000-0000-000000000003', null, null, now() - interval '4 days',
   null, 'Travelling until next month');

insert into public.viewing_appointments (lead_id, property_id, agent_id, scheduled_at, status) values
  ('40000000-0000-0000-0000-000000000012', '30000000-0000-0000-0000-000000000101',
   '10000000-0000-0000-0000-000000000003', now() + interval '1 hour', 'scheduled'),
  ('40000000-0000-0000-0000-000000000013', '30000000-0000-0000-0000-000000000102',
   '10000000-0000-0000-0000-000000000004', now() + interval '3 days', 'confirmed');

-- Deals use the Step 5 columns: the arrangement is stored on each deal.
insert into public.rental_deals (
  id, lead_id, property_id, agent_id, landlord_id, agreed_monthly_rent_minor, currency,
  lease_start, lease_end, deposit_minor, advance_rent_minor, stage, closing_date,
  agreement_reference, commission_method, commission_rate,
  agent_share_method, agent_share_rate, notes
) values
  ('50000000-0000-0000-0000-000000000011', '40000000-0000-0000-0000-000000000013',
   '30000000-0000-0000-0000-000000000102', '10000000-0000-0000-0000-000000000004', null, 62500, 'USD',
   null, null, null, null, 'negotiation', null, null, null, null, 'none', null,
   'DEV SEED: still negotiating'),
  ('50000000-0000-0000-0000-000000000012', '40000000-0000-0000-0000-000000000014',
   '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003',
   '20000000-0000-0000-0000-000000000001', 90000, 'USD',
   current_date, (current_date + interval '1 year' - interval '1 day')::date, 90000, 90000,
   'closed_won', current_date, 'DEV-AGR-0001', 'percent_of_monthly_rent', 100,
   'percent_of_commission', 40, 'DEV SEED: fictional signed deal');

insert into public.commissions (id, deal_id, fee_payer, calculation_type, agreed_amount_minor,
                                due_date, invoiced_on)
values ('60000000-0000-0000-0000-000000000011', '50000000-0000-0000-0000-000000000012',
        'landlord', 'fixed_amount', 90000, current_date + 14, current_date);

insert into public.commission_transactions
  (commission_id, entry_type, amount_minor, currency, occurred_on, payment_method, reference, recorded_by)
values ('60000000-0000-0000-0000-000000000011', 'payment', 30000, 'USD', current_date, 'bank_transfer',
        'DEV-REF-001', '10000000-0000-0000-0000-000000000006');

insert into public.agent_payouts (deal_id, amount_minor, currency, agent_id, requested_by, notes)
values ('50000000-0000-0000-0000-000000000012', 10000, 'USD',
        '10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000006',
        'DEV SEED: partial payout awaiting approval');

insert into public.expenses (expense_date, category, description, amount_minor, currency, vendor,
                             status, created_by)
values
  (current_date - 3, 'advertising', 'DEV SEED: social media boost', 2500, 'USD', 'Example Ads',
   'pending', '10000000-0000-0000-0000-000000000006'),
  (current_date - 6, 'transportation', 'DEV SEED: fuel for viewings', 1800, 'USD', null,
   'pending', '10000000-0000-0000-0000-000000000006');
