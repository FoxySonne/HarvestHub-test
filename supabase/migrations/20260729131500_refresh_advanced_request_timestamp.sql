create or replace function public.request_advanced_mode_access()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'private', 'public'
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
  on conflict (user_id) do update set
    requested_at = now(),
    updated_at = now();

  return public.get_my_advanced_mode_status();
end;
$$;

revoke execute on function public.request_advanced_mode_access() from public, anon;
grant execute on function public.request_advanced_mode_access() to authenticated;
