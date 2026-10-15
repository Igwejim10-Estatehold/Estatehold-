-- Estatehold V2.1 starter schema.
-- Run once in the Supabase SQL Editor for the project connected to this app.
-- Demo listings below are explicitly unverified sample data.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'client' check (role in ('client', 'landlord', 'agent', 'attorney', 'admin')),
  full_name text not null default '',
  email text not null default '',
  phone text not null default '',
  agency_name text,
  agent_bio text,
  nba_seal_number text,
  country text not null default 'Nigeria',
  state text not null default '',
  lga text not null default '',
  town text not null default '',
  village_of_origin text not null default '',
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  bank_name text,
  bank_account_last4 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attorneys (
  id uuid primary key references public.profiles(id) on delete cascade,
  nba_seal_number text not null,
  verification_status text not null default 'pending' check (verification_status in ('pending', 'verified', 'rejected')),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete set null,
  title text not null,
  category text not null check (category in ('land', 'home', 'warehouse', 'complex', 'shopping_mall', 'hotel', 'short_let', 'school', 'hospital', 'filling_station', 'multipurpose_hall', 'custom')),
  custom_type text,
  state text not null,
  lga text not null default '',
  town text not null,
  address text not null default '',
  description text not null default '',
  price_naira bigint not null check (price_naira >= 0),
  price_unit text not null default 'total',
  intent text not null check (intent in ('sale', 'rent', 'social')),
  bedrooms integer not null default 0 check (bedrooms >= 0),
  bathrooms integer not null default 0 check (bathrooms >= 0),
  size_sqm integer not null default 0 check (size_sqm >= 0),
  gps_lat double precision not null,
  gps_lng double precision not null,
  image_url text,
  pin_status text not null default 'pending' check (pin_status in ('verified', 'pending', 'dispute', 'tenant_protected')),
  is_managed boolean not null default false,
  is_exclusive boolean not null default true,
  is_locked boolean not null default false,
  is_active boolean not null default true,
  listing_moderation_status text not null default 'approved'
    check (listing_moderation_status in ('pending', 'approved', 'rejected')),
  premises_rules_url text,
  hotel_cac_number text,
  emergency_contact_phone text,
  hotel_has_24_hour_reception boolean not null default false,
  hotel_cctv_common_areas boolean not null default false,
  hotel_cctv_disclosed boolean not null default false,
  hotel_safety_checkin_available boolean not null default false,
  hotel_verification_status text not null default 'not_applicable'
    check (hotel_verification_status in ('not_applicable', 'pending', 'verified', 'rejected')),
  hotel_verification_reviewed_at timestamptz,
  hotel_verification_reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint custom_category_requires_type check (category <> 'custom' or nullif(trim(custom_type), '') is not null),
  constraint accommodation_cac_number_required check (
    category not in ('hotel', 'short_let') or nullif(trim(hotel_cac_number), '') is not null
  ),
  constraint accommodation_emergency_contact_required check (
    category not in ('hotel', 'short_let') or nullif(trim(emergency_contact_phone), '') is not null
  ),
  constraint accommodation_cctv_disclosure_required check (
    category not in ('hotel', 'short_let') or not hotel_cctv_common_areas or hotel_cctv_disclosed
  )
);

create table if not exists public.social_housing_units (
  id uuid primary key default gen_random_uuid(),
  parent_property_id uuid not null references public.properties(id) on delete restrict,
  unit_type text not null,
  unit_price_naira bigint not null check (unit_price_naira > 0),
  status text not null default 'available' check (status in ('available', 'reserved', 'sold')),
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  unique (parent_property_id, unit_type)
);

create table if not exists public.special_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  request_type text not null check (request_type in ('custom_category', 'location_sourcing')),
  custom_category text,
  desired_town text not null,
  desired_lga text not null,
  desired_state text not null,
  neighborhood text not null default '',
  budget_naira bigint not null check (budget_naira > 0),
  urgency text not null default 'standard' check (urgency in ('standard', 'urgent')),
  gps_lat double precision,
  gps_lng double precision,
  status text not null default 'open' check (status in ('open', 'assigned', 'sourced', 'closed')),
  created_at timestamptz not null default now(),
  constraint custom_request_requires_category check (request_type <> 'custom_category' or nullif(trim(custom_category), '') is not null)
);

create table if not exists public.complaints (
  id uuid primary key default gen_random_uuid(),
  complainant_id uuid not null references public.profiles(id) on delete cascade,
  against_id uuid references public.profiles(id) on delete set null,
  against_role text not null check (against_role in ('landlord', 'agent', 'tenant', 'attorney')),
  property_id uuid references public.properties(id) on delete set null,
  complaint_type text not null check (complaint_type in ('harassment', 'agent_misconduct', 'breach_of_rules', 'service_failure')),
  description text not null,
  evidence_urls text[] not null default '{}',
  status text not null default 'lodged' check (status in ('lodged', 'investigating', 'resolved')),
  admin_resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kyc_submissions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('landlord', 'agent', 'attorney')),
  evidence_urls text[] not null default '{}',
  agency_name text,
  bio text,
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  reviewer_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete restrict,
  social_housing_unit_id uuid references public.social_housing_units(id) on delete restrict,
  buyer_id uuid not null references public.profiles(id) on delete restrict,
  payment_mode text not null check (payment_mode in ('full', 'installments', 'daily', 'weekly', 'monthly')),
  installment_count integer not null default 1 check (installment_count between 1 and 4),
  base_amount_naira bigint not null check (base_amount_naira > 0),
  buyer_total_naira bigint not null check (buyer_total_naira > 0),
  landlord_fee_naira bigint not null default 0,
  agent_fee_naira bigint not null default 0,
  platform_fee_naira bigint not null default 0,
  landlord_payout_naira bigint not null default 0,
  status text not null default 'pending' check (status in ('pending', 'paid', 'completed', 'cancelled')),
  paystack_reference text unique,
  checkout_url text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.escrow_holds (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique references public.transactions(id) on delete restrict,
  held_amount_naira bigint not null check (held_amount_naira >= 0),
  landlord_payout_naira bigint not null check (landlord_payout_naira >= 0),
  is_released boolean not null default false,
  release_condition text not null default 'execution, documentation and handover complete; client confirmation and compliance approval required',
  created_at timestamptz not null default now(),
  released_at timestamptz
);

create table if not exists public.sales_installments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  installment_no integer not null check (installment_no between 1 and 4),
  due_date date not null,
  amount_naira bigint not null check (amount_naira > 0),
  status text not null default 'scheduled' check (status in ('scheduled', 'paid', 'overdue')),
  paystack_reference text unique,
  checkout_url text,
  paid_at timestamptz,
  unique (transaction_id, installment_no)
);

create table if not exists public.rent_subscriptions (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique references public.transactions(id) on delete cascade,
  payment_frequency text not null check (payment_frequency in ('daily', 'weekly', 'monthly')),
  platform_fee_percent numeric(5,2) not null default 3.00,
  status text not null default 'pending' check (status in ('pending', 'active', 'paused', 'ended')),
  paystack_subscription_code text,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_delisting_queue (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete restrict,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.dispatch_queue (
  id uuid primary key default gen_random_uuid(),
  special_request_id uuid not null unique references public.special_requests(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'assigned', 'completed')),
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.enqueue_special_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.dispatch_queue (special_request_id)
  values (new.id)
  on conflict (special_request_id) do nothing;
  return new;
end;
$$;

drop trigger if exists special_request_admin_notification on public.special_requests;
create trigger special_request_admin_notification
after insert on public.special_requests
for each row execute function public.enqueue_special_request();

create table if not exists public.legal_docs (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references public.properties(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  doc_type text not null check (doc_type in ('landlord_poa', 'tenant_poa', 'tenancy_agreement', 'recovery')),
  status text not null default 'draft' check (status in ('draft', 'pending_review', 'signed', 'void')),
  document jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now()
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'estatehold-evidence',
  'estatehold-evidence',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'estatehold-listings',
  'estatehold-listings',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

drop policy if exists "Public can view listing documents" on storage.objects;
create policy "Public can view listing documents"
on storage.objects for select to anon, authenticated
using (bucket_id = 'estatehold-listings');

drop policy if exists "Users upload their own listing documents" on storage.objects;
create policy "Users upload their own listing documents"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'estatehold-listings'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users delete their own listing documents" on storage.objects;
create policy "Users delete their own listing documents"
on storage.objects for delete to authenticated
using (
  bucket_id = 'estatehold-listings'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users upload their own complaint evidence" on storage.objects;
create policy "Users upload their own complaint evidence"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'estatehold-evidence'
  and (storage.foldername(name))[1] = auth.uid()::text
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('estatehold-kyc', 'estatehold-kyc', false, 10485760, array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 10485760;

drop policy if exists "Applicants upload their own KYC documents" on storage.objects;
create policy "Applicants upload their own KYC documents"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'estatehold-kyc'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Applicants and admins view KYC documents" on storage.objects;
create policy "Applicants and admins view KYC documents"
on storage.objects for select to authenticated
using (
  bucket_id = 'estatehold-kyc'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  )
);

drop policy if exists "Users view their own complaint evidence" on storage.objects;
create policy "Users view their own complaint evidence"
on storage.objects for select to authenticated
using (
  bucket_id = 'estatehold-evidence'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users delete their own complaint evidence" on storage.objects;
create policy "Users delete their own complaint evidence"
on storage.objects for delete to authenticated
using (
  bucket_id = 'estatehold-evidence'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create index if not exists properties_browse_idx on public.properties (is_active, is_exclusive, state, town, category, intent);
create index if not exists special_requests_client_idx on public.special_requests (client_id, created_at desc);
create index if not exists complaints_complainant_idx on public.complaints (complainant_id, created_at desc);
create index if not exists transactions_buyer_idx on public.transactions (buyer_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.attorneys enable row level security;
alter table public.properties enable row level security;
alter table public.social_housing_units enable row level security;
alter table public.special_requests enable row level security;
alter table public.complaints enable row level security;
alter table public.kyc_submissions enable row level security;
alter table public.transactions enable row level security;
alter table public.escrow_holds enable row level security;
alter table public.sales_installments enable row level security;
alter table public.rent_subscriptions enable row level security;
alter table public.admin_delisting_queue enable row level security;
alter table public.dispatch_queue enable row level security;
alter table public.legal_docs enable row level security;

drop policy if exists "Profiles are readable by owner" on public.profiles;
create policy "Profiles are readable by owner" on public.profiles for select to authenticated using (auth.uid() = id);
drop policy if exists "Profiles are editable by owner" on public.profiles;
create policy "Profiles are editable by owner" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id and role <> 'admin');

drop policy if exists "Public can browse active exclusive listings" on public.properties;
create policy "Public can browse active exclusive listings" on public.properties for select to anon, authenticated using (is_active and is_exclusive);

drop policy if exists "Public can browse available social housing units" on public.social_housing_units;
create policy "Public can browse available social housing units" on public.social_housing_units for select to anon, authenticated using (
  status = 'available' and exists (
    select 1 from public.properties p where p.id = parent_property_id and p.is_active and p.is_exclusive
  )
);

drop policy if exists "Users can read own special requests" on public.special_requests;
create policy "Users can read own special requests" on public.special_requests for select to authenticated using (auth.uid() = client_id);
drop policy if exists "Users can create own special requests" on public.special_requests;
create policy "Users can create own special requests" on public.special_requests for insert to authenticated with check (auth.uid() = client_id);

drop policy if exists "Users can read own complaints" on public.complaints;
create policy "Users can read own complaints" on public.complaints for select to authenticated using (auth.uid() = complainant_id);
drop policy if exists "Users can lodge own complaints" on public.complaints;
create policy "Users can lodge own complaints" on public.complaints for insert to authenticated with check (auth.uid() = complainant_id);

-- All payment, legal, KYC review, delisting, and administrative mutations are server-only.
-- The server verifies Supabase Auth tokens and uses the service-role key without exposing it.

insert into public.properties (
  title, category, state, lga, town, address, description, price_naira, price_unit, intent,
  bedrooms, bathrooms, size_sqm, gps_lat, gps_lng, pin_status, is_exclusive, is_locked, is_active
) values
  ('Serene Estate Enugu', 'home', 'Enugu', 'Enugu North', 'Emene', 'Emene, Enugu',
   'Demo listing for a family home in a growing Enugu neighborhood. Ask for verification documents before making a commitment.',
   45000000, 'total', 'sale', 4, 3, 320, 6.4740, 7.5600, 'pending', true, false, true),
  ('Aguani Land', 'land', 'Enugu', 'Uzo-Uwani', 'Aguani', 'Aguani, Uzo-Uwani LGA',
   'Demo land listing, 1,200 square metres. Boundaries and title are not verified in this sample record.',
   8500000, 'total', 'sale', 0, 0, 1200, 6.6810, 7.3650, 'pending', true, false, true)
on conflict do nothing;

insert into public.social_housing_units (parent_property_id, unit_type, unit_price_naira, status)
select id, 'shop unit', 2500000, 'available'
from public.properties
where title = 'Serene Estate Enugu'
limit 1
on conflict (parent_property_id, unit_type) do nothing;

create or replace function public.create_estatehold_transaction(
  p_property_id uuid,
  p_buyer_id uuid,
  p_payment_mode text,
  p_installment_count integer default 1,
  p_social_housing_unit_id uuid default null
)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  property_row public.properties%rowtype;
  social_unit_row public.social_housing_units%rowtype;
  owner_role text;
  is_social_unit boolean := false;
  base_amount bigint;
  buyer_total bigint;
  landlord_fee bigint := 0;
  agent_fee bigint := 0;
  platform_fee bigint := 0;
  landlord_payout bigint := 0;
  installment_total bigint;
  created_transaction public.transactions%rowtype;
  i integer;
begin
  update public.transactions
  set status = 'cancelled'
  where status = 'pending' and created_at < now() - interval '24 hours';
  update public.properties
  set is_locked = false, updated_at = now()
  where is_locked = true and id in (
    select property_id from public.transactions
    where status = 'cancelled' and social_housing_unit_id is null
      and created_at < now() - interval '24 hours'
  );
  update public.social_housing_units
  set is_locked = false, status = 'available'
  where is_locked = true and id in (
    select social_housing_unit_id from public.transactions
    where status = 'cancelled' and social_housing_unit_id is not null
      and created_at < now() - interval '24 hours'
  );

  if p_payment_mode not in ('full', 'installments', 'daily', 'weekly', 'monthly') then
    raise exception 'Unsupported payment mode';
  end if;
  if p_payment_mode = 'installments' and (p_installment_count < 2 or p_installment_count > 4) then
    raise exception 'Installment count must be between 2 and 4';
  end if;
  if p_payment_mode <> 'installments' and p_installment_count <> 1 then
    raise exception 'Installment count must be 1 unless installments are selected';
  end if;

  select * into property_row
  from public.properties
  where id = p_property_id and is_active = true and is_exclusive = true
  for update;

  if not found then
    raise exception 'Property is unavailable';
  end if;
  if property_row.is_locked then
    raise exception 'Property is locked by an active transaction';
  end if;
  if property_row.pin_status <> 'verified' then
    raise exception 'Property verification is required before transactions';
  end if;
  if property_row.intent = 'rent' and nullif(property_row.premises_rules_url, '') is null then
    raise exception 'Premises rules are required before rent transactions';
  end if;

  base_amount := property_row.price_naira;
  buyer_total := base_amount;
  landlord_payout := base_amount;
  if p_social_housing_unit_id is not null then
    select * into social_unit_row
    from public.social_housing_units
    where id = p_social_housing_unit_id
      and parent_property_id = p_property_id
      and status = 'available'
      and is_locked = false
    for update;
    if not found then
      raise exception 'Social housing unit is unavailable';
    end if;
    is_social_unit := true;
    base_amount := social_unit_row.unit_price_naira;
    buyer_total := base_amount;
    landlord_payout := base_amount;
  end if;
  select role into owner_role from public.profiles where id = property_row.owner_id;

  if is_social_unit or property_row.intent = 'social' then
    platform_fee := round(base_amount * 0.05);
    buyer_total := base_amount + platform_fee;
  elsif property_row.intent = 'rent' then
    landlord_fee := round(base_amount * 0.05);
    platform_fee := landlord_fee + round(base_amount * 0.05);
    buyer_total := base_amount + round(base_amount * 0.05);
    landlord_payout := base_amount - landlord_fee;
    if p_payment_mode in ('daily', 'weekly', 'monthly') then
      platform_fee := landlord_fee + round(base_amount * 0.03);
      buyer_total := base_amount + round(base_amount * 0.03);
    end if;
  elsif property_row.is_managed then
    landlord_fee := round(base_amount * 0.10);
    platform_fee := landlord_fee;
    landlord_payout := base_amount - landlord_fee;
  elsif owner_role = 'landlord' then
    landlord_fee := round(base_amount * 0.10);
    platform_fee := landlord_fee + round(base_amount * 0.05);
    buyer_total := base_amount + round(base_amount * 0.05);
    landlord_payout := base_amount - landlord_fee;
  else
    agent_fee := round(base_amount * 0.10);
    platform_fee := round(base_amount * 0.05);
    buyer_total := base_amount + agent_fee + platform_fee;
  end if;

  insert into public.transactions (
    property_id, social_housing_unit_id, buyer_id, payment_mode, installment_count, base_amount_naira, buyer_total_naira,
    landlord_fee_naira, agent_fee_naira, platform_fee_naira, landlord_payout_naira, status
  ) values (
    p_property_id, p_social_housing_unit_id, p_buyer_id, p_payment_mode,
    case when p_payment_mode = 'installments' then p_installment_count else 1 end,
    base_amount, buyer_total, landlord_fee, agent_fee, platform_fee, landlord_payout, 'pending'
  ) returning * into created_transaction;

  insert into public.escrow_holds (transaction_id, held_amount_naira, landlord_payout_naira)
  values (created_transaction.id, buyer_total, landlord_payout);

  if is_social_unit then
    update public.social_housing_units
    set is_locked = true, status = 'reserved'
    where id = p_social_housing_unit_id;
  else
    update public.properties set is_locked = true, updated_at = now() where id = p_property_id;
  end if;

  if p_payment_mode = 'installments' then
    for i in 1..p_installment_count loop
      installment_total := buyer_total / p_installment_count;
      if i = p_installment_count then
        installment_total := buyer_total - (buyer_total / p_installment_count) * (p_installment_count - 1);
      end if;
      insert into public.sales_installments (transaction_id, installment_no, due_date, amount_naira)
      values (
        created_transaction.id,
        i,
        current_date + make_interval(months => ((i - 1) * 12 / (p_installment_count - 1))),
        installment_total
      );
    end loop;
  elsif p_payment_mode in ('daily', 'weekly', 'monthly') then
    insert into public.rent_subscriptions (transaction_id, payment_frequency, platform_fee_percent)
    values (created_transaction.id, p_payment_mode, 3.00);
  end if;

  return created_transaction;
end;
$$;

revoke all on function public.create_estatehold_transaction(uuid, uuid, text, integer, uuid) from public, anon, authenticated;
grant execute on function public.create_estatehold_transaction(uuid, uuid, text, integer, uuid) to service_role;