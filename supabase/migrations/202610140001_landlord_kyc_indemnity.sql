-- Landlord KYC. The full NIN is stored only as authenticated ciphertext.
-- Apply in the Supabase SQL Editor after the main Estatehold schema.
create table if not exists public.landlord_kyc (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  nin_number_encrypted text not null,
  nin_iv text not null,
  nin_auth_tag text not null,
  nin_last4 text not null check (nin_last4 ~ '^[0-9]{4}$'),
  nin_verified boolean not null default false,
  nin_name text not null,
  property_address text not null,
  property_doc_url text not null,
  affidavit_url text,
  indemnity_signed boolean not null default false,
  indemnity_text_version text,
  ip_address inet,
  signed_at timestamptz,
  review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'rejected')),
  admin_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint landlord_kyc_signed_timestamp_consistent
    check ((indemnity_signed and signed_at is not null) or (not indemnity_signed and signed_at is null))
);

create index if not exists landlord_kyc_review_queue_idx
  on public.landlord_kyc (review_status, created_at);

alter table public.landlord_kyc enable row level security;
revoke all on public.landlord_kyc from anon, authenticated;
grant all on public.landlord_kyc to service_role;
