-- Payout account numbers and resolved account names are encrypted by the API
-- with AES-256-GCM before they are written to this table.
create table if not exists public.payout_destinations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encrypted_payload text not null,
  iv text not null,
  auth_tag text not null,
  encryption_version integer not null default 1 check (encryption_version = 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payout_destinations enable row level security;
revoke all on public.payout_destinations from anon, authenticated;
grant all on public.payout_destinations to service_role;

-- These legacy masked profile fields are intentionally retained for data
-- preservation, but the API no longer reads or writes them for payout details.
