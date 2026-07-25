-- Batch 6: participant archive, nickname normalization and atomic squad power saves.

alter table public.participants
  add column if not exists purged_at timestamptz;

update public.participants
set nickname = btrim(nickname),
    primary_nickname = nullif(btrim(primary_nickname), ''),
    comment = btrim(comment),
    status = case member_status
      when 'main' then 'active'
      when 'reserve' then 'reserve'
      else 'inactive'
    end
where nickname is distinct from btrim(nickname)
   or primary_nickname is distinct from nullif(btrim(primary_nickname), '')
   or comment is distinct from btrim(comment)
   or status is distinct from case member_status
      when 'main' then 'active'
      when 'reserve' then 'reserve'
      else 'inactive'
    end;

alter table public.participants
  drop constraint if exists participants_alliance_id_nickname_key;

drop index if exists public.participants_alliance_id_nickname_key;

create unique index if not exists participants_active_nickname_normalized_key
  on public.participants (alliance_id, lower(btrim(nickname)))
  where member_status <> 'left' and purged_at is null;

drop index if exists public.participants_left_nickname_lookup_idx;
create index if not exists participants_left_nickname_lookup_idx
  on public.participants (alliance_id, lower(btrim(nickname)), left_at desc)
  where member_status = 'left' and purged_at is null;

alter table public.participants
  drop constraint if exists participants_nickname_trimmed_check;
alter table public.participants
  add constraint participants_nickname_trimmed_check
  check (nickname = btrim(nickname));

alter table public.participants
  drop constraint if exists participants_rank_name_check;
alter table public.participants
  add constraint participants_rank_name_check
  check (rank_name in ('', 'Р1', 'Р2', 'Р3', 'Р4', 'Р5'));

create or replace function public.normalize_participant_record()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.nickname := btrim(new.nickname);
  new.comment := btrim(coalesce(new.comment, ''));
  new.rank_name := btrim(coalesce(new.rank_name, ''));
  new.primary_nickname := nullif(btrim(coalesce(new.primary_nickname, '')), '');
  new.status := case new.member_status
    when 'main' then 'active'
    when 'reserve' then 'reserve'
    else 'inactive'
  end;
  return new;
end;
$$;

drop trigger if exists participants_00_normalize_record on public.participants;
create trigger participants_00_normalize_record
before insert or update of nickname, comment, rank_name, primary_nickname, member_status
on public.participants
for each row execute function public.normalize_participant_record();

create or replace function public.record_participant_nickname_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.purged_at is null and old.nickname is distinct from new.nickname then
    insert into public.participant_nickname_history (
      participant_id, alliance_id, old_nickname, new_nickname, changed_by
    ) values (
      new.id, new.alliance_id, old.nickname, new.nickname, auth.uid()
    );
  end if;
  return new;
end;
$$;

create or replace function public.prepare_participant_departure()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.member_status <> 'left' and new.member_status = 'left' then
    new.left_at := coalesce(new.left_at, now());
    new.member_status_before_left := old.member_status;

    update public.participants twin
    set primary_nickname = old.nickname,
        primary_participant_id = null,
        updated_by = coalesce(auth.uid(), twin.updated_by)
    where twin.primary_participant_id = old.id;
  elsif old.member_status = 'left' and new.member_status <> 'left' then
    new.left_at := null;
    new.member_status_before_left := null;
    new.purged_at := null;
  end if;
  return new;
end;
$$;

alter table public.alliance_vs_results
  add column if not exists participant_nickname text,
  add column if not exists participant_rank text;

alter table public.alliance_vs_result_proposals
  add column if not exists participant_nickname text,
  add column if not exists participant_rank text;

alter table public.alliance_reservoir_participants
  add column if not exists participant_nickname text,
  add column if not exists participant_rank text;

update public.alliance_vs_results r
set participant_nickname = p.nickname,
    participant_rank = p.rank_name
from public.participants p
where p.id = r.participant_id
  and (r.participant_nickname is null or r.participant_rank is null);

update public.alliance_vs_result_proposals q
set participant_nickname = p.nickname,
    participant_rank = p.rank_name
from public.participants p
where p.id = q.participant_id
  and (q.participant_nickname is null or q.participant_rank is null);

update public.alliance_reservoir_participants rp
set participant_nickname = p.nickname,
    participant_rank = p.rank_name
from public.participants p
where p.id = rp.participant_id
  and (rp.participant_nickname is null or rp.participant_rank is null);

create or replace function public.fill_participant_snapshot()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  snapshot_nickname text;
  snapshot_rank text;
begin
  select p.nickname, p.rank_name
  into snapshot_nickname, snapshot_rank
  from public.participants p
  where p.id = new.participant_id;

  if snapshot_nickname is null then
    raise exception 'Участник для исторической записи не найден.' using errcode = '23503';
  end if;

  new.participant_nickname := coalesce(new.participant_nickname, snapshot_nickname);
  new.participant_rank := coalesce(new.participant_rank, snapshot_rank);
  return new;
end;
$$;

drop trigger if exists alliance_vs_results_fill_snapshot on public.alliance_vs_results;
create trigger alliance_vs_results_fill_snapshot
before insert or update of participant_id
on public.alliance_vs_results
for each row execute function public.fill_participant_snapshot();

drop trigger if exists alliance_vs_proposals_fill_snapshot on public.alliance_vs_result_proposals;
create trigger alliance_vs_proposals_fill_snapshot
before insert or update of participant_id
on public.alliance_vs_result_proposals
for each row execute function public.fill_participant_snapshot();

drop trigger if exists reservoir_participants_fill_snapshot on public.alliance_reservoir_participants;
create trigger reservoir_participants_fill_snapshot
before insert or update of participant_id
on public.alliance_reservoir_participants
for each row execute function public.fill_participant_snapshot();

create or replace function public.purge_expired_alliance_participants()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target record;
  purged_count integer := 0;
begin
  for target in
    select p.id, p.alliance_id, p.nickname, p.linked_user_id
    from public.participants p
    where p.member_status = 'left'
      and p.purged_at is null
      and p.left_at <= now() - interval '60 days'
    order by p.left_at
    for update skip locked
  loop
    update public.participants twin
    set primary_nickname = target.nickname,
        primary_participant_id = null,
        updated_by = twin.updated_by
    where twin.primary_participant_id = target.id;

    if target.linked_user_id is not null
       and not exists (
         select 1
         from public.participants active_p
         where active_p.alliance_id = target.alliance_id
           and active_p.linked_user_id = target.linked_user_id
           and active_p.member_status <> 'left'
           and active_p.id <> target.id
       ) then
      delete from public.alliance_members m
      where m.alliance_id = target.alliance_id
        and m.user_id = target.linked_user_id
        and m.role <> 'owner';
    end if;

    delete from public.alliance_squad_power_measurements
    where participant_id = target.id;

    delete from public.participant_nickname_history
    where participant_id = target.id;

    update public.participants p
    set nickname = 'Удалённый игрок ' || left(p.id::text, 8),
        rank_name = '',
        squad_power = 0,
        status = 'inactive',
        comment = '',
        timezone_offset = null,
        birthday = null,
        linked_user_id = null,
        is_twin = false,
        primary_participant_id = null,
        primary_nickname = null,
        member_status_before_left = null,
        purged_at = now(),
        updated_by = null
    where p.id = target.id;

    purged_count := purged_count + 1;
  end loop;

  return purged_count;
end;
$$;

revoke execute on function public.purge_expired_alliance_participants() from public, anon, authenticated;

do $$
declare
  existing_job_id bigint;
begin
  select j.jobid
  into existing_job_id
  from cron.job j
  where j.command like '%participants%'
    and j.command like '%60 days%'
  order by j.jobid
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  if not exists (
    select 1 from cron.job j
    where j.command = 'select public.purge_expired_alliance_participants()'
  ) then
    perform cron.schedule(
      'purge-expired-alliance-participants',
      '20 3 * * *',
      'select public.purge_expired_alliance_participants()'
    );
  end if;
end;
$$;

create or replace function public.find_recent_departed_participant(
  target_alliance_id uuid,
  target_nickname text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  alliance_role text;
  result jsonb;
begin
  alliance_role := public.get_alliance_role(target_alliance_id);
  if alliance_role not in ('owner', 'editor') then
    raise exception 'Проверять архив могут только управляющие союза';
  end if;

  if btrim(coalesce(target_nickname, '')) = '' then
    return null;
  end if;

  select jsonb_build_object('id', p.id, 'nickname', p.nickname)
  into result
  from public.participants p
  where p.alliance_id = target_alliance_id
    and p.member_status = 'left'
    and p.purged_at is null
    and p.left_at > now() - interval '60 days'
    and lower(btrim(p.nickname)) = lower(btrim(target_nickname))
  order by p.left_at desc
  limit 1;

  return result;
end;
$$;

create or replace function public.restore_alliance_participant(
  target_alliance_id uuid,
  target_participant_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  alliance_role text;
  departed_rank text;
  departed_nickname text;
  saved_id uuid;
begin
  alliance_role := public.get_alliance_role(target_alliance_id);
  if alliance_role not in ('owner', 'editor') then
    raise exception 'Восстанавливать участников могут только управляющие союза';
  end if;

  select p.rank_name, p.nickname
  into departed_rank, departed_nickname
  from public.participants p
  where p.id = target_participant_id
    and p.alliance_id = target_alliance_id
    and p.member_status = 'left'
    and p.purged_at is null
    and p.left_at > now() - interval '60 days'
  for update;

  if not found then
    raise exception 'Срок хранения участника истёк или запись не найдена';
  end if;

  if exists (
    select 1
    from public.participants p
    where p.alliance_id = target_alliance_id
      and p.member_status <> 'left'
      and lower(btrim(p.nickname)) = lower(btrim(departed_nickname))
      and p.id <> target_participant_id
  ) then
    raise exception 'В составе уже есть активный участник с таким никнеймом';
  end if;

  if departed_rank = 'Р5' and exists (
    select 1
    from public.participants p
    where p.alliance_id = target_alliance_id
      and p.member_status <> 'left'
      and p.rank_name = 'Р5'
      and p.id <> target_participant_id
  ) then
    raise exception 'Нельзя восстановить прежнего Р5, пока в союзе уже назначен другой Р5';
  end if;

  update public.participants
  set member_status = coalesce(member_status_before_left, 'main'),
      updated_by = auth.uid()
  where id = target_participant_id
    and alliance_id = target_alliance_id
  returning id into saved_id;

  return saved_id;
end;
$$;

create or replace function public.mark_alliance_participant_left(
  target_alliance_id uuid,
  target_participant_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  alliance_role text;
  saved_id uuid;
  linked_id uuid;
  participant_rank text;
begin
  alliance_role := public.get_alliance_role(target_alliance_id);
  if alliance_role not in ('owner', 'editor') then
    raise exception 'Изменять состав могут только управляющие союза';
  end if;

  select p.linked_user_id, p.rank_name
  into linked_id, participant_rank
  from public.participants p
  where p.id = target_participant_id
    and p.alliance_id = target_alliance_id
    and p.member_status <> 'left'
  for update;

  if not found then
    raise exception 'Участник не найден в составе союза';
  end if;

  if participant_rank = 'Р5' then
    raise exception 'Сначала назначь другого Р5';
  end if;

  if linked_id is not null and exists (
    select 1
    from public.alliance_members m
    where m.alliance_id = target_alliance_id
      and m.user_id = linked_id
      and m.role = 'owner'
  ) then
    raise exception 'Владелец должен передать штаб перед выходом из состава';
  end if;

  update public.participants
  set member_status = 'left',
      linked_user_id = null,
      updated_by = auth.uid()
  where id = target_participant_id
    and alliance_id = target_alliance_id
  returning id into saved_id;

  if linked_id is not null and not exists (
    select 1
    from public.participants p
    where p.alliance_id = target_alliance_id
      and p.linked_user_id = linked_id
      and p.member_status <> 'left'
  ) then
    delete from public.alliance_members m
    where m.alliance_id = target_alliance_id
      and m.user_id = linked_id
      and m.role <> 'owner';
  end if;

  return saved_id;
end;
$$;

drop function if exists public.save_alliance_participant(
  uuid, uuid, text, text, text, smallint, date, text
);

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
set search_path = ''
as $$
declare
  alliance_role text;
  saved_id uuid;
  current_rank text;
  clean_nickname text := btrim(coalesce(participant_nickname, ''));
  clean_primary_nickname text;
begin
  alliance_role := public.get_alliance_role(target_alliance_id);
  if alliance_role not in ('owner', 'editor') then
    raise exception 'Редактировать состав могут только управляющие союза';
  end if;

  if clean_nickname = '' or char_length(clean_nickname) > 80 then
    raise exception 'Никнейм должен содержать от 1 до 80 символов';
  end if;

  if coalesce(participant_rank, '') not in ('', 'Р1', 'Р2', 'Р3', 'Р4', 'Р5') then
    raise exception 'Некорректный ранг участника';
  end if;

  if coalesce(participant_status, 'main') not in ('main', 'reserve', 'inactive') then
    raise exception 'Некорректный статус участника';
  end if;

  if participant_timezone is not null and participant_timezone not between -12 and 12 then
    raise exception 'Часовой пояс должен быть от -12 до +12';
  end if;

  if char_length(coalesce(participant_comment, '')) > 1000 then
    raise exception 'Комментарий не должен быть длиннее 1000 символов';
  end if;

  clean_primary_nickname := nullif(btrim(coalesce(participant_primary_nickname, '')), '');
  participant_is_twin := coalesce(participant_is_twin, false);

  if not participant_is_twin then
    participant_primary_id := null;
    clean_primary_nickname := null;
  elsif (participant_primary_id is null) = (clean_primary_nickname is null) then
    raise exception 'Для твина выбери основной аккаунт или укажи его никнейм';
  end if;

  if participant_primary_id is not null then
    if participant_primary_id = participant_id then
      raise exception 'Аккаунт не может быть основой для самого себя';
    end if;
    if not exists (
      select 1
      from public.participants p
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
    where p.id = participant_id
      and p.alliance_id = target_alliance_id
      and p.purged_at is null;
  end if;

  if coalesce(participant_rank, '') = 'Р5'
     and coalesce(current_rank, '') <> 'Р5' then
    raise exception 'Назначай нового Р5 в разделе «Управление союзом»';
  end if;

  if coalesce(current_rank, '') = 'Р5'
     and coalesce(participant_rank, '') <> 'Р5' then
    raise exception 'Передавай ранг Р5 в разделе «Управление союзом»';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(target_alliance_id::text || ':' || lower(clean_nickname), 0)
  );

  if exists (
    select 1
    from public.participants p
    where p.alliance_id = target_alliance_id
      and p.purged_at is null
      and (
        p.member_status <> 'left'
        or (p.member_status = 'left' and p.left_at > now() - interval '60 days')
      )
      and lower(btrim(p.nickname)) = lower(clean_nickname)
      and p.id is distinct from participant_id
  ) then
    raise exception 'Участник с таким никнеймом уже существует или доступен для восстановления';
  end if;

  if participant_id is null then
    insert into public.participants (
      alliance_id, nickname, rank_name, member_status,
      timezone_offset, birthday, comment, status, squad_power,
      is_twin, primary_participant_id, primary_nickname,
      created_by, updated_by
    ) values (
      target_alliance_id,
      clean_nickname,
      coalesce(participant_rank, ''),
      coalesce(participant_status, 'main'),
      participant_timezone,
      participant_birthday,
      coalesce(participant_comment, ''),
      'active',
      0,
      participant_is_twin,
      participant_primary_id,
      clean_primary_nickname,
      auth.uid(),
      auth.uid()
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
    where id = participant_id
      and alliance_id = target_alliance_id
      and purged_at is null
    returning id into saved_id;
  end if;

  if saved_id is null then
    raise exception 'Участник не найден';
  end if;

  return saved_id;
end;
$$;

alter table public.alliance_squad_power_measurements
  alter column squad_1 drop not null;

alter table public.alliance_squad_power_measurements
  drop constraint if exists alliance_squad_power_measurements_has_value_check;
alter table public.alliance_squad_power_measurements
  add constraint alliance_squad_power_measurements_has_value_check
  check (num_nonnulls(squad_1, squad_2, squad_3, squad_4, squad_5) >= 1);

drop index if exists public.alliance_squad_power_participant_date_idx;

create or replace function public.validate_squad_power_measurement()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.measured_on > current_date then
    raise exception 'Нельзя сохранить замер силы на будущую дату';
  end if;
  if new.measured_on < current_date - 3650 then
    raise exception 'Дата замера находится слишком далеко в прошлом';
  end if;
  if greatest(
    coalesce(new.squad_1, 0),
    coalesce(new.squad_2, 0),
    coalesce(new.squad_3, 0),
    coalesce(new.squad_4, 0),
    coalesce(new.squad_5, 0)
  ) > 1000000 then
    raise exception 'Сила отряда превышает допустимое значение';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_squad_power_measurement_trigger
  on public.alliance_squad_power_measurements;
create trigger validate_squad_power_measurement_trigger
before insert or update
on public.alliance_squad_power_measurements
for each row execute function public.validate_squad_power_measurement();

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

  if num_nonnulls(target_squad_1, target_squad_2, target_squad_3, target_squad_4, target_squad_5) = 0 then
    raise exception 'Укажи силу хотя бы одного отряда';
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

create or replace function public.save_alliance_squad_power_batch(
  target_alliance_id uuid,
  target_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  alliance_role text;
  item record;
  saved_ids uuid[] := '{}';
begin
  alliance_role := public.get_alliance_role(target_alliance_id);
  if alliance_role not in ('owner', 'editor') then
    raise exception 'Общий ввод силы доступен только управляющим союза';
  end if;

  if jsonb_typeof(coalesce(target_rows, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(target_rows, '[]'::jsonb)) = 0 then
    raise exception 'Передан пустой список замеров';
  end if;

  if jsonb_array_length(target_rows) > 200 then
    raise exception 'За один раз можно сохранить не больше 200 замеров';
  end if;

  for item in
    select *
    from jsonb_to_recordset(target_rows) as x(
      participant_id uuid,
      measured_on date,
      squad_1 numeric,
      squad_2 numeric,
      squad_3 numeric,
      squad_4 numeric,
      squad_5 numeric
    )
  loop
    saved_ids := array_append(saved_ids, public.save_alliance_squad_power(
      target_alliance_id,
      item.participant_id,
      item.measured_on,
      item.squad_1,
      item.squad_2,
      item.squad_3,
      item.squad_4,
      item.squad_5
    ));
  end loop;

  return jsonb_build_object(
    'saved', true,
    'count', cardinality(saved_ids),
    'ids', to_jsonb(saved_ids)
  );
end;
$$;

revoke execute on function public.save_alliance_squad_power_batch(uuid, jsonb)
  from public, anon;
grant execute on function public.save_alliance_squad_power_batch(uuid, jsonb)
  to authenticated;

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
      'latest_power', coalesce(latest.squad_1, latest.squad_2, latest.squad_3, latest.squad_4, latest.squad_5, 0),
      'squad_1', latest.squad_1,
      'squad_2', latest.squad_2,
      'squad_3', latest.squad_3,
      'squad_4', latest.squad_4,
      'squad_5', latest.squad_5,
      'previous_power', coalesce(history.previous_power, coalesce(latest.squad_1, latest.squad_2, latest.squad_3, latest.squad_4, latest.squad_5), 0),
      'week_power', coalesce(history.week_power, coalesce(latest.squad_1, latest.squad_2, latest.squad_3, latest.squad_4, latest.squad_5), 0),
      'month_power', coalesce(history.month_power, coalesce(latest.squad_1, latest.squad_2, latest.squad_3, latest.squad_4, latest.squad_5), 0),
      'season_power', coalesce(history.season_power, coalesce(latest.squad_1, latest.squad_2, latest.squad_3, latest.squad_4, latest.squad_5), 0)
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
          filter (where m.measured_on < latest.measured_on))[1] as previous_power,
        (array_agg(coalesce(m.squad_1, m.squad_2, m.squad_3, m.squad_4, m.squad_5)
          order by m.measured_on desc)
          filter (where m.measured_on <= latest.measured_on - 7))[1] as week_power,
        (array_agg(coalesce(m.squad_1, m.squad_2, m.squad_3, m.squad_4, m.squad_5)
          order by m.measured_on desc)
          filter (where m.measured_on <= latest.measured_on - 30))[1] as month_power,
        (array_agg(coalesce(m.squad_1, m.squad_2, m.squad_3, m.squad_4, m.squad_5)
          order by m.measured_on asc)
          filter (where m.measured_on >= season_start and m.measured_on <= latest.measured_on))[1] as season_power
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
      when 'Р5' then 5 when 'Р4' then 4 when 'Р3' then 3 when 'Р2' then 2 when 'Р1' then 1 else 0 end desc,
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
      'primary_nickname', case when can_see_private then coalesce(primary_account.nickname, p.primary_nickname) else null end,
      'nickname_history', coalesce(h.history, '[]'::jsonb)
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
    where p.alliance_id = target_alliance_id
      and p.purged_at is null
  ) rows_data;

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

  if target_date_from is null or target_date_to is null or target_date_to < target_date_from then
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
        'historical_only', rows_data.historical_only
      ) order by
        case rows_data.rank_name
          when 'Р5' then 5 when 'Р4' then 4 when 'Р3' then 3
          when 'Р2' then 2 when 'Р1' then 1 else 0 end desc,
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
