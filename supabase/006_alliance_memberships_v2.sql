-- HarvestHub: надёжная загрузка штабов текущего пользователя.
-- Выполни файл целиком в Supabase → SQL Editor.

create or replace function public.get_my_alliance_hubs_v2()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'alliance_id', m.alliance_id,
        'role', m.role,
        'alliances', jsonb_build_object(
          'id', a.id,
          'name', a.name,
          'state_number', a.state_number,
          'invite_code', a.invite_code
        )
      )
      order by m.joined_at asc
    ),
    '[]'::jsonb
  )
  from public.alliance_members m
  join public.alliances a on a.id = m.alliance_id
  where m.user_id = auth.uid();
$$;

revoke all on function public.get_my_alliance_hubs_v2() from public;
grant execute on function public.get_my_alliance_hubs_v2() to authenticated;
