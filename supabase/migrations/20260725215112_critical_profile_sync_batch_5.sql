-- Critical profile synchronization batch 5.
-- Prevents stale writes, makes profile activation/creation/deletion atomic,
-- and links profile-scoped cloud state to its game profile for cascade cleanup.

alter table public.user_app_state
  add column if not exists game_profile_id uuid references public.game_profiles(id) on delete cascade;

update public.user_app_state s
set game_profile_id = gp.id
from public.game_profiles gp
where s.user_id = gp.user_id
  and s.state_key like 'game_profile:' || gp.id::text || ':%'
  and s.game_profile_id is distinct from gp.id;

create index if not exists user_app_state_game_profile_id_idx
  on public.user_app_state (game_profile_id)
  where game_profile_id is not null;

create or replace function public.set_user_app_state_profile_id()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  parsed_profile_id uuid;
begin
  if new.state_key ~* '^game_profile:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:' then
    parsed_profile_id := split_part(new.state_key, ':', 2)::uuid;
    if not exists (
      select 1
      from public.game_profiles gp
      where gp.id = parsed_profile_id
        and gp.user_id = new.user_id
    ) then
      raise exception 'Игровой профиль для облачного состояния не найден.' using errcode = '23503';
    end if;
    new.game_profile_id := parsed_profile_id;
  else
    new.game_profile_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists set_user_app_state_profile_id on public.user_app_state;
create trigger set_user_app_state_profile_id
before insert or update of user_id, state_key
on public.user_app_state
for each row execute function public.set_user_app_state_profile_id();

create or replace function public.guard_user_app_state_revision()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.revision <> old.revision + 1 then
    raise exception 'STATE_REVISION_CONFLICT' using errcode = '40001';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_user_app_state_revision on public.user_app_state;
create trigger guard_user_app_state_revision
before update of data, revision
on public.user_app_state
for each row execute function public.guard_user_app_state_revision();

create or replace function public.save_user_app_state_if_revision(
  target_state_key text,
  expected_revision bigint,
  target_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  clean_state_key text := trim(target_state_key);
  current_row public.user_app_state%rowtype;
  saved_row public.user_app_state%rowtype;
begin
  if current_user_id is null then
    raise exception 'Требуется авторизация.' using errcode = '42501';
  end if;
  if clean_state_key = '' or char_length(clean_state_key) > 240 then
    raise exception 'Некорректный ключ состояния.' using errcode = '22023';
  end if;
  if coalesce(expected_revision, -1) < 0 then
    raise exception 'Некорректная ожидаемая версия.' using errcode = '22023';
  end if;
  if target_data is null or jsonb_typeof(target_data) <> 'object' then
    raise exception 'Состояние должно быть объектом.' using errcode = '22023';
  end if;

  select *
  into current_row
  from public.user_app_state s
  where s.user_id = current_user_id
    and s.state_key = clean_state_key
  for update;

  if found then
    if current_row.revision <> expected_revision then
      return jsonb_build_object(
        'saved', false,
        'conflict', true,
        'data', current_row.data,
        'revision', current_row.revision,
        'updated_at', current_row.updated_at
      );
    end if;

    update public.user_app_state s
    set data = target_data,
        revision = current_row.revision + 1
    where s.user_id = current_user_id
      and s.state_key = clean_state_key
    returning * into saved_row;
  else
    if expected_revision <> 0 then
      return jsonb_build_object(
        'saved', false,
        'conflict', true,
        'data', null,
        'revision', 0,
        'updated_at', null
      );
    end if;

    insert into public.user_app_state (user_id, state_key, data, revision)
    values (current_user_id, clean_state_key, target_data, 1)
    on conflict (user_id, state_key) do nothing
    returning * into saved_row;

    if saved_row.user_id is null then
      select *
      into current_row
      from public.user_app_state s
      where s.user_id = current_user_id
        and s.state_key = clean_state_key;
      return jsonb_build_object(
        'saved', false,
        'conflict', true,
        'data', current_row.data,
        'revision', current_row.revision,
        'updated_at', current_row.updated_at
      );
    end if;
  end if;

  return jsonb_build_object(
    'saved', true,
    'conflict', false,
    'revision', saved_row.revision,
    'updated_at', saved_row.updated_at
  );
end;
$$;

create or replace function public.activate_game_profile(target_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  selected_profile public.game_profiles%rowtype;
begin
  if current_user_id is null then
    raise exception 'Требуется авторизация.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));

  select * into selected_profile
  from public.game_profiles gp
  where gp.id = target_profile_id
    and gp.user_id = current_user_id
  for update;
  if not found then
    raise exception 'Игровой профиль не найден.' using errcode = 'P0002';
  end if;

  update public.game_profiles
  set is_active = false
  where user_id = current_user_id
    and is_active = true
    and id <> target_profile_id;

  update public.game_profiles
  set is_active = true
  where user_id = current_user_id
    and id = target_profile_id
  returning * into selected_profile;

  return to_jsonb(selected_profile);
end;
$$;

create or replace function public.create_and_activate_game_profile(
  profile_nickname text,
  profile_state text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  clean_nickname text := trim(profile_nickname);
  clean_state text := trim(profile_state);
  has_profiles boolean;
  created_profile public.game_profiles%rowtype;
begin
  if current_user_id is null then
    raise exception 'Требуется авторизация.' using errcode = '42501';
  end if;
  if clean_nickname = '' or char_length(clean_nickname) > 80 then
    raise exception 'Никнейм должен содержать от 1 до 80 символов.' using errcode = '22023';
  end if;
  if clean_state = '' or char_length(clean_state) > 20 then
    raise exception 'Номер штата должен содержать от 1 до 20 символов.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));
  select exists(select 1 from public.game_profiles where user_id = current_user_id)
  into has_profiles;

  update public.game_profiles
  set is_active = false
  where user_id = current_user_id
    and is_active = true;

  insert into public.game_profiles (
    user_id, nickname, state, is_primary, is_active, data
  ) values (
    current_user_id, clean_nickname, clean_state, not has_profiles, true, '{}'::jsonb
  )
  returning * into created_profile;

  return to_jsonb(created_profile);
end;
$$;

create or replace function public.delete_game_profile(target_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  requested_profile public.game_profiles%rowtype;
  next_profile public.game_profiles%rowtype;
begin
  if current_user_id is null then
    raise exception 'Требуется авторизация.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));

  select * into requested_profile
  from public.game_profiles gp
  where gp.id = target_profile_id
    and gp.user_id = current_user_id
  for update;
  if not found then
    raise exception 'Игровой профиль не найден.' using errcode = 'P0002';
  end if;
  if requested_profile.is_primary then
    raise exception 'Основной игровой профиль нельзя удалить.' using errcode = '22023';
  end if;

  if requested_profile.is_active then
    select * into next_profile
    from public.game_profiles gp
    where gp.user_id = current_user_id
      and gp.id <> target_profile_id
    order by gp.is_primary desc, gp.created_at, gp.id
    limit 1
    for update;
  else
    select * into next_profile
    from public.game_profiles gp
    where gp.user_id = current_user_id
      and gp.id <> target_profile_id
    order by gp.is_active desc, gp.is_primary desc, gp.created_at, gp.id
    limit 1
    for update;
  end if;

  if next_profile.id is null then
    raise exception 'Нельзя удалить единственный игровой профиль.' using errcode = '22023';
  end if;

  delete from public.game_profiles
  where id = target_profile_id
    and user_id = current_user_id;

  if requested_profile.is_active then
    update public.game_profiles
    set is_active = false
    where user_id = current_user_id
      and is_active = true;

    update public.game_profiles
    set is_active = true
    where user_id = current_user_id
      and id = next_profile.id
    returning * into next_profile;
  end if;

  return jsonb_build_object(
    'deleted_profile_id', target_profile_id,
    'active_profile', to_jsonb(next_profile)
  );
end;
$$;

revoke execute on function public.save_user_app_state_if_revision(text, bigint, jsonb) from public, anon;
revoke execute on function public.activate_game_profile(uuid) from public, anon;
revoke execute on function public.create_and_activate_game_profile(text, text) from public, anon;
revoke execute on function public.delete_game_profile(uuid) from public, anon;
grant execute on function public.save_user_app_state_if_revision(text, bigint, jsonb) to authenticated;
grant execute on function public.activate_game_profile(uuid) to authenticated;
grant execute on function public.create_and_activate_game_profile(text, text) to authenticated;
grant execute on function public.delete_game_profile(uuid) to authenticated;
