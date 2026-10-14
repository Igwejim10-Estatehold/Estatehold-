create table if not exists public.property_photos (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  photo_url text not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  taken_at timestamptz not null,
  taken_by uuid not null references public.profiles(id) on delete restrict,
  device text not null check (char_length(device) between 1 and 200),
  created_at timestamptz not null default now()
);

create index if not exists property_photos_property_taken_idx
  on public.property_photos (property_id, taken_at desc);

alter table public.property_photos enable row level security;
revoke all on public.property_photos from anon, authenticated;
grant all on public.property_photos to service_role;
