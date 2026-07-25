create or replace function public.ensure_initial_game_profile(profile_nickname text, profile_state text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  clean_nickname text := trim(profile_nickname);
  clean_state text := trim(profile_state);
  selected_profile public.game_profiles%rowtype;
begin
  if current_user_id is null then
    raise exception 'Требуется авторизация.' using errcode = '42501';
  end if;
  if clean_nickname = '' or char_length(clean_nickname) > 80 then
    raise exception 'Некорректный никнейм.' using errcode = '22023';
  end if;
  if clean_state = '' or char_length(clean_state) > 20 then
    raise exception 'Некорректный номер штата.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));
  select * into selected_profile
  from public.game_profiles gp
  where gp.user_id = current_user_id
  order by gp.is_active desc, gp.is_primary desc, gp.created_at, gp.id
  limit 1
  for update;
  if found then
    return to_jsonb(selected_profile);
  end if;
  insert into public.game_profiles (user_id, nickname, state, is_primary, is_active, data)
  values (current_user_id, clean_nickname, clean_state, true, true, '{}'::jsonb)
  returning * into selected_profile;
  return to_jsonb(selected_profile);
end;
$$;
revoke execute on function public.ensure_initial_game_profile(text, text) from public, anon;
grant execute on function public.ensure_initial_game_profile(text, text) to authenticated;
