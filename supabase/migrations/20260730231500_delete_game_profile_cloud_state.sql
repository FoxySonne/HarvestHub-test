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

  delete from public.user_app_state
  where user_id = current_user_id
    and state_key like ('game_profile:' || target_profile_id::text || ':%');

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

revoke execute on function public.delete_game_profile(uuid) from public, anon;
grant execute on function public.delete_game_profile(uuid) to authenticated;
