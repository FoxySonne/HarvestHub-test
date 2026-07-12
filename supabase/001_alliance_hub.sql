-- HarvestHub: первая версия общей базы участников союза.
-- Запусти этот файл целиком в Supabase → SQL Editor → New query.

create extension if not exists pgcrypto;

create table if not exists public.alliances (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  state_number text not null default '',
  invite_code text not null unique default upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8)),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.alliance_members (
  alliance_id uuid not null references public.alliances(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner', 'editor', 'viewer')),
  joined_at timestamptz not null default now(),
  primary key (alliance_id, user_id)
);

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  alliance_id uuid not null references public.alliances(id) on delete cascade,
  nickname text not null check (char_length(trim(nickname)) between 1 and 80),
  rank_name text not null default '',
  squad_power bigint not null default 0 check (squad_power >= 0),
  status text not null default 'active' check (status in ('active', 'reserve', 'inactive')),
  comment text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (alliance_id, nickname)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists alliances_set_updated_at on public.alliances;
create trigger alliances_set_updated_at
before update on public.alliances
for each row execute function public.set_updated_at();

drop trigger if exists participants_set_updated_at on public.participants;
create trigger participants_set_updated_at
before update on public.participants
for each row execute function public.set_updated_at();

create or replace function public.is_alliance_member(target_alliance_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.alliance_members
    where alliance_id = target_alliance_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.get_alliance_role(target_alliance_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.alliance_members
  where alliance_id = target_alliance_id
    and user_id = auth.uid()
  limit 1;
$$;

create or replace function public.add_alliance_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.alliance_members (alliance_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict (alliance_id, user_id) do update set role = 'owner';

  return new;
end;
$$;

drop trigger if exists alliances_add_owner on public.alliances;
create trigger alliances_add_owner
after insert on public.alliances
for each row execute function public.add_alliance_owner();

create or replace function public.join_alliance_by_code(join_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Требуется авторизация';
  end if;

  select id into target_id
  from public.alliances
  where invite_code = upper(trim(join_code))
  limit 1;

  if target_id is null then
    raise exception 'Союз с таким кодом не найден';
  end if;

  insert into public.alliance_members (alliance_id, user_id, role)
  values (target_id, auth.uid(), 'editor')
  on conflict (alliance_id, user_id) do nothing;

  return target_id;
end;
$$;

alter table public.alliances enable row level security;
alter table public.alliance_members enable row level security;
alter table public.participants enable row level security;

drop policy if exists "alliances_select_members" on public.alliances;
create policy "alliances_select_members"
on public.alliances for select
to authenticated
using (public.is_alliance_member(id));

drop policy if exists "alliances_insert_creator" on public.alliances;
create policy "alliances_insert_creator"
on public.alliances for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists "alliances_update_owner" on public.alliances;
create policy "alliances_update_owner"
on public.alliances for update
to authenticated
using (public.get_alliance_role(id) = 'owner')
with check (public.get_alliance_role(id) = 'owner');

drop policy if exists "alliances_delete_owner" on public.alliances;
create policy "alliances_delete_owner"
on public.alliances for delete
to authenticated
using (public.get_alliance_role(id) = 'owner');

drop policy if exists "members_select_members" on public.alliance_members;
create policy "members_select_members"
on public.alliance_members for select
to authenticated
using (public.is_alliance_member(alliance_id));

drop policy if exists "members_insert_owner" on public.alliance_members;
create policy "members_insert_owner"
on public.alliance_members for insert
to authenticated
with check (public.get_alliance_role(alliance_id) = 'owner');

drop policy if exists "members_update_owner" on public.alliance_members;
create policy "members_update_owner"
on public.alliance_members for update
to authenticated
using (public.get_alliance_role(alliance_id) = 'owner')
with check (public.get_alliance_role(alliance_id) = 'owner');

drop policy if exists "members_delete_owner" on public.alliance_members;
create policy "members_delete_owner"
on public.alliance_members for delete
to authenticated
using (public.get_alliance_role(alliance_id) = 'owner');

drop policy if exists "participants_select_members" on public.participants;
create policy "participants_select_members"
on public.participants for select
to authenticated
using (public.is_alliance_member(alliance_id));

drop policy if exists "participants_insert_editors" on public.participants;
create policy "participants_insert_editors"
on public.participants for insert
to authenticated
with check (
  public.get_alliance_role(alliance_id) in ('owner', 'editor')
  and created_by = auth.uid()
);

drop policy if exists "participants_update_editors" on public.participants;
create policy "participants_update_editors"
on public.participants for update
to authenticated
using (public.get_alliance_role(alliance_id) in ('owner', 'editor'))
with check (
  public.get_alliance_role(alliance_id) in ('owner', 'editor')
  and updated_by = auth.uid()
);

drop policy if exists "participants_delete_editors" on public.participants;
create policy "participants_delete_editors"
on public.participants for delete
to authenticated
using (public.get_alliance_role(alliance_id) in ('owner', 'editor'));

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.alliances to authenticated;
grant select, insert, update, delete on public.alliance_members to authenticated;
grant select, insert, update, delete on public.participants to authenticated;
grant execute on function public.is_alliance_member(uuid) to authenticated;
grant execute on function public.get_alliance_role(uuid) to authenticated;
grant execute on function public.join_alliance_by_code(text) to authenticated;

revoke all on function public.join_alliance_by_code(text) from public;

-- Включаем realtime для таблицы участников один раз.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'participants'
  ) then
    alter publication supabase_realtime add table public.participants;
  end if;
end
$$;
