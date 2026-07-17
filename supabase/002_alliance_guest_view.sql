-- HarvestHub: гостевой просмотр союзного штаба по пригласительному коду.
-- Выполни файл целиком в Supabase → SQL Editor.

create or replace function public.open_alliance_by_code(access_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_alliance public.alliances%rowtype;
  participant_list jsonb;
begin
  select *
  into target_alliance
  from public.alliances
  where invite_code = upper(trim(access_code))
  limit 1;

  if target_alliance.id is null then
    return null;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'nickname', p.nickname,
        'rank_name', p.rank_name,
        'squad_power', p.squad_power,
        'status', p.status,
        'comment', p.comment
      )
      order by p.nickname
    ),
    '[]'::jsonb
  )
  into participant_list
  from public.participants p
  where p.alliance_id = target_alliance.id;

  return jsonb_build_object(
    'alliance', jsonb_build_object(
      'id', target_alliance.id,
      'name', target_alliance.name,
      'state_number', target_alliance.state_number
    ),
    'participants', participant_list
  );
end;
$$;

revoke all on function public.open_alliance_by_code(text) from public;
grant execute on function public.open_alliance_by_code(text) to anon, authenticated;
