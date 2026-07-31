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

  if not found then raise exception 'Участник не найден'; end if;

  if alliance_role not in ('owner', 'r5', 'editor')
     and participant_owner is distinct from auth.uid() then
    raise exception 'Можно вводить данные только своих отрядов';
  end if;

  if target_measured_on is null then raise exception 'Укажи дату замера'; end if;
  if target_measured_on > current_date then raise exception 'Нельзя сохранить замер силы на будущую дату'; end if;

  if least(
    coalesce(target_squad_1, 0), coalesce(target_squad_2, 0),
    coalesce(target_squad_3, 0), coalesce(target_squad_4, 0),
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

create or replace function public.save_alliance_participant_bundle(
  target_alliance_id uuid,
  participant_id uuid,
  participant_nickname text,
  participant_rank text,
  participant_status text,
  participant_timezone smallint,
  participant_birthday date,
  participant_comment text,
  participant_is_twin boolean,
  participant_primary_id uuid,
  participant_primary_nickname text,
  participant_joined_on date,
  participant_squad_1 numeric,
  restore_existing boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_id uuid;
begin
  if coalesce(restore_existing, false) then
    if participant_id is null then raise exception 'Не указан участник для восстановления'; end if;
    saved_id := public.restore_alliance_participant(target_alliance_id, participant_id);
  else
    saved_id := public.save_alliance_participant(
      target_alliance_id,
      participant_id,
      participant_nickname,
      participant_rank,
      participant_status,
      participant_timezone,
      participant_birthday,
      participant_comment,
      participant_is_twin,
      participant_primary_id,
      participant_primary_nickname
    );
  end if;

  perform public.set_alliance_participant_joined_on(
    target_alliance_id,
    saved_id,
    participant_joined_on
  );

  if participant_squad_1 is not null then
    perform public.save_alliance_squad_power(
      target_alliance_id,
      saved_id,
      current_date,
      participant_squad_1,
      null, null, null, null
    );
  end if;

  return saved_id;
end;
$$;

revoke execute on function public.save_alliance_squad_power(uuid, uuid, date, numeric, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.save_alliance_squad_power(uuid, uuid, date, numeric, numeric, numeric, numeric, numeric) to authenticated;

revoke execute on function public.save_alliance_participant_bundle(uuid, uuid, text, text, text, smallint, date, text, boolean, uuid, text, date, numeric, boolean) from public, anon;
grant execute on function public.save_alliance_participant_bundle(uuid, uuid, text, text, text, smallint, date, text, boolean, uuid, text, date, numeric, boolean) to authenticated;