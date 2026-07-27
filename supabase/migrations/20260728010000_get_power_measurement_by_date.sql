-- Возвращает замер конкретного игрока за выбранную дату для построчного редактора.

create or replace function public.get_alliance_squad_power_measurement(
  target_alliance_id uuid,
  target_participant_id uuid,
  target_measured_on date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  alliance_role text;
  participant_owner uuid;
  result jsonb;
begin
  if target_measured_on is null then
    raise exception 'Укажи дату замера';
  end if;

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

  if not (
    alliance_role in ('owner', 'editor')
    or participant_owner = auth.uid()
  ) then
    raise exception 'Нет доступа к замеру этого игрока';
  end if;

  select jsonb_build_object(
    'exists', true,
    'measured_on', m.measured_on,
    'missing', num_nonnulls(m.squad_1, m.squad_2, m.squad_3, m.squad_4, m.squad_5) = 0,
    'squad_1', m.squad_1,
    'squad_2', m.squad_2,
    'squad_3', m.squad_3,
    'squad_4', m.squad_4,
    'squad_5', m.squad_5
  )
  into result
  from public.alliance_squad_power_measurements m
  where m.alliance_id = target_alliance_id
    and m.participant_id = target_participant_id
    and m.measured_on = target_measured_on;

  return coalesce(result, jsonb_build_object(
    'exists', false,
    'measured_on', target_measured_on,
    'missing', false,
    'squad_1', null,
    'squad_2', null,
    'squad_3', null,
    'squad_4', null,
    'squad_5', null
  ));
end;
$$;

revoke all on function public.get_alliance_squad_power_measurement(uuid, uuid, date) from public;
revoke all on function public.get_alliance_squad_power_measurement(uuid, uuid, date) from anon;
grant execute on function public.get_alliance_squad_power_measurement(uuid, uuid, date) to authenticated;
