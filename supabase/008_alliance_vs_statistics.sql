-- HarvestHub: статистика VS союза.
-- Неделя VS длится с понедельника по субботу.
-- Очки хранятся целым числом; отпуск отмечается отдельно.
-- Файл можно выполнять повторно.

alter table public.alliances
  add column if not exists vs_daily_target numeric(24,0) not null default 5000000;

create table if not exists public.alliance_vs_results (
  id uuid primary key default gen_random_uuid(),
  alliance_id uuid not null references public.alliances(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  result_date date not null,
  points numeric(24,0),
  is_vacation boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (participant_id, result_date),
  check (extract(isodow from result_date) between 1 and 6),
  check (points is null or points >= 0),
  check (not is_vacation or points is null)
);

create index if not exists alliance_vs_results_alliance_date_idx
  on public.alliance_vs_results (alliance_id, result_date);
create index if not exists alliance_vs_results_participant_date_idx
  on public.alliance_vs_results (participant_id, result_date);

alter table public.alliance_vs_results enable row level security;

drop policy if exists "vs_results_select_members" on public.alliance_vs_results;
create policy "vs_results_select_members"
on public.alliance_vs_results for select
to authenticated
using (public.is_alliance_member(alliance_id));

grant select on public.alliance_vs_results to authenticated;

create or replace function public.get_alliance_vs_statistics(
  target_alliance_id uuid,
  target_date_from date,
  target_date_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  alliance_role text;
  daily_target numeric;
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

  select a.vs_daily_target into daily_target
  from public.alliances a
  where a.id = target_alliance_id;

  select jsonb_build_object(
    'daily_target', daily_target,
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
$$;

revoke all on function public.get_alliance_vs_statistics(uuid, date, date) from public;
grant execute on function public.get_alliance_vs_statistics(uuid, date, date) to authenticated;

create or replace function public.save_alliance_vs_result(
  target_alliance_id uuid,
  target_participant_id uuid,
  target_result_date date,
  target_points numeric,
  target_is_vacation boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  alliance_role text;
  saved_id uuid;
begin
  alliance_role := public.get_alliance_role(target_alliance_id);
  if alliance_role not in ('owner', 'editor') then
    raise exception 'Редактировать статистику VS могут только управляющие союза';
  end if;

  if not exists (
    select 1 from public.participants p
    where p.id = target_participant_id
      and p.alliance_id = target_alliance_id
      and p.member_status <> 'left'
  ) then
    raise exception 'Участник не найден';
  end if;

  if target_result_date is null or extract(isodow from target_result_date) not between 1 and 6 then
    raise exception 'Для VS можно выбрать только день с понедельника по субботу';
  end if;

  if coalesce(target_is_vacation, false) = false and target_points is null then
    raise exception 'Укажи количество очков или отметь отпуск';
  end if;

  if target_points is not null and target_points < 0 then
    raise exception 'Количество очков не может быть отрицательным';
  end if;

  insert into public.alliance_vs_results (
    alliance_id, participant_id, result_date, points, is_vacation,
    created_by, updated_by
  ) values (
    target_alliance_id,
    target_participant_id,
    target_result_date,
    case when coalesce(target_is_vacation, false) then null else round(target_points) end,
    coalesce(target_is_vacation, false),
    auth.uid(), auth.uid()
  )
  on conflict (participant_id, result_date) do update set
    points = excluded.points,
    is_vacation = excluded.is_vacation,
    updated_by = auth.uid(),
    updated_at = now()
  returning id into saved_id;

  return saved_id;
end;
$$;

revoke all on function public.save_alliance_vs_result(uuid, uuid, date, numeric, boolean) from public;
grant execute on function public.save_alliance_vs_result(uuid, uuid, date, numeric, boolean) to authenticated;

create or replace function public.set_alliance_vs_daily_target(
  target_alliance_id uuid,
  target_daily_target numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_alliance_role(target_alliance_id) not in ('owner', 'editor') then
    raise exception 'Менять норматив могут только управляющие союза';
  end if;

  if target_daily_target is null or target_daily_target <= 0 then
    raise exception 'Норматив должен быть больше нуля';
  end if;

  update public.alliances
  set vs_daily_target = round(target_daily_target)
  where id = target_alliance_id;
end;
$$;

revoke all on function public.set_alliance_vs_daily_target(uuid, numeric) from public;
grant execute on function public.set_alliance_vs_daily_target(uuid, numeric) to authenticated;

notify pgrst, 'reload schema';
