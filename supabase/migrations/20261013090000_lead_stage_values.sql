-- 0007: extra lead statuses for the CRM pipeline (Step 4).
--
-- Pipeline: new -> contacted -> viewing_scheduled -> negotiation -> reserved -> won.
-- Side statuses: lost, unresponsive, on_hold, cancelled.
-- `qualified` and `viewed` from migration 0001 stay in the enum (existing rows
-- may use them) but are not offered in the CRM.
--
-- New enum values cannot be used in the transaction that adds them, so this
-- migration contains nothing else.
alter type public.lead_stage add value if not exists 'reserved';
alter type public.lead_stage add value if not exists 'unresponsive';
alter type public.lead_stage add value if not exists 'on_hold';
alter type public.lead_stage add value if not exists 'cancelled';
