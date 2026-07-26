alter table public.alliances
  alter column invite_code set default upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 16));

create or replace function public.join_alliance_by_code(join_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_id uuid;
begin
  if current_user_id is null then
    raise exception 'Требуется авторизация';
  end if;

  select a.id
  into target_id
  from public.alliances a
  where a.invite_code = upper(trim(coalesce(join_code, '')))
  limit 1;

  if target_id is null then
    raise exception 'Союз с таким кодом не найден';
  end if;

  insert into public.alliance_members (alliance_id, user_id, role)
  values (target_id, current_user_id, 'viewer')
  on conflict (alliance_id, user_id) do nothing;

  return target_id;
end;
$$;

revoke all on function public.join_alliance_by_code(text) from public;
revoke all on function public.join_alliance_by_code(text) from anon;
grant execute on function public.join_alliance_by_code(text) to authenticated;