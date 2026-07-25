-- Restored from the applied Supabase migration history.

create or replace function public.sync_my_alliance_personal_data()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_birthday date;
  account_timezone integer;
  updated_count integer;
begin
  if auth.uid() is null then
    raise exception 'Необходимо войти в аккаунт';
  end if;

  select
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
  into account_birthday, account_timezone
  from auth.users u
  where u.id = auth.uid();

  update public.participants p
  set birthday = coalesce(account_birthday, p.birthday),
      timezone_offset = coalesce(account_timezone, p.timezone_offset),
      updated_by = auth.uid()
  where p.linked_user_id = auth.uid()
    and p.member_status <> 'left';

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

revoke execute on function public.sync_my_alliance_personal_data() from public, anon;
grant execute on function public.sync_my_alliance_personal_data() to authenticated;
