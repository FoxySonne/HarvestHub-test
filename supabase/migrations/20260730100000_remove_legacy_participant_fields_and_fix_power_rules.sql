create or replace function public.save_alliance_participant(
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
  participant_primary_nickname text
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  alliance_role text;
  saved_id uuid;
  current_rank text;
  clean_nickname text := btrim(coalesce(participant_nickname, ''));
  clean_primary_nickname text;
begin
  alliance_role := public.get_alliance_role(target_alliance_id);
  if alliance_role not in ('owner', 'r5', 'editor') then
    raise exception 'Редактировать состав могут только Р4, Р5 и владелец';
  end if;

  if clean_nickname = '' or char_length(clean_nickname) > 80 then raise exception 'Никнейм должен содержать от 1 до 80 символов'; end if;
  if coalesce(participant_rank, '') not in ('', 'Р1', 'Р2', 'Р3', 'Р4', 'Р5') then raise exception 'Некорректный ранг участника'; end if;
  if coalesce(participant_status, 'main') not in ('main', 'reserve', 'inactive') then raise exception 'Некорректный статус участника'; end if;
  if participant_timezone is not null and participant_timezone not between -12 and 12 then raise exception 'Часовой пояс должен быть от -12 до +12'; end if;
  if char_length(coalesce(participant_comment, '')) > 1000 then raise exception 'Комментарий не должен быть длиннее 1000 символов'; end if;

  clean_primary_nickname := nullif(btrim(coalesce(participant_primary_nickname, '')), '');
  participant_is_twin := coalesce(participant_is_twin, false);
  if not participant_is_twin then
    participant_primary_id := null;
    clean_primary_nickname := null;
  elsif (participant_primary_id is null) = (clean_primary_nickname is null) then
    raise exception 'Для твина выбери основной аккаунт или укажи его никнейм';
  end if;

  if participant_primary_id is not null then
    if participant_primary_id = participant_id then raise exception 'Аккаунт не может быть основой для самого себя'; end if;
    if not exists (
      select 1 from public.participants p
      where p.id = participant_primary_id
        and p.alliance_id = target_alliance_id
        and p.member_status <> 'left'
        and not p.is_twin
        and p.purged_at is null
    ) then
      raise exception 'Основой твина может быть только действующий основной аккаунт';
    end if;
  end if;

  if participant_id is not null then
    select p.rank_name into current_rank
    from public.participants p
    where p.id = participant_id and p.alliance_id = target_alliance_id and p.purged_at is null;
  end if;

  if coalesce(participant_rank, '') = 'Р5' and coalesce(current_rank, '') <> 'Р5' then raise exception 'Назначай нового Р5 в разделе «Управление союзом»'; end if;
  if coalesce(current_rank, '') = 'Р5' and coalesce(participant_rank, '') <> 'Р5' then raise exception 'Передавай ранг Р5 в разделе «Управление союзом»'; end if;

  perform pg_advisory_xact_lock(hashtextextended(target_alliance_id::text || ':' || lower(clean_nickname), 0));

  if exists (
    select 1 from public.participants p
    where p.alliance_id = target_alliance_id
      and p.purged_at is null
      and (p.member_status <> 'left' or (p.member_status = 'left' and p.left_at > now() - interval '60 days'))
      and lower(btrim(p.nickname)) = lower(clean_nickname)
      and p.id is distinct from participant_id
  ) then
    raise exception 'Участник с таким никнеймом уже существует или доступен для восстановления';
  end if;

  if participant_id is null then
    insert into public.participants (
      alliance_id, nickname, rank_name, member_status,
      timezone_offset, birthday, comment,
      is_twin, primary_participant_id, primary_nickname,
      created_by, updated_by
    ) values (
      target_alliance_id, clean_nickname, coalesce(participant_rank, ''),
      coalesce(participant_status, 'main'), participant_timezone,
      participant_birthday, coalesce(participant_comment, ''),
      participant_is_twin, participant_primary_id, clean_primary_nickname,
      auth.uid(), auth.uid()
    ) returning id into saved_id;
  else
    update public.participants set
      nickname = clean_nickname,
      rank_name = coalesce(participant_rank, ''),
      member_status = coalesce(participant_status, 'main'),
      timezone_offset = participant_timezone,
      birthday = participant_birthday,
      comment = coalesce(participant_comment, ''),
      is_twin = participant_is_twin,
      primary_participant_id = participant_primary_id,
      primary_nickname = clean_primary_nickname,
      updated_by = auth.uid()
    where id = participant_id and alliance_id = target_alliance_id and purged_at is null
    returning id into saved_id;
  end if;

  if saved_id is null then raise exception 'Участник не найден'; end if;
  return saved_id;
end;
$$;

create or replace function public.purge_expired_alliance_participants()
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  target record;
  purged_count integer := 0;
begin
  for target in
    select p.id, p.alliance_id, p.nickname, p.linked_user_id
    from public.participants p
    where p.member_status = 'left' and p.purged_at is null and p.left_at <= now() - interval '60 days'
    order by p.left_at
    for update skip locked
  loop
    update public.participants twin
    set primary_nickname = target.nickname, primary_participant_id = null
    where twin.primary_participant_id = target.id;

    if target.linked_user_id is not null and not exists (
      select 1 from public.participants active_p
      where active_p.alliance_id = target.alliance_id
        and active_p.linked_user_id = target.linked_user_id
        and active_p.member_status <> 'left'
        and active_p.id <> target.id
    ) then
      delete from public.alliance_members m
      where m.alliance_id = target.alliance_id and m.user_id = target.linked_user_id and m.role <> 'owner';
    end if;

    delete from public.alliance_squad_power_measurements where participant_id = target.id;
    delete from public.participant_nickname_history where participant_id = target.id;

    update public.participants p
    set nickname = 'Удалённый игрок ' || left(p.id::text, 8),
        rank_name = '', comment = '', timezone_offset = null, birthday = null,
        linked_user_id = null, is_twin = false, primary_participant_id = null,
        primary_nickname = null, member_status_before_left = null,
        purged_at = now(), updated_by = null
    where p.id = target.id;

    purged_count := purged_count + 1;
  end loop;
  return purged_count;
end;
$$;

create or replace function public.validate_squad_power_measurement()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if new.measured_on > current_date then raise exception 'Нельзя сохранить замер силы на будущую дату'; end if;
  if new.measured_on < current_date - 3650 then raise exception 'Дата замера находится слишком далеко в прошлом'; end if;
  if (new.squad_1 is not null and new.squad_1 <= 0)
     or (new.squad_2 is not null and new.squad_2 <= 0)
     or (new.squad_3 is not null and new.squad_3 <= 0)
     or (new.squad_4 is not null and new.squad_4 <= 0)
     or (new.squad_5 is not null and new.squad_5 <= 0) then
    raise exception 'Сила отряда должна быть больше нуля. Для неизвестного значения используй прочерк';
  end if;
  return new;
end;
$$;

alter table public.alliance_squad_power_measurements
  drop constraint if exists alliance_squad_power_measurements_squad_1_check,
  drop constraint if exists alliance_squad_power_measurements_squad_2_check,
  drop constraint if exists alliance_squad_power_measurements_squad_3_check,
  drop constraint if exists alliance_squad_power_measurements_squad_4_check,
  drop constraint if exists alliance_squad_power_measurements_squad_5_check;

alter table public.alliance_squad_power_measurements
  add constraint alliance_squad_power_measurements_squad_1_check check (squad_1 is null or squad_1 > 0),
  add constraint alliance_squad_power_measurements_squad_2_check check (squad_2 is null or squad_2 > 0),
  add constraint alliance_squad_power_measurements_squad_3_check check (squad_3 is null or squad_3 > 0),
  add constraint alliance_squad_power_measurements_squad_4_check check (squad_4 is null or squad_4 > 0),
  add constraint alliance_squad_power_measurements_squad_5_check check (squad_5 is null or squad_5 > 0);

alter table public.participants
  drop constraint if exists participants_status_check,
  drop constraint if exists participants_squad_power_check,
  drop column if exists status,
  drop column if exists squad_power;

revoke execute on function public.save_alliance_participant(uuid,uuid,text,text,text,smallint,date,text,boolean,uuid,text) from public, anon;
grant execute on function public.save_alliance_participant(uuid,uuid,text,text,text,smallint,date,text,boolean,uuid,text) to authenticated;
revoke execute on function public.purge_expired_alliance_participants() from public, anon, authenticated;
