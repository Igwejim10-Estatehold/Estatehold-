create table if not exists public.executive_access_audit (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  target_profile_id uuid not null references public.profiles(id) on delete restrict,
  previous_role text not null,
  new_role text not null,
  changed_at timestamptz not null default now(),
  request_ip inet
);

create index if not exists executive_access_audit_changed_idx
  on public.executive_access_audit (changed_at desc);
create index if not exists executive_access_audit_target_changed_idx
  on public.executive_access_audit (target_profile_id, changed_at desc);

alter table public.executive_access_audit enable row level security;
revoke all privileges on table public.executive_access_audit from public, anon, authenticated, service_role;
grant select on table public.executive_access_audit to service_role;

create table if not exists public.profile_roles (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role = 'executive'),
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (profile_id, role)
);

alter table public.profile_roles enable row level security;
revoke all privileges on table public.profile_roles from public, anon, authenticated;
grant select, insert, update, delete on table public.profile_roles to service_role;

create or replace function public.change_executive_access(
  p_actor_profile_id uuid,
  p_target_profile_id uuid,
  p_grant_access boolean,
  p_request_ip text
)
returns table (
  profile_id uuid,
  previous_role text,
  new_role text,
  changed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_role text;
  v_target_role text;
  v_previous_role text;
  v_new_role text;
  v_changed boolean := false;
  v_has_executive_role boolean;
begin
  select p.role into v_actor_role
  from public.profiles p
  where p.id = p_actor_profile_id;

  if v_actor_role is distinct from 'owner' then
    raise exception 'Only an owner may change executive access';
  end if;

  select p.role into v_target_role
  from public.profiles p
  where p.id = p_target_profile_id
  for update;

  if not found then
    raise exception 'Target profile does not exist';
  end if;

  if v_target_role = 'owner' then
    select exists (
      select 1
      from public.profile_roles pr
      where pr.profile_id = p_target_profile_id
        and pr.role = 'executive'
    ) into v_has_executive_role;

    v_previous_role := case when v_has_executive_role then 'executive' else 'owner' end;
    v_new_role := case when p_grant_access then 'executive' else 'owner' end;
    v_changed := v_has_executive_role is distinct from p_grant_access;

    if v_changed and p_grant_access then
      insert into public.profile_roles (profile_id, role, assigned_by)
      values (p_target_profile_id, 'executive', p_actor_profile_id)
      on conflict (profile_id, role) do nothing;
    elsif v_changed then
      delete from public.profile_roles
      where profile_id = p_target_profile_id and role = 'executive';
    end if;
  else
    if v_target_role = 'admin' then
      raise exception 'Administrator roles cannot be changed through executive assignment';
    end if;

    v_previous_role := v_target_role;
    if p_grant_access then
      v_new_role := 'executive';
      v_changed := v_target_role is distinct from 'executive';
      if v_changed then
        update public.profiles
        set role = 'executive', is_executive = true
        where id = p_target_profile_id;
      end if;
    else
      v_new_role := 'client';
      v_changed := v_target_role = 'executive';
      if v_changed then
        update public.profiles
        set role = 'client', is_executive = false
        where id = p_target_profile_id;
      else
        v_new_role := v_target_role;
      end if;
    end if;
  end if;

  if v_changed then
    insert into public.executive_access_audit (
      actor_profile_id,
      target_profile_id,
      previous_role,
      new_role,
      request_ip
    ) values (
      p_actor_profile_id,
      p_target_profile_id,
      v_previous_role,
      v_new_role,
      case when nullif(btrim(p_request_ip), '') is null
        then null
        else btrim(p_request_ip)::inet
      end
    );
  end if;

  return query select p_target_profile_id, v_previous_role, v_new_role, v_changed;
end;
$$;

revoke all privileges on function public.change_executive_access(uuid, uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.change_executive_access(uuid, uuid, boolean, text)
  to service_role;
