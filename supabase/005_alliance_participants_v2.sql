-- HarvestHub: единый состав союза, приватные поля и история никнеймов.
-- Выполни файл целиком в Supabase → SQL Editor.

alter table public.participants
  add column if not exists timezone_offset smallint,
  add column if not exists birthday date,
  add column if not exists member_status text not null default 'main',
  add column if not exists linked_user_id uuid references auth.users(id) on delete set null;

alter table public.participants drop constraint if exists participants_member_status_check;
alter table public.participants
  add constraint participants_member_status_check
  check (member_status in ('main', 'reserve', 'inactive', 'left'));

create table if not exists public.participant_nickname_history (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  alliance_id uuid not null references public.alliances(id) on delete cascade,
  old_nickname text not null,
  new_nickname text not null,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

alter table public.participant_nickname_history enable row level security;

drop policy if exists "nickname_history_select_members" on public.participant_nickname_history;
create policy "nickname_history_select_members"
on public.participant_nickname_history for select
to authenticated
using (public.is_alliance_member(alliance_id));

grant select on public.participant_nickname_history to authenticated;

create or replace function public.record_participant_nickname_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.nickname is distinct from new.nickname then
    insert into public.participant_nickname_history (
      participant_id, alliance_id, old_nickname, new_nickname, changed_by
    ) values (
      new.id, new.alliance_id, old.nickname, new.nickname, auth.uid()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists participants_record_nickname_change on public.participants;
create trigger participants_record_nickname_change
before update of nickname on public.participants
for each row execute function public.record_participant_nickname_change();

create or replace function public.get_alliance_participants(target_alliance_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  current_role text;
  can_see_private boolean;
  result jsonb;
begin
  current_role := public.get_alliance_role(target_alliance_id);
  if current_role is null then
    raise exception 'Нет доступа к этому союзному штабу';
  end if;

  can_see_private := current_role in ('owner', 'editor');

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
      'linked_user_id', case when can_see_private then p.linked_user_id else null end,
      'nickname_history', coalesce((
        select jsonb_agg(jsonb_build_object(
          'old_nickname', h.old_nickname,
          'new_nickname', h.new_nickname,
          'changed_at', h.changed_at
        ) order by h.changed_at desc)
        from public.participant_nickname_history h
        where h.participant_id = p.id
      ), '[]'::jsonb)
    ) as item
    from public.participants p
    where p.alliance_id = target_alliance_id
  ) rows_data;

  return result;
end;
$$;

revoke all on function public.get_alliance_participants(uuid) from public;
grant execute on function public.get_alliance_participants(uuid) to authenticated;

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
  current_role text;
  saved_id uuid;
begin
  current_role := public.get_alliance_role(target_alliance_id);
  if current_role not in ('owner', 'editor') then
    raise exception 'Редактировать состав могут только управляющие союза';
  end if;

  if trim(coalesce(participant_nickname, '')) = '' then
    raise exception 'Укажи никнейм участника';
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
      target_alliance_id, trim(participant_nickname), coalesce(participant_rank, ''),
      coalesce(participant_status, 'main'), participant_timezone, participant_birthday,
      coalesce(participant_comment, ''), 'active', 0, auth.uid(), auth.uid()
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
    where id = participant_id and alliance_id = target_alliance_id
    returning id into saved_id;
  end if;

  if saved_id is null then raise exception 'Участник не найден'; end if;
  return saved_id;
end;
$$;

revoke all on function public.save_alliance_participant(uuid, uuid, text, text, text, smallint, date, text) from public;
grant execute on function public.save_alliance_participant(uuid, uuid, text, text, text, smallint, date, text) to authenticated;

-- Гостевой просмотр: без часового пояса и комментариев.
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
      select jsonb_agg(jsonb_build_object(
        'old_nickname', h.old_nickname,
        'new_nickname', h.new_nickname,
        'changed_at', h.changed_at
      ) order by h.changed_at desc)
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
