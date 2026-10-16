-- Permit versioned payout encryption keys while preserving legacy v1 records.
alter table public.payout_destinations
  drop constraint if exists payout_destinations_encryption_version_check;

alter table public.payout_destinations
  add constraint payout_destinations_encryption_version_check
  check (encryption_version >= 1);

alter table public.payout_destinations
  alter column encryption_version set default 2;
