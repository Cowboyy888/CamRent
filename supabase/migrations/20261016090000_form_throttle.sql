-- Per-client throttle for the public forms. The existing per-phone/email limit
-- can be sidestepped by rotating contact details, so the server also counts
-- attempts per hashed client address. Only hashes are stored, never addresses,
-- and rows older than a day are deleted by the app on each attempt.
create table public.form_attempts (
  id bigint generated always as identity primary key,
  client_hash text not null check (length(client_hash) = 64),
  kind text not null check (kind in ('enquiry', 'landlord')),
  created_at timestamptz not null default now()
);

create index form_attempts_lookup_idx on public.form_attempts (client_hash, kind, created_at desc);
create index form_attempts_created_idx on public.form_attempts (created_at);

alter table public.form_attempts enable row level security;
revoke all on public.form_attempts from public, anon, authenticated;
grant select, insert, delete on public.form_attempts to service_role;
