alter table private.advanced_mode_access
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid references auth.users(id) on delete set null;

create table if not exists private.advanced_mode_access_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('granted','revoked')),
  acted_by uuid references auth.users(id) on delete set null,
  acted_at timestamptz not null default now(),
  expires_on date,
  grant_source text,
  details jsonb not null default '{}'::jsonb
);

revoke all on private.advanced_mode_access_history from public, anon, authenticated;

create or replace function public.grant_advanced_mode_access(target_user_id uuid, access_expires_on date default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'private', 'public', 'auth'
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
    user_id, is_enabled, granted_by, granted_at, expires_on,
    grant_source, updated_at, revoked_at, revoked_by
  ) values (
    target_user_id, true, current_user_id, now(), effective_expiration,
    case when target_is_admin then 'owner' else 'manual' end,
    now(), null, null
  )
  on conflict (user_id) do update set
    is_enabled = true,
    granted_by = excluded.granted_by,
    granted_at = now(),
    expires_on = excluded.expires_on,
    grant_source = excluded.grant_source,
    updated_at = now(),
    revoked_at = null,
    revoked_by = null;

  insert into private.advanced_mode_access_history (
    user_id, action, acted_by, expires_on, grant_source
  ) values (
    target_user_id, 'granted', current_user_id, effective_expiration,
    case when target_is_admin then 'owner' else 'manual' end
  );

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

revoke execute on function public.grant_advanced_mode_access(uuid,date) from public, anon;
grant execute on function public.grant_advanced_mode_access(uuid,date) to authenticated;

create or replace function public.revoke_advanced_mode_access(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'private', 'public', 'auth'
as $$
declare
  current_user_id uuid := auth.uid();
  previous_expiration date;
  previous_source text;
begin
  if not private.is_app_admin(current_user_id) then
    raise exception 'Управлять доступом может только администратор сайта';
  end if;

  if private.is_app_admin(target_user_id) then
    raise exception 'Доступ владельца сайта нельзя удалить';
  end if;

  select access_row.expires_on, access_row.grant_source
  into previous_expiration, previous_source
  from private.advanced_mode_access access_row
  where access_row.user_id = target_user_id
  for update;

  update private.advanced_mode_access access_row
  set is_enabled = false,
      revoked_at = now(),
      revoked_by = current_user_id,
      updated_at = now()
  where access_row.user_id = target_user_id;

  if found then
    insert into private.advanced_mode_access_history (
      user_id, action, acted_by, expires_on, grant_source
    ) values (
      target_user_id, 'revoked', current_user_id, previous_expiration, previous_source
    );
  end if;

  delete from private.advanced_mode_requests request_row
  where request_row.user_id = target_user_id;

  return jsonb_build_object(
    'user_id', target_user_id,
    'has_access', false,
    'is_admin', false,
    'expires_on', previous_expiration
  );
end;
$$;

revoke execute on function public.revoke_advanced_mode_access(uuid) from public, anon;
grant execute on function public.revoke_advanced_mode_access(uuid) to authenticated;

create or replace function public.trim_participant_nickname_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.participant_nickname_history h
  where h.id in (
    select old.id
    from public.participant_nickname_history old
    where old.participant_id = new.participant_id
    order by old.changed_at desc, old.id desc
    offset 6
  );
  return new;
end;
$$;

revoke execute on function public.trim_participant_nickname_history() from public, anon, authenticated;

drop trigger if exists participant_nickname_history_keep_last_six on public.participant_nickname_history;
create trigger participant_nickname_history_keep_last_six
after insert on public.participant_nickname_history
for each row execute function public.trim_participant_nickname_history();

with ranked as (
  select id, row_number() over (
    partition by participant_id order by changed_at desc, id desc
  ) as rn
  from public.participant_nickname_history
)
delete from public.participant_nickname_history h
using ranked r
where h.id = r.id and r.rn > 6;

create or replace function public.delete_participant_nickname_history_entry(
  target_alliance_id uuid,
  target_history_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_edit_alliance(target_alliance_id) then
    raise exception 'Удалять историю никнеймов могут только Р4, Р5 и владелец';
  end if;

  delete from public.participant_nickname_history h
  where h.id = target_history_id
    and h.alliance_id = target_alliance_id;

  return found;
end;
$$;

revoke execute on function public.delete_participant_nickname_history_entry(uuid,uuid) from public, anon;
grant execute on function public.delete_participant_nickname_history_entry(uuid,uuid) to authenticated;
