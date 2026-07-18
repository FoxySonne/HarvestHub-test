-- HarvestHub: ранг Р5 меняется только через отдельную передачу прав.
-- Обычная форма состава может редактировать остальные данные действующего Р5,
-- но не назначать и не снимать этот ранг.

create or replace function public.save_alliance_participant(
  target_alliance_id uuid,
  participant_id uuid,
  participant_nickname text,
  participant_rank text,
  participant_status text,
  participant_timezone smallint,
  participant_birthday date,
  participant_comment text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  alliance_role text;
  saved_id uuid;
  current_rank text;
begin
  alliance_role := public.get_alliance_role(target_alliance_id);
  if alliance_role not in ('owner', 'editor') then
    raise exception 'Редактировать состав могут только управляющие союза';
  end if;

  if trim(coalesce(participant_nickname, '')) = '' then
    raise exception 'Укажи никнейм участника';
  end if;

  if participant_id is not null then
    select p.rank_name into current_rank
    from public.participants p
    where p.id = participant_id
      and p.alliance_id = target_alliance_id;
  end if;

  if coalesce(participant_rank, '') = 'Р5'
     and coalesce(current_rank, '') <> 'Р5' then
    raise exception 'Назначай нового Р5 в разделе «Управление союзом»';
  end if;

  if coalesce(current_rank, '') = 'Р5'
     and coalesce(participant_rank, '') <> 'Р5' then
    raise exception 'Передавай ранг Р5 в разделе «Управление союзом»';
  end if;

  if exists (
    select 1 from public.participants p
    where p.alliance_id = target_alliance_id
      and lower(trim(p.nickname)) = lower(trim(participant_nickname))
      and p.id is distinct from participant_id
  ) then
    raise exception 'Участник с таким никнеймом уже существует';
  end if;

  if participant_id is null then
    insert into public.participants (
      alliance_id, nickname, rank_name, member_status,
      timezone_offset, birthday, comment, status, squad_power,
      created_by, updated_by
    ) values (
      target_alliance_id,
      trim(participant_nickname),
      coalesce(participant_rank, ''),
      coalesce(participant_status, 'main'),
      participant_timezone,
      participant_birthday,
      coalesce(participant_comment, ''),
      'active',
      0,
      auth.uid(),
      auth.uid()
    ) returning id into saved_id;
  else
    update public.participants set
      nickname = trim(participant_nickname),
      rank_name = coalesce(participant_rank, ''),
      member_status = coalesce(participant_status, 'main'),
      timezone_offset = participant_timezone,
      birthday = participant_birthday,
      comment = coalesce(participant_comment, ''),
      updated_by = auth.uid()
    where id = participant_id
      and alliance_id = target_alliance_id
    returning id into saved_id;
  end if;

  if saved_id is null then
    raise exception 'Участник не найден';
  end if;

  return saved_id;
end;
$$;

revoke all on function public.save_alliance_participant(uuid, uuid, text, text, text, smallint, date, text) from public;
grant execute on function public.save_alliance_participant(uuid, uuid, text, text, text, smallint, date, text) to authenticated;

notify pgrst, 'reload schema';
