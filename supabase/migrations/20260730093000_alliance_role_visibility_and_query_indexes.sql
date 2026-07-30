create index if not exists participants_left_expiration_idx
on public.participants (left_at)
where member_status = 'left' and purged_at is null;

create index if not exists alliance_reservoir_participants_week_assignment_idx
on public.alliance_reservoir_participants (week_id, assignment);

create or replace function public.get_alliance_participants(target_alliance_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  alliance_role text;
  can_see_private boolean;
  result jsonb;
begin
  alliance_role := public.get_alliance_role(target_alliance_id);
  if alliance_role is null then
    raise exception 'Нет доступа к этому союзному штабу';
  end if;

  can_see_private := alliance_role in ('owner','r5','editor');

  select coalesce(
    jsonb_agg(
      item
      order by case item->>'rank_name'
        when 'Р5' then 5 when 'Р4' then 4 when 'Р3' then 3
        when 'Р2' then 2 when 'Р1' then 1 else 0 end desc,
        lower(item->>'nickname')
    ),
    '[]'::jsonb
  )
  into result
  from (
    select jsonb_build_object(
      'id', p.id,
      'nickname', p.nickname,
      'rank_name', p.rank_name,
      'member_status', p.member_status,
      'birthday', p.birthday,
      'timezone_offset', case when can_see_private then p.timezone_offset else null end,
      'comment', case when can_see_private then p.comment else null end,
      'linked_user_id', case when can_see_private or p.linked_user_id = auth.uid() then p.linked_user_id else null end,
      'account_role', case when can_see_private then m.role else null end,
      'is_twin', case when can_see_private then p.is_twin else null end,
      'primary_participant_id', case when can_see_private then p.primary_participant_id else null end,
      'primary_nickname', case when can_see_private then coalesce(primary_account.nickname, p.primary_nickname) else null end,
      'nickname_history', coalesce(h.history, '[]'::jsonb),
      'joined_on', membership.current_joined_on,
      'membership_periods', coalesce(membership.periods, '[]'::jsonb)
    ) item
    from public.participants p
    left join public.participants primary_account
      on primary_account.id = p.primary_participant_id
     and primary_account.alliance_id = p.alliance_id
    left join public.alliance_members m
      on m.alliance_id = p.alliance_id
     and m.user_id = p.linked_user_id
    left join lateral (
      select jsonb_agg(history.old_nickname order by history.changed_at desc) history
      from public.participant_nickname_history history
      where history.participant_id = p.id
    ) h on true
    left join lateral (
      select
        coalesce(max(mp.joined_on) filter (where mp.left_on is null), max(mp.joined_on)) current_joined_on,
        jsonb_agg(jsonb_build_object('joined_on', mp.joined_on, 'left_on', mp.left_on) order by mp.joined_on) periods
      from public.participant_membership_periods mp
      where mp.participant_id = p.id
        and mp.alliance_id = p.alliance_id
    ) membership on true
    where p.alliance_id = target_alliance_id
      and p.member_status <> 'left'
      and p.purged_at is null
  ) rows_data;

  return result;
end;
$$;

create or replace function public.get_alliance_squad_power(target_alliance_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  alliance_role text;
  season_start date;
  result jsonb;
begin
  alliance_role := public.get_alliance_role(target_alliance_id);
  if alliance_role not in ('owner','r5','editor') then
    raise exception 'Страница силы доступна только Р4, Р5 и владельцу';
  end if;

  select coalesce(a.power_season_start, date_trunc('month', current_date)::date)
  into season_start
  from public.alliances a
  where a.id = target_alliance_id;

  select jsonb_build_object(
    'season_start', season_start,
    'can_manage', true,
    'participants', coalesce(
      jsonb_agg(row_data order by coalesce((row_data->>'latest_power')::numeric, 0) desc, lower(row_data->>'nickname')),
      '[]'::jsonb
    )
  )
  into result
  from (
    select jsonb_build_object(
      'participant_id', p.id,
      'nickname', p.nickname,
      'rank_name', p.rank_name,
      'is_own', p.linked_user_id = auth.uid(),
      'joined_on', membership.joined_on,
      'latest_date', latest.measured_on,
      'latest_missing', latest.id is not null and num_nonnulls(latest.squad_1, latest.squad_2, latest.squad_3, latest.squad_4, latest.squad_5) = 0,
      'latest_power', case when latest.id is null or num_nonnulls(latest.squad_1, latest.squad_2, latest.squad_3, latest.squad_4, latest.squad_5) = 0 then null else coalesce(latest.squad_1, latest.squad_2, latest.squad_3, latest.squad_4, latest.squad_5) end,
      'squad_1', latest.squad_1,
      'squad_2', latest.squad_2,
      'squad_3', latest.squad_3,
      'squad_4', latest.squad_4,
      'squad_5', latest.squad_5,
      'previous_power', case when latest.id is null or num_nonnulls(latest.squad_1, latest.squad_2, latest.squad_3, latest.squad_4, latest.squad_5) = 0 then null else coalesce(history.previous_power, coalesce(latest.squad_1, latest.squad_2, latest.squad_3, latest.squad_4, latest.squad_5), 0) end,
      'week_power', case when latest.id is null or num_nonnulls(latest.squad_1, latest.squad_2, latest.squad_3, latest.squad_4, latest.squad_5) = 0 then null else coalesce(history.week_power, coalesce(latest.squad_1, latest.squad_2, latest.squad_3, latest.squad_4, latest.squad_5), 0) end,
      'month_power', case when latest.id is null or num_nonnulls(latest.squad_1, latest.squad_2, latest.squad_3, latest.squad_4, latest.squad_5) = 0 then null else coalesce(history.month_power, coalesce(latest.squad_1, latest.squad_2, latest.squad_3, latest.squad_4, latest.squad_5), 0) end,
      'season_power', case when latest.id is null or num_nonnulls(latest.squad_1, latest.squad_2, latest.squad_3, latest.squad_4, latest.squad_5) = 0 then null else coalesce(history.season_power, coalesce(latest.squad_1, latest.squad_2, latest.squad_3, latest.squad_4, latest.squad_5), 0) end
    ) row_data
    from public.participants p
    left join lateral (
      select mp.joined_on
      from public.participant_membership_periods mp
      where mp.participant_id = p.id
        and mp.alliance_id = p.alliance_id
        and mp.left_on is null
      order by mp.joined_on desc
      limit 1
    ) membership on true
    left join lateral (
      select m.id, m.measured_on, m.squad_1, m.squad_2, m.squad_3, m.squad_4, m.squad_5
      from public.alliance_squad_power_measurements m
      where m.participant_id = p.id
        and membership.joined_on is not null
        and m.measured_on >= membership.joined_on
      order by m.measured_on desc
      limit 1
    ) latest on true
    left join lateral (
      select
        (array_agg(coalesce(m.squad_1, m.squad_2, m.squad_3, m.squad_4, m.squad_5) order by m.measured_on desc) filter (where m.measured_on < latest.measured_on and m.measured_on >= membership.joined_on and num_nonnulls(m.squad_1, m.squad_2, m.squad_3, m.squad_4, m.squad_5) > 0))[1] previous_power,
        (array_agg(coalesce(m.squad_1, m.squad_2, m.squad_3, m.squad_4, m.squad_5) order by m.measured_on desc) filter (where m.measured_on <= latest.measured_on - 7 and m.measured_on >= membership.joined_on and num_nonnulls(m.squad_1, m.squad_2, m.squad_3, m.squad_4, m.squad_5) > 0))[1] week_power,
        (array_agg(coalesce(m.squad_1, m.squad_2, m.squad_3, m.squad_4, m.squad_5) order by m.measured_on desc) filter (where m.measured_on <= latest.measured_on - 30 and m.measured_on >= membership.joined_on and num_nonnulls(m.squad_1, m.squad_2, m.squad_3, m.squad_4, m.squad_5) > 0))[1] month_power,
        (array_agg(coalesce(m.squad_1, m.squad_2, m.squad_3, m.squad_4, m.squad_5) order by m.measured_on asc) filter (where m.measured_on >= greatest(season_start, membership.joined_on) and m.measured_on <= latest.measured_on and num_nonnulls(m.squad_1, m.squad_2, m.squad_3, m.squad_4, m.squad_5) > 0))[1] season_power
      from public.alliance_squad_power_measurements m
      where m.participant_id = p.id
        and m.measured_on >= membership.joined_on
    ) history on latest.measured_on is not null
    where p.alliance_id = target_alliance_id
      and p.member_status <> 'left'
      and p.purged_at is null
  ) data_rows;

  return result;
end;
$$;

revoke execute on function public.get_alliance_participants(uuid) from public, anon;
revoke execute on function public.get_alliance_squad_power(uuid) from public, anon;
grant execute on function public.get_alliance_participants(uuid) to authenticated;
grant execute on function public.get_alliance_squad_power(uuid) to authenticated;
