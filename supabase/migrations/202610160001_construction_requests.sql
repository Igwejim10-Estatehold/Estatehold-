-- Private, authenticated construction intake and admin queue.
create table if not exists public.construction_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  full_name text not null,
  phone text not null,
  land_location text not null,
  land_size text not null,
  budget text not null,
  project_type text not null,
  description text not null default '',
  preferred_visit_date date,
  document_path text,
  status text not null default 'pending'
    check (status in ('pending', 'contacted', 'in_progress', 'completed', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists construction_requests_owner_created_idx
  on public.construction_requests (requester_id, created_at desc);
create index if not exists construction_requests_status_created_idx
  on public.construction_requests (status, created_at desc);

alter table public.construction_requests enable row level security;
drop policy if exists "Owners and admins can view construction requests" on public.construction_requests;
create policy "Owners and admins can view construction requests"
  on public.construction_requests for select to authenticated
  using (
    requester_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
drop policy if exists "Authenticated users can submit construction requests" on public.construction_requests;
create policy "Authenticated users can submit construction requests"
  on public.construction_requests for insert to authenticated
  with check (requester_id = auth.uid());
drop policy if exists "Admins can update construction requests" on public.construction_requests;
create policy "Admins can update construction requests"
  on public.construction_requests for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'estatehold-construction-documents',
  'estatehold-construction-documents',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update set public = false, file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png'];

drop policy if exists "Construction owners upload private land documents" on storage.objects;
create policy "Construction owners upload private land documents"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'estatehold-construction-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (storage.foldername(name))[2] = 'construction-requests'
    and exists (
      select 1 from public.construction_requests r
      where r.id::text = (storage.foldername(name))[3]
        and r.requester_id = auth.uid()
    )
  );
drop policy if exists "Owners and admins read private land documents" on storage.objects;
create policy "Owners and admins read private land documents"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'estatehold-construction-documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    )
  );
