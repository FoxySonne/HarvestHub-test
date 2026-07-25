
-- Batch 7: centralized alliance roles, atomic VS updates and reservoir activity writes.

alter table public.alliance_members
  drop constraint if exists alliance_members_role_check;
alter table public.alliance_members
  add constraint alliance_members_role_check
  check (role in ('owner', 'r5', 'editor', 'viewer'));

update public.alliance_members m
set role = 'r5'
from public.participants p
where p.alliance_id = m.alliance_id
  and p.linked_user_id = m.user_id
  and p.rank_name = 'Р5'
  and p.member_status <> 'left'
  and m.role <> 'owner';

create or replace function public.get_alliance_role(target_alliance_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (
      select 1 from public.alliance_members m
      where m.alliance_id = target_alliance_id
        and m.user_id = auth.uid()
        and m.role = 'owner'
    ) then 'owner'
    when exists (
      select 1
      from public.participants p
      where p.alliance_id = target_alliance_id
        and p.linked_user_id = auth.uid()
        and p.rank_name = 'Р5'
        and p.member_status <> 'left'
        and p.purged_at is null
    ) then 'r5'
    when exists (
      select 1
      from public.alliance_members m
      where m.alliance_id = target_alliance_id
        and m.user_id = auth.uid()
        and m.role = 'editor'
    ) or exists (
      select 1
      from public.participants p
      where p.alliance_id = target_alliance_id
        and p.linked_user_id = auth.uid()
        and p.rank_name = 'Р4'
        and p.member_status <> 'left'
        and p.purged_at is null
    ) then 'editor'
    when exists (
      select 1
      from public.alliance_members m
      where m.alliance_id = target_alliance_id
        and m.user_id = auth.uid()
    ) then 'viewer'
    else null
  end;
$$;

create or replace function public.can_manage_alliance_roles(target_alliance_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.get_alliance_role(target_alliance_id) in ('owner', 'r5');
$$;

create or replace function public.can_edit_alliance(target_alliance_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.get_alliance_role(target_alliance_id) in ('owner', 'r5', 'editor');
$$;

revoke execute on function public.can_edit_alliance(uuid) from public, anon;
grant execute on function public.can_edit_alliance(uuid) to authenticated;

create or replace function public.get_my_alliance_hubs_v2()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'alliance_id', m.alliance_id,
        'role', public.get_alliance_role(m.alliance_id),
        'effective_role', public.get_alliance_role(m.alliance_id),
        'stored_role', m.role,
        'is_r5', public.get_alliance_role(m.alliance_id) = 'r5',
        'alliances', jsonb_build_object(
          'id', a.id,
          'name', a.name,
          'state_number', a.state_number,
          'invite_code', a.invite_code
        )
      )
      order by m.joined_at asc
    ),
    '[]'::jsonb
  )
  from public.alliance_members m
  join public.alliances a on a.id = m.alliance_id
  where m.user_id = auth.uid();
$$;

create or replace function public.link_alliance_participant_account(
  target_alliance_id uuid,
  target_participant_id uuid,
  target_email text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
  account_birthday date;
  account_timezone integer;
  participant_rank text;
  initial_role text;
begin
  if not public.can_manage_alliance_roles(target_alliance_id) then
    raise exception 'Связывать аккаунты могут только владелец штаба и Р5';
  end if;

  select
    u.id,
    case when coalesce(u.raw_user_meta_data->>'birthday', '') ~ '^\d{4}-\d{2}-\d{2}$'
      then (u.raw_user_meta_data->>'birthday')::date else null end,
    case when coalesce(u.raw_user_meta_data->>'timezone_offset', '') ~ '^-?\d+$'
      and (u.raw_user_meta_data->>'timezone_offset')::integer between -12 and 12
      then (u.raw_user_meta_data->>'timezone_offset')::integer else null end
  into target_user_id, account_birthday, account_timezone
  from auth.users u
  where lower(u.email) = lower(btrim(target_email))
  limit 1;

  if target_user_id is null then
    raise exception 'Аккаунт с таким email не найден';
  end if;

  select p.rank_name
  into participant_rank
  from public.participants p
  where p.id = target_participant_id
    and p.alliance_id = target_alliance_id
    and p.member_status <> 'left'
    and p.purged_at is null
  for update;

  if not found then
    raise exception 'Участник не найден';
  end if;

  if exists (
    select 1 from public.participants p
    where p.alliance_id = target_alliance_id
      and p.linked_user_id = target_user_id
      and p.id <> target_participant_id
      and p.member_status <> 'left'
      and p.purged_at is null
  ) then
    raise exception 'Этот аккаунт уже связан с другим участником союза';
  end if;

  update public.participants
  set linked_user_id = target_user_id,
      birthday = coalesce(account_birthday, birthday),
      timezone_offset = coalesce(account_timezone, timezone_offset),
      updated_by = auth.uid()
  where id = target_participant_id
    and alliance_id = target_alliance_id;

  initial_role := case
    when participant_rank = 'Р5' then 'r5'
    when participant_rank = 'Р4' then 'editor'
    else 'viewer'
  end;

  insert into public.alliance_members (alliance_id, user_id, role)
  values (target_alliance_id, target_user_id, initial_role)
  on conflict (alliance_id, user_id) do update
    set role = case
      when public.alliance_members.role = 'owner' then 'owner'
      else excluded.role
    end;

  return target_user_id;
end;
$$;

create or replace function public.set_alliance_member_role(
  target_alliance_id uuid,
  target_user_id uuid,
  target_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_alliance_roles(target_alliance_id) then
    raise exception 'Назначать роли могут только владелец штаба и Р5';
  end if;

  if target_role not in ('editor', 'viewer') then
    raise exception 'Можно назначить только редактора или наблюдателя';
  end if;

  if exists (
    select 1 from public.alliance_members m
    where m.alliance_id = target_alliance_id
      and m.user_id = target_user_id
      and m.role in ('owner', 'r5')
  ) then
    raise exception 'Права владельца и Р5 меняются только через передачу роли';
  end if;

  insert into public.alliance_members (alliance_id, user_id, role)
  values (target_alliance_id, target_user_id, target_role)
  on conflict (alliance_id, user_id) do update set role = excluded.role;
end;
$$;

create or replace function public.transfer_alliance_r5(
  target_alliance_id uuid,
  target_participant_id uuid,
  previous_r5_role text default 'editor'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text;
  old_r5 record;
  new_r5 record;
begin
  caller_role := public.get_alliance_role(target_alliance_id);
  if caller_role not in ('owner', 'r5') then
    raise exception 'Назначать Р5 могут только владелец штаба и действующий Р5';
  end if;

  if previous_r5_role not in ('editor', 'viewer') then
    raise exception 'Прежний Р5 может остаться редактором или наблюдателем';
  end if;

  perform 1 from public.alliances a
  where a.id = target_alliance_id
  for update;

  select p.id, p.linked_user_id
  into old_r5
  from public.participants p
  where p.alliance_id = target_alliance_id
    and p.rank_name = 'Р5'
    and p.member_status <> 'left'
    and p.purged_at is null
  limit 1
  for update;

  select p.id, p.linked_user_id
  into new_r5
  from public.participants p
  where p.id = target_participant_id
    and p.alliance_id = target_alliance_id
    and p.member_status <> 'left'
    and p.purged_at is null
  for update;

  if new_r5.id is null then
    raise exception 'Новый Р5 не найден';
  end if;
  if new_r5.linked_user_id is null then
    raise exception 'Сначала свяжи нового Р5 с зарегистрированным аккаунтом';
  end if;
  if exists (
    select 1 from public.alliance_members m
    where m.alliance_id = target_alliance_id
      and m.user_id = new_r5.linked_user_id
      and m.role = 'owner'
  ) then
    raise exception 'Владелец штаба не может быть назначен отдельным Р5';
  end if;

  if old_r5.id is not null and old_r5.id <> new_r5.id then
    update public.participants
    set rank_name = 'Р4', updated_by = auth.uid()
    where id = old_r5.id;

    if old_r5.linked_user_id is not null
       and not exists (
         select 1 from public.alliance_members m
         where m.alliance_id = target_alliance_id
           and m.user_id = old_r5.linked_user_id
           and m.role = 'owner'
       ) then
      update public.alliance_members
      set role = previous_r5_role
      where alliance_id = target_alliance_id
        and user_id = old_r5.linked_user_id;
    end if;
  end if;

  update public.participants
  set rank_name = 'Р5', updated_by = auth.uid()
  where id = new_r5.id;

  insert into public.alliance_members (alliance_id, user_id, role)
  values (target_alliance_id, new_r5.linked_user_id, 'r5')
  on conflict (alliance_id, user_id) do update
    set role = case
      when public.alliance_members.role = 'owner' then 'owner'
      else 'r5'
    end;
end;
$$;

create or replace function public.transfer_alliance_owner(
  target_alliance_id uuid,
  target_user_id uuid,
  previous_owner_role text default 'editor'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner_id uuid;
  current_owner_is_r5 boolean;
begin
  if auth.uid() is null or not public.is_actual_alliance_owner(target_alliance_id) then
    raise exception 'Передать штаб может только текущий владелец';
  end if;
  if previous_owner_role not in ('editor', 'viewer') then
    raise exception 'Прежний владелец может остаться редактором или наблюдателем';
  end if;

  perform 1 from public.alliances a
  where a.id = target_alliance_id
  for update;
  if not found then raise exception 'Союз не найден'; end if;

  select m.user_id
  into current_owner_id
  from public.alliance_members m
  where m.alliance_id = target_alliance_id
    and m.role = 'owner'
  for update;

  if current_owner_id is null then raise exception 'Текущий владелец не найден'; end if;
  if target_user_id = current_owner_id then return; end if;

  if not exists (
    select 1 from public.participants p
    where p.alliance_id = target_alliance_id
      and p.linked_user_id = target_user_id
      and p.member_status <> 'left'
      and p.purged_at is null
  ) then
    raise exception 'Новый владелец должен быть связан с действующим участником союза';
  end if;

  select exists (
    select 1 from public.participants p
    where p.alliance_id = target_alliance_id
      and p.linked_user_id = current_owner_id
      and p.rank_name = 'Р5'
      and p.member_status <> 'left'
      and p.purged_at is null
  ) into current_owner_is_r5;

  update public.alliance_members
  set role = case when current_owner_is_r5 then 'r5' else previous_owner_role end
  where alliance_id = target_alliance_id
    and user_id = current_owner_id;

  update public.alliance_members
  set role = 'owner'
  where alliance_id = target_alliance_id
    and user_id = target_user_id;

  update public.alliances
  set created_by = target_user_id
  where id = target_alliance_id;
end;
$$;

create or replace function private.can_access_reservoir(target_alliance_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and public.get_alliance_role(target_alliance_id) in ('owner', 'r5', 'editor');
$$;

create or replace function private.can_override_reservoir_lock(target_alliance_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and public.get_alliance_role(target_alliance_id) in ('owner', 'r5');
$$;

create or replace function public.delete_alliance_vs_result(
  target_alliance_id uuid,
  target_participant_id uuid,
  target_result_date date
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_edit_alliance(target_alliance_id) then
    raise exception 'Удалять результаты VS могут только Р4, Р5 и владелец';
  end if;

  delete from public.alliance_vs_results r
  where r.alliance_id = target_alliance_id
    and r.participant_id = target_participant_id
    and r.result_date = target_result_date;

  return found;
end;
$$;

create or replace function public.save_alliance_vs_results_batch(
  target_alliance_id uuid,
  target_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item record;
  changed_count integer := 0;
begin
  if not public.can_edit_alliance(target_alliance_id) then
    raise exception 'Редактировать VS могут только Р4, Р5 и владелец';
  end if;
  if jsonb_typeof(coalesce(target_rows, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(target_rows, '[]'::jsonb)) = 0 then
    raise exception 'Передан пустой список изменений';
  end if;
  if jsonb_array_length(target_rows) > 500 then
    raise exception 'За один раз можно сохранить не больше 500 изменений';
  end if;

  for item in
    select * from jsonb_to_recordset(target_rows) as x(
      participant_id uuid,
      result_date date,
      points numeric,
      is_vacation boolean,
      delete_result boolean
    )
  loop
    if coalesce(item.delete_result, false) then
      perform public.delete_alliance_vs_result(
        target_alliance_id, item.participant_id, item.result_date
      );
    else
      perform public.save_alliance_vs_result(
        target_alliance_id, item.participant_id, item.result_date,
        item.points, coalesce(item.is_vacation, false)
      );
    end if;
    changed_count := changed_count + 1;
  end loop;

  return jsonb_build_object('saved', true, 'count', changed_count);
end;
$$;

revoke execute on function public.delete_alliance_vs_result(uuid,uuid,date) from public, anon;
revoke execute on function public.save_alliance_vs_results_batch(uuid,jsonb) from public, anon;
grant execute on function public.delete_alliance_vs_result(uuid,uuid,date) to authenticated;
grant execute on function public.save_alliance_vs_results_batch(uuid,jsonb) to authenticated;

create or replace function public.get_or_create_reservoir_week(
  target_alliance_id uuid,
  target_event_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  week_row public.alliance_reservoir_weeks%rowtype;
begin
  if not public.can_edit_alliance(target_alliance_id) then
    raise exception 'Раздел активности доступен только Р4, Р5 и владельцу';
  end if;
  if target_event_date is null
     or extract(isodow from target_event_date) <> 7 then
    raise exception 'Дата события должна приходиться на воскресенье';
  end if;

  insert into public.alliance_reservoir_weeks (
    alliance_id, event_date, event_hour_msk, created_by, updated_by
  ) values (
    target_alliance_id, target_event_date, 14, auth.uid(), auth.uid()
  )
  on conflict (alliance_id, event_date) do update
    set updated_at = public.alliance_reservoir_weeks.updated_at
  returning * into week_row;

  return to_jsonb(week_row);
end;
$$;

create or replace function public.save_reservoir_week_roster(
  target_week_id uuid,
  target_event_hour_msk smallint,
  target_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  week_row public.alliance_reservoir_weeks%rowtype;
  caller_role text;
  item record;
  main_count integer := 0;
  reserve_count integer := 0;
  event_at timestamp;
begin
  select * into week_row
  from public.alliance_reservoir_weeks w
  where w.id = target_week_id
  for update;

  if not found then raise exception 'Неделя резервуара не найдена'; end if;

  caller_role := public.get_alliance_role(week_row.alliance_id);
  if caller_role not in ('owner', 'r5', 'editor') then
    raise exception 'Сохранять активность могут только Р4, Р5 и владелец';
  end if;

  if target_event_hour_msk not in (6, 14, 22) then
    raise exception 'Допустимое время события: 06:00, 14:00 или 22:00 МСК';
  end if;

  if week_row.closed_at is not null
     and caller_role not in ('owner', 'r5') then
    raise exception 'Закрытую неделю меняют только владелец и Р5';
  end if;

  event_at := week_row.event_date::timestamp
    + make_interval(hours => week_row.event_hour_msk);

  if week_row.roster_saved_at is not null
     and (now() at time zone 'Europe/Moscow') >= event_at
     and caller_role not in ('owner', 'r5') then
    raise exception 'После начала события состав меняют только владелец и Р5';
  end if;

  if week_row.roster_saved_at is not null
     and target_event_hour_msk is distinct from week_row.event_hour_msk
     and caller_role not in ('owner', 'r5') then
    raise exception 'После сохранения состава время меняют только владелец и Р5';
  end if;

  if jsonb_typeof(coalesce(target_rows, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(target_rows, '[]'::jsonb)) > 200 then
    raise exception 'Некорректный список участников';
  end if;

  for item in
    select * from jsonb_to_recordset(coalesce(target_rows, '[]'::jsonb)) as x(
      participant_id uuid,
      time_match boolean,
      intent text,
      assignment text,
      attendance text,
      comment text,
      preferred_assignment text
    )
  loop
    if item.assignment = 'main' then main_count := main_count + 1; end if;
    if item.assignment = 'reserve' then reserve_count := reserve_count + 1; end if;

    insert into public.alliance_reservoir_participants (
      week_id, participant_id, time_match, intent, assignment,
      attendance, comment, preferred_assignment, updated_by
    ) values (
      target_week_id, item.participant_id, item.time_match, item.intent,
      coalesce(item.assignment, 'none'), item.attendance,
      left(coalesce(item.comment, ''), 1000),
      item.preferred_assignment, auth.uid()
    )
    on conflict (week_id, participant_id) do update set
      time_match = excluded.time_match,
      intent = excluded.intent,
      assignment = excluded.assignment,
      attendance = excluded.attendance,
      comment = excluded.comment,
      preferred_assignment = excluded.preferred_assignment,
      updated_by = auth.uid(),
      updated_at = now();
  end loop;

  if main_count > 30 or reserve_count > 10 then
    raise exception 'В основе может быть не больше 30 участников, в резерве — не больше 10';
  end if;

  update public.alliance_reservoir_weeks
  set event_hour_msk = target_event_hour_msk,
      roster_saved_at = now(),
      updated_by = auth.uid()
  where id = target_week_id
  returning * into week_row;

  return to_jsonb(week_row);
end;
$$;

create or replace function public.close_reservoir_week(target_week_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  week_row public.alliance_reservoir_weeks%rowtype;
begin
  select * into week_row
  from public.alliance_reservoir_weeks w
  where w.id = target_week_id
  for update;

  if not found then raise exception 'Неделя резервуара не найдена'; end if;
  if public.get_alliance_role(week_row.alliance_id) not in ('owner','r5','editor') then
    raise exception 'Закрывать неделю могут только Р4, Р5 и владелец';
  end if;

  update public.alliance_reservoir_weeks
  set closed_at = coalesce(closed_at, now()),
      updated_by = auth.uid()
  where id = target_week_id
  returning * into week_row;

  return to_jsonb(week_row);
end;
$$;

create or replace function public.get_reservoir_activity(target_alliance_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_role text := public.get_alliance_role(target_alliance_id);
  result jsonb;
begin
  if caller_role not in ('owner','r5','editor') then
    raise exception 'Раздел активности доступен только Р4, Р5 и владельцу';
  end if;

  select coalesce(jsonb_agg(
    to_jsonb(w) || jsonb_build_object(
      'alliance_reservoir_participants',
      coalesce((
        select jsonb_agg(to_jsonb(rp) order by lower(coalesce(rp.participant_nickname,'')))
        from public.alliance_reservoir_participants rp
        where rp.week_id = w.id
      ), '[]'::jsonb)
    )
    order by w.event_date desc
  ), '[]'::jsonb)
  into result
  from public.alliance_reservoir_weeks w
  where w.alliance_id = target_alliance_id;

  return result;
end;
$$;

revoke execute on function public.get_or_create_reservoir_week(uuid,date) from public, anon;
revoke execute on function public.save_reservoir_week_roster(uuid,smallint,jsonb) from public, anon;
revoke execute on function public.close_reservoir_week(uuid) from public, anon;
revoke execute on function public.get_reservoir_activity(uuid) from public, anon;
grant execute on function public.get_or_create_reservoir_week(uuid,date) to authenticated;
grant execute on function public.save_reservoir_week_roster(uuid,smallint,jsonb) to authenticated;
grant execute on function public.close_reservoir_week(uuid) to authenticated;
grant execute on function public.get_reservoir_activity(uuid) to authenticated;

revoke insert, update, delete on table public.alliance_members from authenticated;
revoke insert, update, delete on table public.participants from authenticated;
revoke insert, update, delete on table public.alliances from authenticated;
revoke insert, update, delete on table public.alliance_vs_results from authenticated;
revoke insert, update, delete on table public.alliance_reservoir_weeks from authenticated;
revoke insert, update, delete on table public.alliance_reservoir_participants from authenticated;
