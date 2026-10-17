alter table public.properties
  add column if not exists rental_status text not null default 'available'
    check (rental_status in ('available', 'reserved', 'rented'));

create table if not exists public.rental_payouts (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique references public.transactions(id) on delete restrict,
  landlord_id uuid not null references public.profiles(id) on delete restrict,
  amount_naira bigint not null check (amount_naira > 0),
  status text not null default 'awaiting_destination'
    check (status in ('awaiting_destination', 'initiating', 'pending', 'success', 'failed', 'reconciliation_required')),
  transfer_reference text not null unique,
  recipient_code text,
  transfer_code text,
  provider_status text,
  failure_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rental_payouts_status_created_idx
  on public.rental_payouts (status, created_at desc);

alter table public.rental_payouts enable row level security;
revoke all on public.rental_payouts from anon, authenticated;
grant all on public.rental_payouts to service_role;

create or replace function public.complete_rental_payment(
  p_transaction_id uuid,
  p_reference text,
  p_transfer_reference text
)
returns table (payout_id uuid, landlord_id uuid, amount_naira bigint, is_new boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  transaction_row public.transactions%rowtype;
  property_row public.properties%rowtype;
  payout_row public.rental_payouts%rowtype;
  inserted_id uuid;
begin
  select * into transaction_row
  from public.transactions
  where id = p_transaction_id
  for update;
  if not found or transaction_row.paystack_reference <> p_reference
     or transaction_row.status not in ('pending', 'paid')
     or transaction_row.payment_mode <> 'full'
     or transaction_row.installment_count <> 1 then
    raise exception 'The verified rent payment does not match an active full-rent transaction';
  end if;

  select * into property_row
  from public.properties
  where id = transaction_row.property_id
  for update;
  if not found or property_row.intent <> 'rent' or property_row.owner_id is null then
    raise exception 'A landlord-owned rental listing is required';
  end if;

  update public.transactions
  set status = 'paid', paid_at = coalesce(paid_at, now())
  where id = transaction_row.id;

  update public.properties
  set rental_status = 'rented', is_active = false, is_locked = false, updated_at = now()
  where id = property_row.id;

  update public.escrow_holds
  set is_released = true, released_at = coalesce(released_at, now())
  where transaction_id = transaction_row.id and is_released = false;

  insert into public.rental_payouts (
    transaction_id, landlord_id, amount_naira, status, transfer_reference
  ) values (
    transaction_row.id, property_row.owner_id, transaction_row.landlord_payout_naira,
    'awaiting_destination', p_transfer_reference
  )
  on conflict (transaction_id) do nothing
  returning id into inserted_id;

  select * into payout_row from public.rental_payouts
  where transaction_id = transaction_row.id;
  return query select payout_row.id, payout_row.landlord_id, payout_row.amount_naira,
    inserted_id is not null;
end;
$$;

revoke all on function public.complete_rental_payment(uuid, text, text) from public, anon, authenticated;
grant execute on function public.complete_rental_payment(uuid, text, text) to service_role;
