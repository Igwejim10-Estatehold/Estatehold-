-- Estatehold KYC and review workflow. Sensitive identifiers remain encrypted
-- with the API's PAYOUT_ENCRYPTION_KEY_V2; documents stay in private storage.
alter table public.profiles
  add column if not exists full_legal_name text,
  add column if not exists permanent_house_address text,
  add column if not exists city text,
  add column if not exists whatsapp_number text,
  add column if not exists nin_number_encrypted text,
  add column if not exists nin_iv text,
  add column if not exists nin_auth_tag text,
  add column if not exists nin_last4 text,
  add column if not exists nin_verified boolean not null default false;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('client','tenant','landlord','agent','attorney','admin','executive','owner'));

alter table public.payout_destinations
  add column if not exists full_legal_name text,
  add column if not exists permanent_house_address text,
  add column if not exists phone_number text,
  add column if not exists whatsapp_number text,
  add column if not exists bank_name text,
  add column if not exists account_number_encrypted text,
  add column if not exists account_number_iv text,
  add column if not exists account_number_auth_tag text,
  add column if not exists account_name text,
  add column if not exists bvn_or_nin_encrypted text,
  add column if not exists bvn_or_nin_iv text,
  add column if not exists bvn_or_nin_auth_tag text,
  add column if not exists nin_last4 text,
  add column if not exists means_of_id_url text,
  add column if not exists property_documents_urls text[] not null default '{}',
  add column if not exists passport_photo_url text,
  add column if not exists is_verified boolean not null default false,
  add column if not exists verified_by uuid references public.profiles(id),
  add column if not exists verified_at timestamptz,
  add column if not exists review_status text not null default 'pending'
    check (review_status in ('pending','approved','rejected')),
  add column if not exists rejection_reason text;

create table if not exists public.tenant_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  full_legal_name text not null,
  permanent_house_address text not null,
  city text not null,
  state text not null,
  lga text not null,
  phone_number text not null,
  whatsapp_number text not null,
  employer_name text,
  employer_address text,
  next_of_kin_name text not null,
  next_of_kin_phone text not null,
  next_of_kin_address text not null,
  guarantor_name text not null,
  guarantor_phone text not null,
  guarantor_address text not null,
  nin_number_encrypted text not null,
  nin_iv text not null,
  nin_auth_tag text not null,
  nin_last4 text not null check (nin_last4 ~ '^[0-9]{4}$'),
  nin_document_url text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  rejection_reason text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.properties
  add column if not exists landlord_kyc_verified boolean not null default false,
  add column if not exists admin_approved boolean not null default false,
  add column if not exists executive_approved boolean not null default false,
  add column if not exists approval_status text not null default 'pending'
    check (approval_status in ('pending','admin_approved','approved','rejected')),
  add column if not exists property_documents_urls text[] not null default '{}',
  add column if not exists property_video_url text;

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  reason text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_logs_created_idx on public.admin_audit_logs(created_at desc);

create table if not exists public.estatehold_system_settings (
  setting_key text primary key,
  setting_value jsonb not null,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

alter table public.tenant_applications enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.estatehold_system_settings enable row level security;
revoke all on public.tenant_applications, public.admin_audit_logs, public.estatehold_system_settings from anon, authenticated;
grant all on public.tenant_applications, public.admin_audit_logs, public.estatehold_system_settings to service_role;
revoke all on public.payout_destinations from anon, authenticated;
grant all on public.payout_destinations to service_role;

drop policy if exists "Applicants and admins view KYC documents" on storage.objects;
create policy "Applicants and admins view KYC documents"
on storage.objects for select to authenticated
using (
  bucket_id = 'estatehold-kyc'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','executive'))
  )
);

