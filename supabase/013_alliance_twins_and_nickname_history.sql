-- HarvestHub: привязка твинов к основному аккаунту и история никнеймов без дат в интерфейсе.

alter table public.participants
  add column if not exists is_twin boolean not null default false,
  add column if not exists primary_participant_id uuid references public.participants(id) on delete set null,
  add column if not exists primary_nickname text;

alter table public.participants drop constraint if exists participants_primary_nickname_check;
alter table public.participants
  add constraint participants_primary_nickname_check
  check (primary_nickname is null or char_length(trim(primary_nickname)) between 1 and 80);

alter table public.participants drop constraint if exists participants_twin_link_check;
alter table public.participants
  add constraint participants_twin_link_check
  check (
    (not is_twin and primary_participant_id is null and primary_nickname is null)
    or
    (is_twin and ((primary_participant_id is not null) <> (primary_nickname is not null)))
  );

create index if not exists participants_primary_participant_id_idx
  on public.participants (primary_participant_id)
  where primary_participant_id is not null;

-- Закрытые поля состава выдаются управляющим только через проверенную функцию ниже.
revoke select on public.participants from authenticated;
grant select (
  id, alliance_id, nickname, rank_name, squad_power, status,
  birthday, member_status, created_at, updated_at
) on public.participants to authenticated;

create or replace function public.get_alliance_participants(target_alliance_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
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
      'account_role', case when can_see_private then (
        select m.role
        from public.alliance_members m
        where m.alliance_id = p.alliance_id
          and m.user_id = p.linked_user_id
        limit 1
      ) else null end,
      'is_twin', case when can_see_private then p.is_twin else null end,
      'primary_participant_id', case when can_see_private then p.primary_participant_id else null end,
      'primary_nickname', case when can_see_private then coalesce(primary_account.nickname, p.primary_nickname) else null end,
      'nickname_history', coalesce((
        select jsonb_agg(h.old_nickname order by h.changed_at desc)
        from public.participant_nickname_history h
        where h.participant_id = p.id
      ), '[]'::jsonb)
    ) as item
    from public.participants p
    left join public.participants primary_account
      on primary_account.id = p.primary_participant_id
      and primary_account.alliance_id = p.alliance_id
    where p.alliance_id = target_alliance_id
  ) rows_data;

  return result;
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
set search_path = public
as $$
declare
  alliance_role text;
  saved_id uuid;
  current_rank text;
  clean_primary_nickname text;
begin
  alliance_role := public.get_alliance_role(target_alliance_id);
  if alliance_role not in ('owner', 'editor') then
    raise exception 'Редактировать состав могут только управляющие союза';
  end if;

  if trim(coalesce(participant_nickname, '')) = '' then
    raise exception 'Укажи никнейм участника';
  end if;

  clean_primary_nickname := nullif(trim(coalesce(participant_primary_nickname, '')), '');
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
    ) then
      raise exception 'Выбранный основной аккаунт не найден в составе союза';
    end if;
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
      is_twin, primary_participant_id, primary_nickname,
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
      participant_is_twin,
      participant_primary_id,
      clean_primary_nickname,
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
      is_twin = participant_is_twin,
      primary_participant_id = participant_primary_id,
      primary_nickname = clean_primary_nickname,
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

revoke all on function public.save_alliance_participant(uuid, uuid, text, text, text, smallint, date, text, boolean, uuid, text) from public;
grant execute on function public.save_alliance_participant(uuid, uuid, text, text, text, smallint, date, text, boolean, uuid, text) to authenticated;

create or replace function public.open_alliance_by_code(access_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_alliance public.alliances%rowtype;
  participant_list jsonb;
begin
  select * into target_alliance
  from public.alliances
  where invite_code = upper(trim(access_code))
  limit 1;

  if target_alliance.id is null then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'nickname', p.nickname,
    'rank_name', p.rank_name,
    'member_status', p.member_status,
    'birthday', p.birthday,
    'nickname_history', coalesce((
      select jsonb_agg(h.old_nickname order by h.changed_at desc)
      from public.participant_nickname_history h
      where h.participant_id = p.id
    ), '[]'::jsonb)
  ) order by p.nickname), '[]'::jsonb)
  into participant_list
  from public.participants p
  where p.alliance_id = target_alliance.id;

  return jsonb_build_object(
    'alliance', jsonb_build_object(
      'id', target_alliance.id,
      'name', target_alliance.name,
      'state_number', target_alliance.state_number
    ),
    'participants', participant_list
  );
end;
$$;

revoke all on function public.open_alliance_by_code(text) from public;
grant execute on function public.open_alliance_by_code(text) to anon, authenticated;

notify pgrst, 'reload schema';
