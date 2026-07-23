-- Заявки, ручные сроки и серверное управление продвинутым режимом.

alter table private.advanced_mode_access
  add column if not exists expires_on date;

alter table private.advanced_mode_access
  add column if not exists grant_source text not null default 'manual';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'advanced_mode_access_grant_source_check'
      and conrelid = 'private.advanced_mode_access'::regclass
  ) then
    alter table private.advanced_mode_access
      add constraint advanced_mode_access_grant_source_check
      check (grant_source in ('owner', 'manual', 'payment', 'system'));
  end if;
end
$$;

create table if not exists private.advanced_mode_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table private.advanced_mode_requests enable row level security;
revoke all on private.advanced_mode_requests from public, anon, authenticated;

create index if not exists advanced_mode_requests_requested_at_idx
  on private.advanced_mode_requests (requested_at asc);

create index if not exists advanced_mode_access_active_granted_idx
  on private.advanced_mode_access (granted_at desc)
  where is_enabled = true;

update private.advanced_mode_access access_row
set grant_source = case
  when exists (
    select 1 from private.app_admins admin_row
    where admin_row.user_id = access_row.user_id
  ) then 'owner'
  else coalesce(nullif(access_row.grant_source, ''), 'manual')
end;

create or replace function private.is_app_admin(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private
as $$
  select check_user_id is not null
    and exists (
      select 1 from private.app_admins admin_row
      where admin_row.user_id = check_user_id
    );
$$;

create or replace function public.has_advanced_mode_access()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, public
as $$
  select auth.uid() is not null
    and (
      private.is_app_admin(auth.uid())
      or exists (
        select 1
        from private.advanced_mode_access access_row
        where access_row.user_id = auth.uid()
          and access_row.is_enabled = true
          and (access_row.expires_on is null or access_row.expires_on >= current_date)
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
  with current_user_row as (select auth.uid() as user_id)
  select jsonb_build_object(
    'has_access', public.has_advanced_mode_access(),
    'is_admin', private.is_app_admin(current_user_row.user_id),
    'request_status', case when request_row.user_id is not null then 'pending' else null end,
    'requested_at', request_row.requested_at,
    'granted_at', case
      when private.is_app_admin(current_user_row.user_id)
        then coalesce(access_row.granted_at, admin_row.created_at)
      else access_row.granted_at
    end,
    'expires_on', case
      when private.is_app_admin(current_user_row.user_id) then null
      else access_row.expires_on
    end,
    'is_expired', case
      when private.is_app_admin(current_user_row.user_id) then false
      else coalesce(
        access_row.is_enabled = true
        and access_row.expires_on is not null
        and access_row.expires_on < current_date,
        false
      )
    end
  )
  from current_user_row
  left join private.advanced_mode_access access_row on access_row.user_id = current_user_row.user_id
  left join private.advanced_mode_requests request_row on request_row.user_id = current_user_row.user_id
  left join private.app_admins admin_row on admin_row.user_id = current_user_row.user_id;
$$;

create or replace function public.request_advanced_mode_access()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Для отправки заявки необходимо войти в аккаунт';
  end if;
  if public.has_advanced_mode_access() then
    return public.get_my_advanced_mode_status();
  end if;
  insert into private.advanced_mode_requests (user_id, requested_at, updated_at)
  values (current_user_id, now(), now())
  on conflict (user_id) do update set updated_at = now();
  return public.get_my_advanced_mode_status();
end;
$$;

create or replace function public.get_advanced_mode_admin_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  current_user_id uuid := auth.uid();
  pending_count bigint;
  active_count bigint;
begin
  if not private.is_app_admin(current_user_id) then
    raise exception 'Управлять доступом может только администратор сайта';
  end if;
  select count(*) into pending_count from private.advanced_mode_requests;
  select count(*) into active_count
  from (
    select admin_row.user_id from private.app_admins admin_row
    union
    select access_row.user_id
    from private.advanced_mode_access access_row
    where access_row.is_enabled = true
      and (access_row.expires_on is null or access_row.expires_on >= current_date)
  ) active_users;
  return jsonb_build_object(
    'pending_requests', pending_count,
    'active_access_total', active_count
  );
end;
$$;

create or replace function public.list_advanced_mode_requests()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  result jsonb;
begin
  if not private.is_app_admin(current_user_id) then
    raise exception 'Управлять доступом может только администратор сайта';
  end if;
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user_id', request_data.user_id,
        'email', request_data.email,
        'nickname', request_data.nickname,
        'state', request_data.state,
        'registered_at', request_data.registered_at,
        'requested_at', request_data.requested_at
      )
      order by request_data.requested_at asc, lower(request_data.email) asc
    ),
    '[]'::jsonb
  ) into result
  from (
    select
      request_row.user_id,
      user_row.email,
      coalesce(profile_row.nickname, split_part(user_row.email, '@', 1), 'Пользователь') as nickname,
      coalesce(profile_row.state, '') as state,
      user_row.created_at as registered_at,
      request_row.requested_at
    from private.advanced_mode_requests request_row
    join auth.users user_row on user_row.id = request_row.user_id
    left join lateral (
      select game_profile.nickname, game_profile.state
      from public.game_profiles game_profile
      where game_profile.user_id = user_row.id
      order by game_profile.is_primary desc, game_profile.created_at asc
      limit 1
    ) profile_row on true
  ) request_data;
  return result;
end;
$$;

create or replace function public.find_advanced_mode_account_by_email(search_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_email text := lower(trim(coalesce(search_email, '')));
  result jsonb;
begin
  if not private.is_app_admin(current_user_id) then
    raise exception 'Управлять доступом может только администратор сайта';
  end if;
  if normalized_email = '' then return null; end if;
  select jsonb_build_object(
    'user_id', user_row.id,
    'email', user_row.email,
    'nickname', coalesce(profile_row.nickname, split_part(user_row.email, '@', 1), 'Пользователь'),
    'state', coalesce(profile_row.state, ''),
    'registered_at', user_row.created_at,
    'has_access', (
      admin_row.user_id is not null
      or (
        coalesce(access_row.is_enabled, false) = true
        and (access_row.expires_on is null or access_row.expires_on >= current_date)
      )
    ),
    'is_admin', admin_row.user_id is not null,
    'request_status', case when request_row.user_id is not null then 'pending' else null end,
    'requested_at', request_row.requested_at,
    'granted_at', case
      when admin_row.user_id is not null then coalesce(access_row.granted_at, admin_row.created_at)
      else access_row.granted_at
    end,
    'expires_on', case when admin_row.user_id is not null then null else access_row.expires_on end,
    'grant_source', case when admin_row.user_id is not null then 'owner' else access_row.grant_source end,
    'is_expired', case
      when admin_row.user_id is not null then false
      else coalesce(
        access_row.is_enabled = true
        and access_row.expires_on is not null
        and access_row.expires_on < current_date,
        false
      )
    end
  ) into result
  from auth.users user_row
  left join lateral (
    select game_profile.nickname, game_profile.state
    from public.game_profiles game_profile
    where game_profile.user_id = user_row.id
    order by game_profile.is_primary desc, game_profile.created_at asc
    limit 1
  ) profile_row on true
  left join private.app_admins admin_row on admin_row.user_id = user_row.id
  left join private.advanced_mode_access access_row on access_row.user_id = user_row.id
  left join private.advanced_mode_requests request_row on request_row.user_id = user_row.id
  where lower(user_row.email) = normalized_email
  limit 1;
  return result;
end;
$$;

create or replace function public.list_advanced_mode_grants(
  page_number integer default 1,
  page_size integer default 30,
  sort_key text default 'granted',
  sort_direction text default 'desc'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  safe_page integer := greatest(coalesce(page_number, 1), 1);
  safe_page_size integer := least(greatest(coalesce(page_size, 30), 1), 100);
  safe_sort_key text := case when sort_key in ('registered', 'granted') then sort_key else 'granted' end;
  safe_sort_direction text := case when lower(sort_direction) = 'asc' then 'asc' else 'desc' end;
  result jsonb;
begin
  if not private.is_app_admin(current_user_id) then
    raise exception 'Управлять доступом может только администратор сайта';
  end if;
  with access_rows as (
    select
      user_row.id as user_id,
      user_row.email,
      coalesce(profile_row.nickname, split_part(user_row.email, '@', 1), 'Пользователь') as nickname,
      coalesce(profile_row.state, '') as state,
      user_row.created_at as registered_at,
      case
        when admin_row.user_id is not null then coalesce(access_row.granted_at, admin_row.created_at)
        else access_row.granted_at
      end as granted_at,
      case when admin_row.user_id is not null then null else access_row.expires_on end as expires_on,
      admin_row.user_id is not null as is_admin,
      case when admin_row.user_id is not null then 'owner' else access_row.grant_source end as grant_source
    from auth.users user_row
    left join lateral (
      select game_profile.nickname, game_profile.state
      from public.game_profiles game_profile
      where game_profile.user_id = user_row.id
      order by game_profile.is_primary desc, game_profile.created_at asc
      limit 1
    ) profile_row on true
    left join private.app_admins admin_row on admin_row.user_id = user_row.id
    left join private.advanced_mode_access access_row on access_row.user_id = user_row.id
    where admin_row.user_id is not null
      or (
        access_row.is_enabled = true
        and (access_row.expires_on is null or access_row.expires_on >= current_date)
      )
  ),
  paged_rows as (
    select * from access_rows
    order by
      case when safe_sort_key = 'registered' and safe_sort_direction = 'asc' then registered_at end asc,
      case when safe_sort_key = 'registered' and safe_sort_direction = 'desc' then registered_at end desc,
      case when safe_sort_key = 'granted' and safe_sort_direction = 'asc' then granted_at end asc,
      case when safe_sort_key = 'granted' and safe_sort_direction = 'desc' then granted_at end desc,
      lower(email) asc
    limit safe_page_size
    offset (safe_page - 1) * safe_page_size
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', paged_row.user_id,
          'email', paged_row.email,
          'nickname', paged_row.nickname,
          'state', paged_row.state,
          'registered_at', paged_row.registered_at,
          'granted_at', paged_row.granted_at,
          'expires_on', paged_row.expires_on,
          'is_admin', paged_row.is_admin,
          'grant_source', paged_row.grant_source
        )
        order by
          case when safe_sort_key = 'registered' and safe_sort_direction = 'asc' then paged_row.registered_at end asc,
          case when safe_sort_key = 'registered' and safe_sort_direction = 'desc' then paged_row.registered_at end desc,
          case when safe_sort_key = 'granted' and safe_sort_direction = 'asc' then paged_row.granted_at end asc,
          case when safe_sort_key = 'granted' and safe_sort_direction = 'desc' then paged_row.granted_at end desc,
          lower(paged_row.email) asc
      ) from paged_rows paged_row
    ), '[]'::jsonb),
    'total', (select count(*) from access_rows),
    'page', safe_page,
    'page_size', safe_page_size
  ) into result;
  return result;
end;
$$;

create or replace function public.grant_advanced_mode_access(
  target_user_id uuid,
  access_expires_on date default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private, public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  target_is_admin boolean;
  effective_expiration date := access_expires_on;
begin
  if not private.is_app_admin(current_user_id) then
    raise exception 'Управлять доступом может только администратор сайта';
  end if;
  if target_user_id is null or not exists (
    select 1 from auth.users user_row where user_row.id = target_user_id
  ) then
    raise exception 'Пользователь не найден';
  end if;
  if effective_expiration is not null and effective_expiration < current_date then
    raise exception 'Дата окончания доступа не может быть в прошлом';
  end if;
  target_is_admin := private.is_app_admin(target_user_id);
  if target_is_admin then effective_expiration := null; end if;

  insert into private.advanced_mode_access (
    user_id, is_enabled, granted_by, granted_at, expires_on, grant_source, updated_at
  ) values (
    target_user_id, true, current_user_id, now(), effective_expiration,
    case when target_is_admin then 'owner' else 'manual' end, now()
  )
  on conflict (user_id) do update set
    is_enabled = true,
    granted_by = excluded.granted_by,
    granted_at = case
      when private.advanced_mode_access.is_enabled = true
        and private.advanced_mode_access.granted_at is not null
        then private.advanced_mode_access.granted_at
      else now()
    end,
    expires_on = excluded.expires_on,
    grant_source = excluded.grant_source,
    updated_at = now();

  delete from private.advanced_mode_requests request_row
  where request_row.user_id = target_user_id;

  return jsonb_build_object(
    'user_id', target_user_id,
    'has_access', true,
    'is_admin', target_is_admin,
    'expires_on', effective_expiration
  );
end;
$$;

create or replace function public.revoke_advanced_mode_access(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private, public, auth
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if not private.is_app_admin(current_user_id) then
    raise exception 'Управлять доступом может только администратор сайта';
  end if;
  if private.is_app_admin(target_user_id) then
    raise exception 'Доступ владельца сайта нельзя удалить';
  end if;
  update private.advanced_mode_access access_row
  set is_enabled = false, expires_on = null, updated_at = now()
  where access_row.user_id = target_user_id;
  delete from private.advanced_mode_requests request_row
  where request_row.user_id = target_user_id;
  return jsonb_build_object('user_id', target_user_id, 'has_access', false, 'is_admin', false);
end;
$$;

create or replace function public.delete_advanced_mode_request(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if not private.is_app_admin(current_user_id) then
    raise exception 'Управлять доступом может только администратор сайта';
  end if;
  delete from private.advanced_mode_requests request_row
  where request_row.user_id = target_user_id;
  return jsonb_build_object('user_id', target_user_id, 'request_status', null);
end;
$$;

create or replace function public.set_advanced_mode_access(target_user_id uuid, enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
begin
  if coalesce(enabled, false) then
    return public.grant_advanced_mode_access(target_user_id, null);
  end if;
  return public.revoke_advanced_mode_access(target_user_id);
end;
$$;

revoke all on function private.is_app_admin(uuid) from public, anon, authenticated;

revoke execute on function public.has_advanced_mode_access() from public, anon, authenticated;
revoke execute on function public.get_my_advanced_mode_status() from public, anon, authenticated;
revoke execute on function public.request_advanced_mode_access() from public, anon, authenticated;
revoke execute on function public.get_advanced_mode_admin_summary() from public, anon, authenticated;
revoke execute on function public.list_advanced_mode_requests() from public, anon, authenticated;
revoke execute on function public.find_advanced_mode_account_by_email(text) from public, anon, authenticated;
revoke execute on function public.list_advanced_mode_grants(integer, integer, text, text) from public, anon, authenticated;
revoke execute on function public.grant_advanced_mode_access(uuid, date) from public, anon, authenticated;
revoke execute on function public.revoke_advanced_mode_access(uuid) from public, anon, authenticated;
revoke execute on function public.delete_advanced_mode_request(uuid) from public, anon, authenticated;
revoke execute on function public.set_advanced_mode_access(uuid, boolean) from public, anon, authenticated;

grant execute on function public.has_advanced_mode_access() to authenticated;
grant execute on function public.get_my_advanced_mode_status() to authenticated;
grant execute on function public.request_advanced_mode_access() to authenticated;
grant execute on function public.get_advanced_mode_admin_summary() to authenticated;
grant execute on function public.list_advanced_mode_requests() to authenticated;
grant execute on function public.find_advanced_mode_account_by_email(text) to authenticated;
grant execute on function public.list_advanced_mode_grants(integer, integer, text, text) to authenticated;
grant execute on function public.grant_advanced_mode_access(uuid, date) to authenticated;
grant execute on function public.revoke_advanced_mode_access(uuid) to authenticated;
grant execute on function public.delete_advanced_mode_request(uuid) to authenticated;
grant execute on function public.set_advanced_mode_access(uuid, boolean) to authenticated;

comment on table private.advanced_mode_requests is 'Заявки зарегистрированных пользователей на доступ к продвинутому режиму.';
comment on column private.advanced_mode_access.expires_on is 'Последний календарный день, когда доступ остаётся активным; NULL означает бессрочный доступ.';
comment on column private.advanced_mode_access.grant_source is 'Источник выдачи доступа: владелец, вручную, оплата или системное действие.';

notify pgrst, 'reload schema';