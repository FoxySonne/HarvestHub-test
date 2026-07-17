-- HarvestHub: восстановление владельцев созданных штабов и надёжная загрузка моих штабов.
-- Выполни файл целиком в Supabase → SQL Editor.

-- Добавляем владельца для уже созданных союзов, если запись не появилась автоматически.
insert into public.alliance_members (alliance_id, user_id, role)
select a.id, a.created_by, 'owner'
from public.alliances a
where not exists (
  select 1
  from public.alliance_members m
  where m.alliance_id = a.id
    and m.user_id = a.created_by
)
on conflict (alliance_id, user_id) do update set role = 'owner';

-- Возвращает список штабов текущего пользователя без зависимости от вложенного RLS-запроса.
create or replace function public.get_my_alliance_hubs()
returns table (
  alliance_id uuid,
  role text,
  alliance jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.alliance_id,
    m.role,
    jsonb_build_object(
      'id', a.id,
      'name', a.name,
      'state_number', a.state_number,
      'invite_code', a.invite_code
    ) as alliance
  from public.alliance_members m
  join public.alliances a on a.id = m.alliance_id
  where m.user_id = auth.uid()
  order by m.joined_at asc;
$$;

revoke all on function public.get_my_alliance_hubs() from public;
grant execute on function public.get_my_alliance_hubs() to authenticated;
