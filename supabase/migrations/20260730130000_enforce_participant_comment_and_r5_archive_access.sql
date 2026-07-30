alter table public.participants
  drop constraint if exists participants_comment_length_check,
  add constraint participants_comment_length_check
    check (char_length(comment) <= 500);

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
  if alliance_role not in ('owner', 'r5', 'editor') then
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
  if alliance_role not in ('owner', 'r5', 'editor') then
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
      and p.purged_at is null
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
      and p.purged_at is null
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
  if alliance_role not in ('owner', 'r5', 'editor') then
    raise exception 'Редактировать состав могут только Р4, Р5 и владелец';
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
  if char_length(coalesce(participant_comment, '')) > 500 then
    raise exception 'Комментарий не должен быть длиннее 500 символов';
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
    where p.id = participant_id
      and p.alliance_id = target_alliance_id
      and p.purged_at is null;
  end if;

  if coalesce(participant_rank, '') = 'Р5' and coalesce(current_rank, '') <> 'Р5' then
    raise exception 'Назначай нового Р5 в разделе «Управление союзом»';
  end if;
  if coalesce(current_rank, '') = 'Р5' and coalesce(participant_rank, '') <> 'Р5' then
    raise exception 'Передавай ранг Р5 в разделе «Управление союзом»';
  end if;

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
    where id = participant_id
      and alliance_id = target_alliance_id
      and purged_at is null
    returning id into saved_id;
  end if;

  if saved_id is null then raise exception 'Участник не найден'; end if;
  return saved_id;
end;
$$;
