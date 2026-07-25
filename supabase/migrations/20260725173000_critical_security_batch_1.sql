-- Critical security batch 1.
-- Closes direct role-table writes, protects ownership transfer,
-- removes stale hub access after unlinking, and restricts RPC exposure.

create or replace function public.is_actual_alliance_owner(target_alliance_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.alliance_members m
    where m.alliance_id = target_alliance_id
      and m.user_id = auth.uid()
      and m.role = 'owner'
  );
$$;

create or replace function public.can_manage_alliance_roles(target_alliance_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_actual_alliance_owner(target_alliance_id)
    or exists (
      select 1
      from public.participants p
      where p.alliance_id = target_alliance_id
        and p.linked_user_id = auth.uid()
        and p.rank_name = 'Р5'
        and p.member_status <> 'left'
    );
$$;

create or replace function public.transfer_alliance_owner(
  target_alliance_id uuid,
  target_user_id uuid,
  previous_owner_role text default 'editor'::text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner_id uuid;
begin
  if auth.uid() is null or not public.is_actual_alliance_owner(target_alliance_id) then
    raise exception 'Передать штаб может только текущий владелец';
  end if;

  if previous_owner_role not in ('editor', 'viewer') then
    raise exception 'Прежний владелец может остаться редактором или наблюдателем';
  end if;

  perform 1
  from public.alliances a
  where a.id = target_alliance_id
  for update;

  if not found then
    raise exception 'Союз не найден';
  end if;

  select m.user_id
  into current_owner_id
  from public.alliance_members m
  where m.alliance_id = target_alliance_id
    and m.role = 'owner'
  for update;

  if current_owner_id is null then
    raise exception 'Текущий владелец не найден';
  end if;

  if target_user_id = current_owner_id then
    return;
  end if;

  if not exists (
    select 1
    from public.participants p
    where p.alliance_id = target_alliance_id
      and p.linked_user_id = target_user_id
      and p.member_status <> 'left'
  ) then
    raise exception 'Новый владелец должен быть связан с действующим участником союза';
  end if;

  if not exists (
    select 1
    from public.alliance_members m
    where m.alliance_id = target_alliance_id
      and m.user_id = target_user_id
  ) then
    raise exception 'Новый владелец должен быть подключён к штабу';
  end if;

  update public.alliance_members
  set role = previous_owner_role
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

create or replace function public.unlink_alliance_participant_account(
  target_alliance_id uuid,
  target_participant_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked_id uuid;
  participant_rank text;
begin
  if auth.uid() is null or not public.can_manage_alliance_roles(target_alliance_id) then
    raise exception 'Отвязывать аккаунты могут только владелец штаба и Р5';
  end if;

  select p.linked_user_id, p.rank_name
  into linked_id, participant_rank
  from public.participants p
  where p.id = target_participant_id
    and p.alliance_id = target_alliance_id
  for update;

  if not found then
    raise exception 'Участник не найден';
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
    raise exception 'Нельзя отвязать владельца штаба';
  end if;

  update public.participants
  set linked_user_id = null,
      updated_by = auth.uid()
  where id = target_participant_id
    and alliance_id = target_alliance_id;

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
end;
$$;

create or replace function public.open_alliance_by_code(access_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_alliance public.alliances%rowtype;
  participant_list jsonb;
begin
  select *
  into target_alliance
  from public.alliances a
  where a.invite_code = upper(trim(access_code))
  limit 1;

  if target_alliance.id is null then
    return null;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'nickname', p.nickname,
        'rank_name', p.rank_name
      )
      order by p.nickname
    ),
    '[]'::jsonb
  )
  into participant_list
  from public.participants p
  where p.alliance_id = target_alliance.id
    and p.member_status <> 'left';

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

create unique index if not exists alliance_members_one_owner_per_alliance
  on public.alliance_members (alliance_id)
  where role = 'owner';

revoke insert, update, delete on table public.alliance_members from anon, authenticated;
drop policy if exists members_insert_owner on public.alliance_members;
drop policy if exists members_update_owner on public.alliance_members;
drop policy if exists members_delete_owner on public.alliance_members;

revoke insert, update, delete on table public.participants from anon, authenticated;
drop policy if exists participants_insert_editors on public.participants;
drop policy if exists participants_update_editors on public.participants;
drop policy if exists participants_delete_editors on public.participants;

alter default privileges in schema public revoke execute on functions from public;

revoke execute on function public.add_alliance_owner() from public, anon, authenticated;
revoke execute on function public.create_initial_game_profile() from public, anon, authenticated;
revoke execute on function public.enforce_game_profiles_limit() from public, anon, authenticated;
revoke execute on function public.prepare_participant_departure() from public, anon, authenticated;
revoke execute on function public.protect_alliance_owner_before_user_delete() from public, anon, authenticated;
revoke execute on function public.record_participant_nickname_change() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
revoke execute on function public.set_game_profile_updated_at() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.set_user_app_state_updated_at() from public, anon, authenticated;
revoke execute on function public.touch_reservoir_week() from public, anon, authenticated;
revoke execute on function public.validate_reservoir_participant() from public, anon, authenticated;

revoke execute on function public.can_access_reservoir(uuid) from public, anon;
grant execute on function public.can_access_reservoir(uuid) to authenticated;
revoke execute on function public.can_override_reservoir_lock(uuid) from public, anon;
grant execute on function public.can_override_reservoir_lock(uuid) to authenticated;
revoke execute on function public.get_alliance_role(uuid) from public, anon;
grant execute on function public.get_alliance_role(uuid) to authenticated;
revoke execute on function public.is_alliance_member(uuid) from public, anon;
grant execute on function public.is_alliance_member(uuid) to authenticated;
revoke execute on function public.reservoir_layout_manageable(uuid) from public, anon;
grant execute on function public.reservoir_layout_manageable(uuid) to authenticated;
revoke execute on function public.reservoir_layout_viewable(uuid) from public, anon;
grant execute on function public.reservoir_layout_viewable(uuid) to authenticated;
revoke execute on function public.save_my_reservoir_preferences(uuid, uuid, boolean, text, text) from public, anon;
grant execute on function public.save_my_reservoir_preferences(uuid, uuid, boolean, text, text) to authenticated;
revoke execute on function public.set_alliance_vs_saturday_total(uuid, boolean) from public, anon;
grant execute on function public.set_alliance_vs_saturday_total(uuid, boolean) to authenticated;
revoke execute on function public.sync_my_alliance_personal_data() from public, anon;
grant execute on function public.sync_my_alliance_personal_data() to authenticated;

revoke execute on function public.open_alliance_by_code(text) from public;
grant execute on function public.open_alliance_by_code(text) to anon, authenticated;

revoke execute on function public.is_actual_alliance_owner(uuid) from public, anon, authenticated;
revoke execute on function public.can_manage_alliance_roles(uuid) from public, anon, authenticated;
revoke execute on function public.transfer_alliance_owner(uuid, uuid, text) from public, anon;
grant execute on function public.transfer_alliance_owner(uuid, uuid, text) to authenticated;
revoke execute on function public.unlink_alliance_participant_account(uuid, uuid) from public, anon;
grant execute on function public.unlink_alliance_participant_account(uuid, uuid) to authenticated;
