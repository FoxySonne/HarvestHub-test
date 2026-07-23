-- Ручная выдача доступа к продвинутому режиму.
-- Первый зарегистрированный аккаунт становится первоначальным администратором.

create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create table if not exists private.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists private.advanced_mode_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_enabled boolean not null default false,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table private.app_admins enable row level security;
alter table private.advanced_mode_access enable row level security;

revoke all on private.app_admins from public, anon, authenticated;
revoke all on private.advanced_mode_access from public, anon, authenticated;

with first_user as (
  select id
  from auth.users
  order by created_at asc
  limit 1
)
insert into private.app_admins (user_id, created_by)
select id, id
from first_user
where not exists (select 1 from private.app_admins)
on conflict (user_id) do nothing;

insert into private.advanced_mode_access (
  user_id,
  is_enabled,
  granted_by,
  granted_at,
  updated_at
)
select user_id, true, user_id, now(), now()
from private.app_admins
on conflict (user_id) do update set
  is_enabled = true,
  granted_by = excluded.granted_by,
  granted_at = coalesce(private.advanced_mode_access.granted_at, excluded.granted_at),
  updated_at = now();

create or replace function public.has_advanced_mode_access()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, public
as $$
  select auth.uid() is not null
    and (
      exists (
        select 1
        from private.app_admins a
        where a.user_id = auth.uid()
      )
      or exists (
        select 1
        from private.advanced_mode_access access_row
        where access_row.user_id = auth.uid()
          and access_row.is_enabled = true
      )
    );
$$;

create or replace function public.get_my_advanced_mode_status()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, private, public
as $$
  select jsonb_build_object(
    'has_access', public.has_advanced_mode_access(),
    'is_admin', auth.uid() is not null and exists (
      select 1
      from private.app_admins a
      where a.user_id = auth.uid()
    )
  );
$$;

create or replace function public.list_advanced_mode_accounts()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public, auth
as $$
declare
  result jsonb;
begin
  if auth.uid() is null or not exists (
    select 1
    from private.app_admins a
    where a.user_id = auth.uid()
  ) then
    raise exception 'Управлять доступом может только администратор сайта';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user_id', u.id,
        'email', u.email,
        'nickname', profile.nickname,
        'state', profile.state,
        'has_access', (
          admin_row.user_id is not null
          or coalesce(access_row.is_enabled, false)
        ),
        'is_admin', admin_row.user_id is not null,
        'created_at', u.created_at
      )
      order by lower(coalesce(profile.nickname, u.email, '')), u.created_at
    ),
    '[]'::jsonb
  )
  into result
  from auth.users u
  left join lateral (
    select gp.nickname, gp.state
    from public.game_profiles gp
    where gp.user_id = u.id
    order by gp.is_primary desc, gp.created_at asc
    limit 1
  ) profile on true
  left join private.app_admins admin_row on admin_row.user_id = u.id
  left join private.advanced_mode_access access_row on access_row.user_id = u.id;

  return result;
end;
$$;

create or replace function public.set_advanced_mode_access(
  target_user_id uuid,
  enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private, public, auth
as $$
declare
  target_is_admin boolean;
  result jsonb;
begin
  if auth.uid() is null or not exists (
    select 1
    from private.app_admins a
    where a.user_id = auth.uid()
  ) then
    raise exception 'Управлять доступом может только администратор сайта';
  end if;

  if target_user_id is null or not exists (
    select 1
    from auth.users u
    where u.id = target_user_id
  ) then
    raise exception 'Пользователь не найден';
  end if;

  select exists (
    select 1
    from private.app_admins a
    where a.user_id = target_user_id
  )
  into target_is_admin;

  if target_is_admin and coalesce(enabled, false) = false then
    raise exception 'Нельзя отозвать доступ у администратора сайта';
  end if;

  insert into private.advanced_mode_access (
    user_id,
    is_enabled,
    granted_by,
    granted_at,
    updated_at
  )
  values (
    target_user_id,
    coalesce(enabled, false),
    auth.uid(),
    case when coalesce(enabled, false) then now() else null end,
    now()
  )
  on conflict (user_id) do update set
    is_enabled = excluded.is_enabled,
    granted_by = excluded.granted_by,
    granted_at = excluded.granted_at,
    updated_at = excluded.updated_at;

  select jsonb_build_object(
    'user_id', target_user_id,
    'has_access', target_is_admin or coalesce(enabled, false),
    'is_admin', target_is_admin
  )
  into result;

  return result;
end;
$$;

revoke execute on function public.has_advanced_mode_access() from public, anon, authenticated;
revoke execute on function public.get_my_advanced_mode_status() from public, anon, authenticated;
revoke execute on function public.list_advanced_mode_accounts() from public, anon, authenticated;
revoke execute on function public.set_advanced_mode_access(uuid, boolean) from public, anon, authenticated;

grant execute on function public.has_advanced_mode_access() to authenticated;
grant execute on function public.get_my_advanced_mode_status() to authenticated;
grant execute on function public.list_advanced_mode_accounts() to authenticated;
grant execute on function public.set_advanced_mode_access(uuid, boolean) to authenticated;

comment on table private.app_admins is 'Администраторы HarvestHub, которым разрешено выдавать продвинутый режим.';
comment on table private.advanced_mode_access is 'Выданные вручную разрешения на продвинутый режим.';
comment on function public.get_my_advanced_mode_status() is 'Возвращает текущему пользователю статус доступа к продвинутому режиму.';
comment on function public.list_advanced_mode_accounts() is 'Возвращает администратору список аккаунтов для управления доступом.';
comment on function public.set_advanced_mode_access(uuid, boolean) is 'Выдаёт или отзывает доступ к продвинутому режиму; доступно только администратору.';
