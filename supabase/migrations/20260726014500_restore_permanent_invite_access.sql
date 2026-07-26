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

create or replace function public.rotate_alliance_invite_code(target_alliance_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  new_code text;
  attempt_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'Требуется авторизация';
  end if;

  if public.get_alliance_role(target_alliance_id) not in ('owner', 'r5') then
    raise exception 'Сменить пригласительный код может только владелец или Р5';
  end if;

  loop
    attempt_count := attempt_count + 1;
    new_code := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 16));

    begin
      update public.alliances
      set invite_code = new_code
      where id = target_alliance_id;

      if not found then
        raise exception 'Союз не найден';
      end if;

      return new_code;
    exception
      when unique_violation then
        if attempt_count >= 5 then
          raise exception 'Не удалось создать уникальный пригласительный код';
        end if;
    end;
  end loop;
end;
$$;

revoke all on function public.join_alliance_by_code(text) from public, anon;
grant execute on function public.join_alliance_by_code(text) to authenticated;

revoke all on function public.rotate_alliance_invite_code(uuid) from public, anon;
grant execute on function public.rotate_alliance_invite_code(uuid) to authenticated;