-- Record the two escrow-release approvals explicitly; the release-condition text
-- on escrow_holds is informational and is not a substitute for these fields.
alter table public.escrow_holds
  add column if not exists client_confirmed_at timestamptz,
  add column if not exists client_confirmed_by uuid references public.profiles(id) on delete restrict,
  add column if not exists compliance_approved_at timestamptz,
  add column if not exists compliance_approved_by uuid references public.profiles(id) on delete restrict,
  add column if not exists released_by uuid references public.profiles(id) on delete restrict;

-- Existing payout destinations were written only after Paystack resolved the
-- account successfully. Preserve that verified state for accounts saved before
-- this column was introduced.
alter table public.payout_destinations
  add column if not exists verified_at timestamptz;
update public.payout_destinations
set verified_at = updated_at
where verified_at is null;

create table if not exists public.agent_commission_payouts (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique references public.transactions(id) on delete restrict,
  agent_id uuid not null references public.profiles(id) on delete restrict,
  amount_naira bigint not null check (amount_naira > 0),
  status text not null default 'initiating'
    check (status in ('initiating', 'pending', 'success', 'failed', 'reversed', 'reconciliation_required')),
  approved_by uuid not null references public.profiles(id) on delete restrict,
  approved_at timestamptz not null default now(),
  recipient_code text,
  recipient_bank_name text,
  recipient_account_last4 text check (
    recipient_account_last4 is null or recipient_account_last4 ~ '^[0-9]{4}$'
  ),
  transfer_reference text not null unique,
  transfer_code text,
  provider_status text,
  failure_message text,
  provider_response jsonb,
  attempt_started_at timestamptz not null default now(),
  last_reconciled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_commission_payouts_status_created_idx
  on public.agent_commission_payouts (status, created_at desc);

alter table public.agent_commission_payouts enable row level security;
revoke all on public.agent_commission_payouts from anon, authenticated;
grant all on public.agent_commission_payouts to service_role;

create or replace function public.confirm_estatehold_escrow(
  p_transaction_id uuid,
  p_buyer_id uuid
)
returns public.escrow_holds
language plpgsql
security definer
set search_path = public
as $$
declare
  transaction_row public.transactions%rowtype;
  hold_row public.escrow_holds%rowtype;
begin
  select * into transaction_row
  from public.transactions
  where id = p_transaction_id
  for update;
  if not found or transaction_row.buyer_id <> p_buyer_id then
    raise exception 'Transaction not found for this buyer';
  end if;
  if transaction_row.status not in ('paid', 'completed') then
    raise exception 'Transaction funds are not fully paid';
  end if;
  if exists (
    select 1 from public.sales_installments
    where transaction_id = p_transaction_id and status <> 'paid'
  ) then
    raise exception 'All installments must be paid';
  end if;

  update public.escrow_holds
  set client_confirmed_at = coalesce(client_confirmed_at, now()),
      client_confirmed_by = coalesce(client_confirmed_by, p_buyer_id)
  where transaction_id = p_transaction_id and is_released = false
  returning * into hold_row;
  if not found then
    raise exception 'Escrow hold is unavailable or already released';
  end if;
  return hold_row;
end;
$$;

create or replace function public.release_estatehold_escrow(
  p_transaction_id uuid,
  p_admin_id uuid
)
returns public.escrow_holds
language plpgsql
security definer
set search_path = public
as $$
declare
  transaction_row public.transactions%rowtype;
  hold_row public.escrow_holds%rowtype;
begin
  select * into transaction_row
  from public.transactions
  where id = p_transaction_id
  for update;
  if not found or transaction_row.status not in ('paid', 'completed') then
    raise exception 'Transaction funds are not fully paid';
  end if;
  if exists (
    select 1 from public.sales_installments
    where transaction_id = p_transaction_id and status <> 'paid'
  ) then
    raise exception 'All installments must be paid';
  end if;

  update public.escrow_holds
  set is_released = true,
      released_at = coalesce(released_at, now()),
      released_by = p_admin_id
  where transaction_id = p_transaction_id
    and is_released = false
    and client_confirmed_at is not null
    and compliance_approved_at is not null
    and client_confirmed_by = transaction_row.buyer_id
    and compliance_approved_by is not null
  returning * into hold_row;
  if not found then
    raise exception 'Client confirmation and compliance approval are required before release';
  end if;
  return hold_row;
end;
$$;

create or replace function public.claim_agent_commission_payout(
  p_transaction_id uuid,
  p_admin_id uuid,
  p_transfer_reference text
)
returns table (payout_id uuid, agent_id uuid, is_new boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  transaction_row public.transactions%rowtype;
  property_row public.properties%rowtype;
  agent_row public.profiles%rowtype;
  hold_row public.escrow_holds%rowtype;
  inserted_id uuid;
  existing_id uuid;
  existing_agent_id uuid;
begin
  select * into transaction_row
  from public.transactions
  where id = p_transaction_id
  for update;
  if not found or transaction_row.status not in ('paid', 'completed') then
    raise exception 'Transaction funds are not fully paid';
  end if;
  if exists (
    select 1 from public.sales_installments
    where transaction_id = p_transaction_id and status <> 'paid'
  ) then
    raise exception 'All installments must be paid';
  end if;
  select * into hold_row
  from public.escrow_holds
  where transaction_id = p_transaction_id
  for update;
  if not found or not hold_row.is_released then
    raise exception 'Escrow must be released before commission payout';
  end if;

  select * into property_row
  from public.properties
  where id = transaction_row.property_id;
  select * into agent_row
  from public.profiles
  where id = property_row.owner_id and role = 'agent' and verification_status = 'verified';
  if not found then
    raise exception 'A verified listing agent is required';
  end if;
  if transaction_row.agent_fee_naira <= 0 then
    raise exception 'This transaction has no agent commission';
  end if;

  insert into public.agent_commission_payouts (
    transaction_id, agent_id, amount_naira, status, approved_by,
    recipient_code, transfer_reference
  ) values (
    p_transaction_id, agent_row.id, transaction_row.agent_fee_naira, 'initiating',
    p_admin_id, null, p_transfer_reference
  )
  on conflict (transaction_id) do nothing
  returning id into inserted_id;

  if inserted_id is not null then
    return query select inserted_id, agent_row.id, true;
  else
    select id, agent_id into existing_id, existing_agent_id
    from public.agent_commission_payouts
    where transaction_id = p_transaction_id;
    return query select existing_id, existing_agent_id, false;
  end if;
end;
$$;

revoke all on function public.confirm_estatehold_escrow(uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_estatehold_escrow(uuid, uuid) from public, anon, authenticated;
revoke all on function public.claim_agent_commission_payout(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.confirm_estatehold_escrow(uuid, uuid) to service_role;
grant execute on function public.release_estatehold_escrow(uuid, uuid) to service_role;
grant execute on function public.claim_agent_commission_payout(uuid, uuid, text) to service_role;
