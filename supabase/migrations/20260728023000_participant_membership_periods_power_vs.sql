create table if not exists public.participant_membership_periods (
  id uuid primary key default gen_random_uuid(),
  alliance_id uuid not null references public.alliances(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  joined_on date not null,
  left_on date,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint participant_membership_periods_dates_check
    check (left_on is null or left_on >= joined_on)
);

create unique index if not exists participant_membership_periods_one_open_idx
  on public.participant_membership_periods(participant_id)
  where left_on is null;
create index if not exists participant_membership_periods_lookup_idx
  on public.participant_membership_periods(participant_id, joined_on, left_on);
create index if not exists participant_membership_periods_alliance_idx
  on public.participant_membership_periods(alliance_id, joined_on, left_on);

alter table public.participant_membership_periods enable row level security;
revoke all on table public.participant_membership_periods from public, anon, authenticated;

with inferred as (
  select
    p.id as participant_id,
    p.alliance_id,
    least(
      p.created_at::date,
      coalesce((
        select min(m.measured_on)
        from public.alliance_squad_power_measurements m
        where m.participant_id = p.id
      ), p.created_at::date),
      coalesce((
        select min(r.result_date)
        from public.alliance_vs_results r
        where r.participant_id = p.id
      ), p.created_at::date)
    ) as joined_on,
    case
      when p.member_status = 'left'
        then coalesce(p.left_at::date, p.updated_at::date, current_date)
      else null
    end as raw_left_on,
    p.created_by,
    p.updated_by
  from public.participants p
  where p.purged_at is null
)
insert into public.participant_membership_periods (
  alliance_id,
  participant_id,
  joined_on,
  left_on,
  created_by,
  updated_by
)
select
  i.alliance_id,
  i.participant_id,
  i.joined_on,
  case
    when i.raw_left_on is null then null
    else greatest(i.raw_left_on, i.joined_on)
  end,
  i.created_by,
  i.updated_by
from inferred i
where not exists (
  select 1
  from public.participant_membership_periods mp
  where mp.participant_id = i.participant_id
);

create or replace function public.set_participant_membership_period_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists participant_membership_periods_set_updated_at
  on public.participant_membership_periods;
create trigger participant_membership_periods_set_updated_at
before update on public.participant_membership_periods
for each row execute function public.set_participant_membership_period_updated_at();

create or replace function public.sync_participant_membership_period()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  departure_date date;
begin
  if tg_op = 'INSERT' then
    insert into public.participant_membership_periods (
      alliance_id,
      participant_id,
      joined_on,
      created_by,
      updated_by
    ) values (
      new.alliance_id,
      new.id,
      current_date,
      coalesce(auth.uid(), new.created_by),
      coalesce(auth.uid(), new.updated_by)
    ) on conflict do nothing;
    return new;
  end if;

  if old.member_status <> 'left' and new.member_status = 'left' then
    departure_date := coalesce(new.left_at::date, current_date);
    update public.participant_membership_periods mp
    set left_on = greatest(departure_date, mp.joined_on),
        updated_by = coalesce(auth.uid(), new.updated_by)
    where mp.participant_id = new.id
      and mp.alliance_id = new.alliance_id
      and mp.left_on is null;
  elsif old.member_status = 'left' and new.member_status <> 'left' then
    insert into public.participant_membership_periods (
      alliance_id,
      participant_id,
      joined_on,
      created_by,
      updated_by
    ) values (
      new.alliance_id,
      new.id,
      current_date,
      coalesce(auth.uid(), new.updated_by),
      coalesce(auth.uid(), new.updated_by)
    ) on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists participants_sync_membership_period on public.participants;
create trigger participants_sync_membership_period
after insert or update of member_status on public.participants
for each row execute function public.sync_participant_membership_period();

create or replace function public.participant_is_alliance_member_on(
  target_alliance_id uuid,
  target_participant_id uuid,
  target_date date
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.participant_membership_periods mp
    where mp.alliance_id = target_alliance_id
      and mp.participant_id = target_participant_id
      and target_date >= mp.joined_on
      and (mp.left_on is null or target_date < mp.left_on)
  );
$$;

revoke execute on function public.participant_is_alliance_member_on(uuid, uuid, date)
  from public, anon, authenticated;

create or replace function public.set_alliance_participant_joined_on(
  target_alliance_id uuid,
  target_participant_id uuid,
  target_joined_on date
)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  alliance_role text;
  previous_left_on date;
  saved_date date;
begin
  alliance_role := public.get_alliance_role(target_alliance_id);
  if alliance_role not in ('owner', 'editor') then
    raise exception 'Изменять дату вступления могут только управляющие союза';
  end if;

  if target_joined_on is null or target_joined_on > current_date then
    raise exception 'Дата вступления не может быть пустой или находиться в будущем';
  end if;

  if not exists (
    select 1
    from public.participants p
    where p.id = target_participant_id
      and p.alliance_id = target_alliance_id
      and p.member_status <> 'left'
      and p.purged_at is null
  ) then
    raise exception 'Действующий участник не найден';
  end if;

  select max(mp.left_on)
  into previous_left_on
  from public.participant_membership_periods mp
  where mp.participant_id = target_participant_id
    and mp.alliance_id = target_alliance_id
    and mp.left_on is not null;

  if previous_left_on is not null and target_joined_on < previous_left_on then
    raise exception 'Дата нового вступления не может быть раньше предыдущего выхода';
  end if;

  update public.participant_membership_periods mp
  set joined_on = target_joined_on,
      updated_by = auth.uid()
  where mp.participant_id = target_participant_id
    and mp.alliance_id = target_alliance_id
    and mp.left_on is null
  returning mp.joined_on into saved_date;

  if saved_date is null then
    insert into public.participant_membership_periods (
      alliance_id,
      participant_id,
      joined_on,
      created_by,
      updated_by
    ) values (
      target_alliance_id,
      target_participant_id,
      target_joined_on,
      auth.uid(),
      auth.uid()
    ) returning joined_on into saved_date;
  end if;

  return saved_date;
end;
$$;

revoke execute on function public.set_alliance_participant_joined_on(uuid, uuid, date)
  from public, anon;
grant execute on function public.set_alliance_participant_joined_on(uuid, uuid, date)
  to authenticated;

create or replace function public.validate_power_membership_date()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.participant_is_alliance_member_on(
    new.alliance_id,
    new.participant_id,
    new.measured_on
  ) then
    raise exception 'На выбранную дату игрок не состоял в союзе';
  end if;
  return new;
end;
$$;

drop trigger if exists alliance_squad_power_membership_guard
  on public.alliance_squad_power_measurements;
create trigger alliance_squad_power_membership_guard
before insert or update of alliance_id, participant_id, measured_on
on public.alliance_squad_power_measurements
for each row execute function public.validate_power_membership_date();

create or replace function public.validate_vs_membership_date()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.participant_is_alliance_member_on(
    new.alliance_id,
    new.participant_id,
    new.result_date
  ) then
    raise exception 'На выбранную дату игрок не состоял в союзе';
  end if;
  return new;
end;
$$;

drop trigger if exists alliance_vs_results_membership_guard
  on public.alliance_vs_results;
create trigger alliance_vs_results_membership_guard
before insert or update of alliance_id, participant_id, result_date
on public.alliance_vs_results
for each row execute function public.validate_vs_membership_date();

drop trigger if exists alliance_vs_proposals_membership_guard
  on public.alliance_vs_result_proposals;
create trigger alliance_vs_proposals_membership_guard
before insert or update of alliance_id, participant_id, result_date
on public.alliance_vs_result_proposals
for each row execute function public.validate_vs_membership_date();

create or replace function public.get_alliance_participants(target_alliance_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
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

  can_see_private := alliance_role in ('owner', 'editor');

  select coalesce(jsonb_agg(item order by
    case item->>'rank_name'
      when 'Р5' then 5 when 'Р4' then 4 when 'Р3' then 3
      when 'Р2' then 2 when 'Р1' then 1 else 0
    end desc,
    lower(item->>'nickname')
  ), '[]'::jsonb)
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
      'linked_user_id', case
        when can_see_private or p.linked_user_id = auth.uid() then p.linked_user_id
        else null
      end,
      'account_role', case when can_see_private then m.role else null end,
      'is_twin', case when can_see_private then p.is_twin else null end,
      'primary_participant_id', case when can_see_private then p.primary_participant_id else null end,
      'primary_nickname', case
        when can_see_private then coalesce(primary_account.nickname, p.primary_nickname)
        else null
      end,
      'nickname_history', coalesce(h.history, '[]'::jsonb),
      'joined_on', membership.current_joined_on,
      'membership_periods', coalesce(membership.periods, '[]'::jsonb)
    ) as item
    from public.participants p
    left join public.participants primary_account
      on primary_account.id = p.primary_participant_id
      and primary_account.alliance_id = p.alliance_id
    left join public.alliance_members m
      on m.alliance_id = p.alliance_id
      and m.user_id = p.linked_user_id
    left join lateral (
      select jsonb_agg(history.old_nickname order by history.changed_at desc) as history
      from public.participant_nickname_history history
      where history.participant_id = p.id
    ) h on true
    left join lateral (
      select
        coalesce(
          max(mp.joined_on) filter (where mp.left_on is null),
          max(mp.joined_on)
        ) as current_joined_on,
        jsonb_agg(
          jsonb_build_object('joined_on', mp.joined_on, 'left_on', mp.left_on)
          order by mp.joined_on
        ) as periods
      from public.participant_membership_periods mp
      where mp.participant_id = p.id
        and mp.alliance_id = p.alliance_id
    ) membership on true
    where p.alliance_id = target_alliance_id
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
      'joined_on', membership.joined_on,
      'latest_date', latest.measured_on,
      'latest_missing', latest.id is not null and num_nonnulls(
        latest.squad_1, latest.squad_2, latest.squad_3,
        latest.squad_4, latest.squad_5
      ) = 0,
      'latest_power', case
        when latest.id is null or num_nonnulls(
          latest.squad_1, latest.squad_2, latest.squad_3,
          latest.squad_4, latest.squad_5
        ) = 0 then null
        else coalesce(
          latest.squad_1, latest.squad_2, latest.squad_3,
          latest.squad_4, latest.squad_5
        )
      end,
      'squad_1', latest.squad_1,
      'squad_2', latest.squad_2,
      'squad_3', latest.squad_3,
      'squad_4', latest.squad_4,
      'squad_5', latest.squad_5,
      'previous_power', case
        when latest.id is null or num_nonnulls(
          latest.squad_1, latest.squad_2, latest.squad_3,
          latest.squad_4, latest.squad_5
        ) = 0 then null
        else coalesce(
          history.previous_power,
          coalesce(latest.squad_1, latest.squad_2, latest.squad_3,
                   latest.squad_4, latest.squad_5),
          0
        )
      end,
      'week_power', case
        when latest.id is null or num_nonnulls(
          latest.squad_1, latest.squad_2, latest.squad_3,
          latest.squad_4, latest.squad_5
        ) = 0 then null
        else coalesce(
          history.week_power,
          coalesce(latest.squad_1, latest.squad_2, latest.squad_3,
                   latest.squad_4, latest.squad_5),
          0
        )
      end,
      'month_power', case
        when latest.id is null or num_nonnulls(
          latest.squad_1, latest.squad_2, latest.squad_3,
          latest.squad_4, latest.squad_5
        ) = 0 then null
        else coalesce(
          history.month_power,
          coalesce(latest.squad_1, latest.squad_2, latest.squad_3,
                   latest.squad_4, latest.squad_5),
          0
        )
      end,
      'season_power', case
        when latest.id is null or num_nonnulls(
          latest.squad_1, latest.squad_2, latest.squad_3,
          latest.squad_4, latest.squad_5
        ) = 0 then null
        else coalesce(
          history.season_power,
          coalesce(latest.squad_1, latest.squad_2, latest.squad_3,
                   latest.squad_4, latest.squad_5),
          0
        )
      end
    ) as row_data
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
      select m.*
      from public.alliance_squad_power_measurements m
      where m.participant_id = p.id
        and membership.joined_on is not null
        and m.measured_on >= membership.joined_on
      order by m.measured_on desc
      limit 1
    ) latest on true
    left join lateral (
      select
        (array_agg(
          coalesce(m.squad_1, m.squad_2, m.squad_3, m.squad_4, m.squad_5)
          order by m.measured_on desc
        ) filter (
          where m.measured_on < latest.measured_on
            and m.measured_on >= membership.joined_on
            and num_nonnulls(m.squad_1, m.squad_2, m.squad_3,
                             m.squad_4, m.squad_5) > 0
        ))[1] as previous_power,
        (array_agg(
          coalesce(m.squad_1, m.squad_2, m.squad_3, m.squad_4, m.squad_5)
          order by m.measured_on desc
        ) filter (
          where m.measured_on <= latest.measured_on - 7
            and m.measured_on >= membership.joined_on
            and num_nonnulls(m.squad_1, m.squad_2, m.squad_3,
                             m.squad_4, m.squad_5) > 0
        ))[1] as week_power,
        (array_agg(
          coalesce(m.squad_1, m.squad_2, m.squad_3, m.squad_4, m.squad_5)
          order by m.measured_on desc
        ) filter (
          where m.measured_on <= latest.measured_on - 30
            and m.measured_on >= membership.joined_on
            and num_nonnulls(m.squad_1, m.squad_2, m.squad_3,
                             m.squad_4, m.squad_5) > 0
        ))[1] as month_power,
        (array_agg(
          coalesce(m.squad_1, m.squad_2, m.squad_3, m.squad_4, m.squad_5)
          order by m.measured_on asc
        ) filter (
          where m.measured_on >= greatest(season_start, membership.joined_on)
            and m.measured_on <= latest.measured_on
            and num_nonnulls(m.squad_1, m.squad_2, m.squad_3,
                             m.squad_4, m.squad_5) > 0
        ))[1] as season_power
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

create or replace function public.get_alliance_vs_statistics(
  target_alliance_id uuid,
  target_date_from date,
  target_date_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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

  if target_date_from is null
     or target_date_to is null
     or target_date_to < target_date_from then
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
      with current_participants as (
        select
          p.id as participant_id,
          p.nickname,
          p.rank_name,
          false as historical_only
        from public.participants p
        where p.alliance_id = target_alliance_id
          and p.member_status <> 'left'
          and p.purged_at is null
      ),
      historical_participants as (
        select distinct on (r.participant_id)
          r.participant_id,
          coalesce(r.participant_nickname, 'Удалённый игрок') as nickname,
          coalesce(r.participant_rank, '') as rank_name,
          true as historical_only
        from public.alliance_vs_results r
        where r.alliance_id = target_alliance_id
          and r.result_date between target_date_from and target_date_to
          and not exists (
            select 1
            from current_participants cp
            where cp.participant_id = r.participant_id
          )
        order by r.participant_id, r.result_date desc
      )
      select jsonb_agg(jsonb_build_object(
        'participant_id', rows_data.participant_id,
        'nickname', rows_data.nickname,
        'rank_name', rows_data.rank_name,
        'historical_only', rows_data.historical_only,
        'membership_periods', coalesce((
          select jsonb_agg(
            jsonb_build_object('joined_on', mp.joined_on, 'left_on', mp.left_on)
            order by mp.joined_on
          )
          from public.participant_membership_periods mp
          where mp.participant_id = rows_data.participant_id
            and mp.alliance_id = target_alliance_id
        ), '[]'::jsonb)
      ) order by
        case rows_data.rank_name
          when 'Р5' then 5 when 'Р4' then 4 when 'Р3' then 3
          when 'Р2' then 2 when 'Р1' then 1 else 0
        end desc,
        lower(rows_data.nickname))
      from (
        select * from current_participants
        union all
        select * from historical_participants
      ) rows_data
    ), '[]'::jsonb),
    'results', coalesce((
      select jsonb_agg(jsonb_build_object(
        'participant_id', r.participant_id,
        'participant_nickname', r.participant_nickname,
        'participant_rank', r.participant_rank,
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
$$;
