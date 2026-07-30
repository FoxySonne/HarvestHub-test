alter table public.alliances
  drop constraint if exists alliances_vs_daily_target_nonnegative_check,
  add constraint alliances_vs_daily_target_nonnegative_check
    check (vs_daily_target >= 0);

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
set search_path = 'public'
as $$
declare
  alliance_role text;
  saved_id uuid;
begin
  alliance_role := public.get_alliance_role(target_alliance_id);
  if alliance_role not in ('owner', 'r5', 'editor') then
    raise exception 'Редактировать статистику VS могут только управляющие союза';
  end if;

  if not exists (
    select 1 from public.participants p
    where p.id = target_participant_id
      and p.alliance_id = target_alliance_id
      and p.member_status <> 'left'
      and p.purged_at is null
  ) then
    raise exception 'Участник не найден';
  end if;

  if target_result_date is null or extract(isodow from target_result_date) not between 1 and 6 then
    raise exception 'Для VS можно выбрать только день с понедельника по субботу';
  end if;

  if target_result_date >= (now() at time zone 'UTC')::date then
    raise exception 'Результат VS можно учитывать только после окончания UTC-дня';
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

create or replace function public.set_alliance_power_season_start(
  target_alliance_id uuid,
  target_start date
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if public.get_alliance_role(target_alliance_id) not in ('owner', 'r5', 'editor') then
    raise exception 'Менять начало сезона могут только управляющие союза';
  end if;

  if target_start is null then
    raise exception 'Укажи дату начала сезона';
  end if;

  if target_start > (now() at time zone 'UTC')::date then
    raise exception 'Начало сезона не может быть в будущем';
  end if;

  update public.alliances
  set power_season_start = target_start
  where id = target_alliance_id;
end;
$$;
