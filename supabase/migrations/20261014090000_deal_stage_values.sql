-- 0009: deal statuses and fee payers for rental deals and finance (Step 5).
--
-- New deal statuses: agreement_pending, closed_won, closed_lost, cancelled,
-- lease_expired. The older lease_signed / commission_invoiced /
-- commission_collected / lost values stay in the enum (they cannot be removed)
-- and existing rows are migrated in 0010; they are no longer used.
--
-- New enum values cannot be used in the transaction that adds them.
alter type public.deal_stage add value if not exists 'agreement_pending';
alter type public.deal_stage add value if not exists 'closed_won';
alter type public.deal_stage add value if not exists 'closed_lost';
alter type public.deal_stage add value if not exists 'cancelled';
alter type public.deal_stage add value if not exists 'lease_expired';

alter type public.fee_payer add value if not exists 'other';
