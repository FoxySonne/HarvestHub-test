-- HarvestHub: таблица силы отрядов.
-- БМ хранится в миллионах с дробной частью, например 87.72.
-- 1-й отряд обязателен, 2–5-й могут быть не указаны.
-- Файл можно выполнять повторно.

alter table public.alliances
  add column if not exists power_season_start date;

create table if not exists public.alliance_squad_power_measurements (
  id uuid primary key default gen_random_uuid(),
  alliance_id uuid not null references public.alliances(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  measured_on date not null default current_date,
  squad_1 numeric(12,3) not null check (squad_1 >= 0),
  squad_2 numeric(12,3) check (squad_2 is null or squad_2 >= 0),
  squad_3 numeric(12,3) check (squad_3 is null or squad_3 >= 0),
  squad_4 numeric(12,3) check (squad_4 is null or squad_4 >= 0),
  squad_5 numeric(12,3) check (squad_5 is null or squad_5 >= 0),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (participant_id, measured_on)
);

alter table public.alliance_squad_power_measurements
  alter column squad_1 type numeric(12,3) using squad_1::numeric,
  alter column squad_2 type numeric(12,3) using squad_2::numeric,
  alter column squad_3 type numeric(12,3) using squad_3::numeric,
  alter column squad_4 type numeric(12,3) using squad_4::numeric,
  alter column squad_5 type numeric(12,3) using squad_5::numeric,
  alter column squad_1 drop default,
  alter column squad_2 drop default,
  alter column squad_3 drop default,
  alter column squad_4 drop default,
  alter column squad_5 drop default,
  alter column squad_1 set not null,
  alter column squad_2 drop not null,
  alter column squad_3 drop not null,
  alter column squad_4 drop not null,
  alter column squad_5 drop not null;

create index if not exists alliance_squad_power_alliance_date_idx
  on public.alliance_squad_power_measurements (alliance_id, measured_on desc);
create index if not exists alliance_squad_power_participant_date_idx
  on public.alliance_squad_power_measurements (participant_id, measured_on desc);

alter table public.alliance_squad_power_measurements enable row level security;

drop policy if exists "squad_power_select_members" on public.alliance_squad_power_measurements;
create policy "squad_power_select_members"
on public.alliance_squad_power_measurements for select
to authenticated
using (public.is_alliance_member(alliance_id));

grant select on public.alliance_squad_power_measurements to authenticated;

drop function if exists public.save_alliance_squad_power(uuid, uuid, date, bigint, bigint, bigint, bigint, bigint);
drop function if exists public.save_alliance_squad_power(uuid, uuid, date, numeric, numeric, numeric, numeric, numeric);

create function public.save_alliance_squad_power(
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
set search_path = public
as $$
declare
  alliance_role text;
  participant_owner uuid;
  saved_id uuid;
begin
  alliance_role := public.get_alliance_role(target_alliance_id);

  select p.linked_user_id into participant_owner
  from public.participants p
  where p.id = target_participant_id
    and p.alliance_id = target_alliance_id;

  if alliance_role not in ('owner', 'editor')
     and participant_owner is distinct from auth.uid() then
    raise exception 'Можно вводить данные только своих отрядов';
  end if;

  if target_measured_on is null then
    raise exception 'Укажи дату замера';
  end if;

  if target_squad_1 is null then
    raise exception 'Укажи силу 1-го отряда';
  end if;

  if target_squad_1 < 0
     or (target_squad_2 is not null and target_squad_2 < 0)
     or (target_squad_3 is not null and target_squad_3 < 0)
     or (target_squad_4 is not null and target_squad_4 < 0)
     or (target_squad_5 is not null and target_squad_5 < 0) then
    raise exception 'Сила отряда не может быть отрицательной';
  end if;

  insert into public.alliance_squad_power_measurements (
    alliance_id, participant_id, measured_on,
    squad_1, squad_2, squad_3, squad_4, squad_5,
    created_by, updated_by
  ) values (
    target_alliance_id, target_participant_id, target_measured_on,
    round(target_squad_1, 3),
    case when target_squad_2 is null then null else round(target_squad_2, 3) end,
    case when target_squad_3 is null then null else round(target_squad_3, 3) end,
    case when target_squad_4 is null then null else round(target_squad_4, 3) end,
    case when target_squad_5 is null then null else round(target_squad_5, 3) end,
    auth.uid(), auth.uid()
  )
  on conflict (participant_id, measured_on) do update set
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

revoke all on function public.save_alliance_squad_power(uuid, uuid, date, numeric, numeric, numeric, numeric, numeric) from public;
grant execute on function public.save_alliance_squad_power(uuid, uuid, date, numeric, numeric, numeric, numeric, numeric) to authenticated;

create or replace function public.get_alliance_squad_power(target_alliance_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
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
      'latest_power', coalesce(latest.squad_1, 0),
      'squad_1', latest.squad_1,
      'squad_2', latest.squad_2,
      'squad_3', latest.squad_3,
      'squad_4', latest.squad_4,
      'squad_5', latest.squad_5,
      'previous_power', coalesce(previous.squad_1, latest.squad_1, 0),
      'week_power', coalesce(week_old.squad_1, latest.squad_1, 0),
      'month_power', coalesce(month_old.squad_1, latest.squad_1, 0),
      'season_power', coalesce(season_old.squad_1, latest.squad_1, 0)
    ) as row_data
    from public.participants p
    left join lateral (
      select m.* from public.alliance_squad_power_measurements m
      where m.participant_id = p.id
      order by m.measured_on desc limit 1
    ) latest on true
    left join lateral (
      select m.* from public.alliance_squad_power_measurements m
      where m.participant_id = p.id
        and (latest.measured_on is null or m.measured_on < latest.measured_on)
      order by m.measured_on desc limit 1
    ) previous on true
    left join lateral (
      select m.* from public.alliance_squad_power_measurements m
      where m.participant_id = p.id
        and m.measured_on <= current_date - 7
      order by m.measured_on desc limit 1
    ) week_old on true
    left join lateral (
      select m.* from public.alliance_squad_power_measurements m
      where m.participant_id = p.id
        and m.measured_on <= current_date - 30
      order by m.measured_on desc limit 1
    ) month_old on true
    left join lateral (
      select m.* from public.alliance_squad_power_measurements m
      where m.participant_id = p.id
        and m.measured_on >= season_start
      order by m.measured_on asc limit 1
    ) season_old on true
    where p.alliance_id = target_alliance_id
      and p.member_status <> 'left'
  ) data_rows;

  return result;
end;
$$;

revoke all on function public.get_alliance_squad_power(uuid) from public;
grant execute on function public.get_alliance_squad_power(uuid) to authenticated;

create or replace function public.set_alliance_power_season_start(
  target_alliance_id uuid,
  target_start date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_alliance_role(target_alliance_id) not in ('owner', 'editor') then
    raise exception 'Менять начало сезона могут только управляющие союза';
  end if;

  update public.alliances
  set power_season_start = target_start
  where id = target_alliance_id;
end;
$$;

revoke all on function public.set_alliance_power_season_start(uuid, date) from public;
grant execute on function public.set_alliance_power_season_start(uuid, date) to authenticated;

notify pgrst, 'reload schema';
