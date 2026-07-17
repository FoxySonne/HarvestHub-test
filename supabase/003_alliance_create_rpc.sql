-- HarvestHub: безопасное создание союзного штаба через RPC.
-- Выполни этот файл целиком в Supabase → SQL Editor.

create or replace function public.create_alliance_hub(
  alliance_name text,
  alliance_state_number text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_alliance_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Требуется авторизация';
  end if;

  if char_length(trim(coalesce(alliance_name, ''))) < 1 then
    raise exception 'Укажи название союза';
  end if;

  insert into public.alliances (
    name,
    state_number,
    created_by
  )
  values (
    trim(alliance_name),
    trim(coalesce(alliance_state_number, '')),
    auth.uid()
  )
  returning id into new_alliance_id;

  return new_alliance_id;
end;
$$;

revoke all on function public.create_alliance_hub(text, text) from public;
grant execute on function public.create_alliance_hub(text, text) to authenticated;
