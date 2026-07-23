create or replace function public.link_alliance_participant_account(
  target_alliance_id uuid,
  target_participant_id uuid,
  target_email text
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  target_user_id uuid;
  effective_role text;
  account_birthday date;
  account_timezone integer;
begin
  effective_role := public.get_alliance_role(target_alliance_id);
  if effective_role <> 'owner' then
    raise exception 'Связывать аккаунты могут только владелец штаба и Р5';
  end if;

  select
    u.id,
    case
      when coalesce(u.raw_user_meta_data->>'birthday', '') ~ '^\d{4}-\d{2}-\d{2}$'
        then (u.raw_user_meta_data->>'birthday')::date
      else null
    end,
    case
      when coalesce(u.raw_user_meta_data->>'timezone_offset', '') ~ '^-?\d+$'
        and (u.raw_user_meta_data->>'timezone_offset')::integer between -12 and 12
        then (u.raw_user_meta_data->>'timezone_offset')::integer
      else null
    end
  into target_user_id, account_birthday, account_timezone
  from auth.users u
  where lower(u.email) = lower(trim(target_email))
  limit 1;

  if target_user_id is null then
    raise exception 'Аккаунт с таким email не найден';
  end if;

  if not exists (
    select 1 from public.participants p
    where p.id = target_participant_id
      and p.alliance_id = target_alliance_id
      and p.member_status <> 'left'
  ) then
    raise exception 'Участник не найден';
  end if;

  if exists (
    select 1 from public.participants p
    where p.alliance_id = target_alliance_id
      and p.linked_user_id = target_user_id
      and p.id <> target_participant_id
      and p.member_status <> 'left'
  ) then
    raise exception 'Этот аккаунт уже связан с другим участником союза';
  end if;

  update public.participants
  set linked_user_id = target_user_id,
      birthday = coalesce(account_birthday, birthday),
      timezone_offset = coalesce(account_timezone, timezone_offset),
      updated_by = auth.uid()
  where id = target_participant_id
    and alliance_id = target_alliance_id;

  insert into public.alliance_members (alliance_id, user_id, role)
  values (target_alliance_id, target_user_id, 'viewer')
  on conflict (alliance_id, user_id) do nothing;

  return target_user_id;
end;
$function$;