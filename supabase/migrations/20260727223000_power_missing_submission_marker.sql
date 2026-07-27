-- Позволяет сохранять строку без числовых значений как отметку
-- «игрок не сдал силу на выбранную дату».

create or replace function public.save_alliance_squad_power(
  target_alliance_id uuid,
  target_participant_id uuid,
  target_measured_on date,
  target_squad_1 numeric,
  target_squad_2 numeric,
  target_squad_3 numeric,
  target_squad_4 numeric,
  target_squad_5 numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  alliance_role text;
  participant_owner uuid;
  saved_id uuid;
begin
  alliance_role := public.get_alliance_role(target_alliance_id);

  select p.linked_user_id
  into participant_owner
  from public.participants p
  where p.id = target_participant_id
    and p.alliance_id = target_alliance_id
    and p.member_status <> 'left'
    and p.purged_at is null;

  if not found then
    raise exception 'Участник не найден';
  end if;

  if alliance_role not in ('owner', 'editor')
     and participant_owner is distinct from auth.uid() then
    raise exception 'Можно вводить данные только своих отрядов';
  end if;

  if target_measured_on is null then
    raise exception 'Укажи дату замера';
  end if;

  if target_measured_on > current_date then
    raise exception 'Нельзя сохранить замер силы на будущую дату';
  end if;

  if least(
    coalesce(target_squad_1, 0),
    coalesce(target_squad_2, 0),
    coalesce(target_squad_3, 0),
    coalesce(target_squad_4, 0),
    coalesce(target_squad_5, 0)
  ) < 0 then
    raise exception 'Сила отряда не может быть отрицательной';
  end if;

  insert into public.alliance_squad_power_measurements (
    alliance_id, participant_id, measured_on,
    squad_1, squad_2, squad_3, squad_4, squad_5,
    created_by, updated_by
  ) values (
    target_alliance_id, target_participant_id, target_measured_on,
    case when target_squad_1 is null then null else round(target_squad_1, 3) end,
    case when target_squad_2 is null then null else round(target_squad_2, 3) end,
    case when target_squad_3 is null then null else round(target_squad_3, 3) end,
    case when target_squad_4 is null then null else round(target_squad_4, 3) end,
    case when target_squad_5 is null then null else round(target_squad_5, 3) end,
    auth.uid(), auth.uid()
  )
  on conflict (participant_id, measured_on) do update set
    alliance_id = excluded.alliance_id,
    squad_1 = excluded.squad_1,
    squad_2 = excluded.squad_2,
    squad_3 = excluded.squad_3,
    squad_4 = excluded.squad_4,
    squad_5 = excluded.squad_5,
    updated_by = auth.uid(),
    updated_at = now()
  returning id into saved_id;

  return saved_id;
end;
$$;

create or replace function public.get_alliance_squad_power(target_alliance_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  alliance_role text;
  season_start date;
  result jsonb;
begin
  alliance_role := public.get_alliance_role(target_alliance_id);
  if alliance_role is null then
    raise exception 'Нет доступа к этому союзному штабу';
  end if;

  select coalesce(a.power_season_start, date_trunc('month', current_date)::date)
  into season_start
  from public.alliances a
  where a.id = target_alliance_id;

  select jsonb_build_object(
    'season_start', season_start,
    'can_manage', alliance_role in ('owner', 'editor'),
    'participants', coalesce(jsonb_agg(row_data order by
      coalesce((row_data->>'latest_power')::numeric, 0) desc,
      lower(row_data->>'nickname')
    ), '[]'::jsonb)
  )
  into result
  from (
    select jsonb_build_object(
      'participant_id', p.id,
      'nickname', p.nickname,
      'rank_name', p.rank_name,
      'is_own', p.linked_user_id = auth.uid(),
      'latest_date', latest.measured_on,
      'latest_missing', latest.id is not null and num_nonnulls(
        latest.squad_1, latest.squad_2, latest.squad_3, latest.squad_4, latest.squad_5
      ) = 0,
      'latest_power', case
        when latest.id is null or num_nonnulls(
          latest.squad_1, latest.squad_2, latest.squad_3, latest.squad_4, latest.squad_5
        ) = 0 then null
        else coalesce(latest.squad_1, latest.squad_2, latest.squad_3, latest.squad_4, latest.squad_5)
      end,
      'squad_1', latest.squad_1,
      'squad_2', latest.squad_2,
      'squad_3', latest.squad_3,
      'squad_4', latest.squad_4,
      'squad_5', latest.squad_5,
      'previous_power', case
        when latest.id is null or num_nonnulls(
          latest.squad_1, latest.squad_2, latest.squad_3, latest.squad_4, latest.squad_5
        ) = 0 then null
        else coalesce(history.previous_power, coalesce(latest.squad_1, latest.squad_2, latest.squad_3, latest.squad_4, latest.squad_5), 0)
      end,
      'week_power', case
        when latest.id is null or num_nonnulls(
          latest.squad_1, latest.squad_2, latest.squad_3, latest.squad_4, latest.squad_5
        ) = 0 then null
        else coalesce(history.week_power, coalesce(latest.squad_1, latest.squad_2, latest.squad_3, latest.squad_4, latest.squad_5), 0)
      end,
      'month_power', case
        when latest.id is null or num_nonnulls(
          latest.squad_1, latest.squad_2, latest.squad_3, latest.squad_4, latest.squad_5
        ) = 0 then null
        else coalesce(history.month_power, coalesce(latest.squad_1, latest.squad_2, latest.squad_3, latest.squad_4, latest.squad_5), 0)
      end,
      'season_power', case
        when latest.id is null or num_nonnulls(
          latest.squad_1, latest.squad_2, latest.squad_3, latest.squad_4, latest.squad_5
        ) = 0 then null
        else coalesce(history.season_power, coalesce(latest.squad_1, latest.squad_2, latest.squad_3, latest.squad_4, latest.squad_5), 0)
      end
    ) as row_data
    from public.participants p
    left join lateral (
      select m.*
      from public.alliance_squad_power_measurements m
      where m.participant_id = p.id
      order by m.measured_on desc
      limit 1
    ) latest on true
    left join lateral (
      select
        (array_agg(coalesce(m.squad_1, m.squad_2, m.squad_3, m.squad_4, m.squad_5)
          order by m.measured_on desc)
          filter (where m.measured_on < latest.measured_on
            and num_nonnulls(m.squad_1, m.squad_2, m.squad_3, m.squad_4, m.squad_5) > 0))[1] as previous_power,
        (array_agg(coalesce(m.squad_1, m.squad_2, m.squad_3, m.squad_4, m.squad_5)
          order by m.measured_on desc)
          filter (where m.measured_on <= latest.measured_on - 7
            and num_nonnulls(m.squad_1, m.squad_2, m.squad_3, m.squad_4, m.squad_5) > 0))[1] as week_power,
        (array_agg(coalesce(m.squad_1, m.squad_2, m.squad_3, m.squad_4, m.squad_5)
          order by m.measured_on desc)
          filter (where m.measured_on <= latest.measured_on - 30
            and num_nonnulls(m.squad_1, m.squad_2, m.squad_3, m.squad_4, m.squad_5) > 0))[1] as month_power,
        (array_agg(coalesce(m.squad_1, m.squad_2, m.squad_3, m.squad_4, m.squad_5)
          order by m.measured_on asc)
          filter (where m.measured_on >= season_start
            and m.measured_on <= latest.measured_on
            and num_nonnulls(m.squad_1, m.squad_2, m.squad_3, m.squad_4, m.squad_5) > 0))[1] as season_power
      from public.alliance_squad_power_measurements m
      where m.participant_id = p.id
    ) history on latest.measured_on is not null
    where p.alliance_id = target_alliance_id
      and p.member_status <> 'left'
      and p.purged_at is null
  ) data_rows;

  return result;
end;
$$;
