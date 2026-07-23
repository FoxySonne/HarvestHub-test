alter table public.alliances
  add column if not exists vs_include_saturday_in_total boolean not null default true;

create or replace function public.get_alliance_vs_statistics(
  target_alliance_id uuid,
  target_date_from date,
  target_date_to date
)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  alliance_role text;
  daily_target numeric;
  include_saturday boolean;
  result jsonb;
begin
  alliance_role := public.get_alliance_role(target_alliance_id);
  if alliance_role is null then
    raise exception 'Нет доступа к этому союзному штабу';
  end if;

  if target_date_from is null or target_date_to is null or target_date_to < target_date_from then
    raise exception 'Неверно указан период статистики';
  end if;

  if target_date_to - target_date_from > 370 then
    raise exception 'За один раз можно открыть период не больше года';
  end if;

  select a.vs_daily_target, a.vs_include_saturday_in_total
  into daily_target, include_saturday
  from public.alliances a
  where a.id = target_alliance_id;

  select jsonb_build_object(
    'daily_target', daily_target,
    'include_saturday_in_total', include_saturday,
    'can_manage', alliance_role in ('owner', 'editor'),
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'participant_id', p.id,
        'nickname', p.nickname,
        'rank_name', p.rank_name
      ) order by
        case p.rank_name when 'Р5' then 5 when 'Р4' then 4 when 'Р3' then 3 when 'Р2' then 2 when 'Р1' then 1 else 0 end desc,
        lower(p.nickname))
      from public.participants p
      where p.alliance_id = target_alliance_id
        and p.member_status <> 'left'
    ), '[]'::jsonb),
    'results', coalesce((
      select jsonb_agg(jsonb_build_object(
        'participant_id', r.participant_id,
        'result_date', r.result_date,
        'points', r.points,
        'is_vacation', r.is_vacation
      ) order by r.result_date, r.participant_id)
      from public.alliance_vs_results r
      where r.alliance_id = target_alliance_id
        and r.result_date between target_date_from and target_date_to
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$function$;

create or replace function public.set_alliance_vs_saturday_total(
  target_alliance_id uuid,
  target_include_saturday boolean
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if public.get_alliance_role(target_alliance_id) not in ('owner', 'editor') then
    raise exception 'Менять учёт субботы могут только управляющие союза';
  end if;

  update public.alliances
  set vs_include_saturday_in_total = coalesce(target_include_saturday, true),
      updated_at = now()
  where id = target_alliance_id;
end;
$function$;