-- HarvestHub: единая система прав владельца, Р5, редакторов и смотрителей.
-- Владелец и связанный Р5 имеют одинаковые полные права.
-- Ранг Р5 может принадлежать только одному действующему участнику союза.
-- Файл можно выполнять повторно.

-- В одном союзе может быть только один действующий Р5.
create unique index if not exists participants_one_active_r5_per_alliance_idx
  on public.participants (alliance_id)
  where rank_name = 'Р5' and member_status <> 'left';

-- Пригласительный код всегда подключает пользователя как смотрителя.
create or replace function public.join_alliance_by_code(join_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Требуется авторизация';
  end if;

  select id into target_id
  from public.alliances
  where invite_code = upper(trim(join_code))
  limit 1;

  if target_id is null then
    raise exception 'Союз с таким кодом не найден';
  end if;

  insert into public.alliance_members (alliance_id, user_id, role)
  values (target_id, auth.uid(), 'viewer')
  on conflict (alliance_id, user_id) do nothing;

  return target_id;
end;
$$;

-- Фактическая роль: владелец и связанный Р5 равны по правам.
create or replace function public.get_alliance_role(target_alliance_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1
      from public.alliance_members m
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
    ) then 'owner'
    else (
      select m.role
      from public.alliance_members m
      where m.alliance_id = target_alliance_id
        and m.user_id = auth.uid()
      limit 1
    )
  end;
$$;

-- Список штабов возвращает фактическую роль, чтобы интерфейс сразу видел права Р5.
create or replace function public.get_my_alliance_hubs_v2()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'alliance_id', m.alliance_id,
        'role', case
          when m.role = 'owner' then 'owner'
          when exists (
            select 1 from public.participants p
            where p.alliance_id = m.alliance_id
              and p.linked_user_id = auth.uid()
              and p.rank_name = 'Р5'
              and p.member_status <> 'left'
          ) then 'owner'
          else m.role
        end,
        'stored_role', m.role,
        'is_r5', exists (
          select 1 from public.participants p
          where p.alliance_id = m.alliance_id
            and p.linked_user_id = auth.uid()
            and p.rank_name = 'Р5'
            and p.member_status <> 'left'
        ),
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

-- Связать участника состава с зарегистрированным аккаунтом по email.
create or replace function public.link_alliance_participant_account(
  target_alliance_id uuid,
  target_participant_id uuid,
  target_email text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_user_id uuid;
  effective_role text;
begin
  effective_role := public.get_alliance_role(target_alliance_id);
  if effective_role <> 'owner' then
    raise exception 'Связывать аккаунты могут только владелец штаба и Р5';
  end if;

  select u.id into target_user_id
  from auth.users u
  where lower(u.email) = lower(trim(target_email))
  limit 1;

  if target_user_id is null then
    raise exception 'Аккаунт с таким email не найден';
  end if;

  if not exists (
    select 1 from public.participants p
    where p.id = target_participant_id
      and p.alliance_id = target_alliance_id
      and p.member_status <> 'left'
  ) then
    raise exception 'Участник не найден';
  end if;

  if exists (
    select 1 from public.participants p
    where p.alliance_id = target_alliance_id
      and p.linked_user_id = target_user_id
      and p.id <> target_participant_id
      and p.member_status <> 'left'
  ) then
    raise exception 'Этот аккаунт уже связан с другим участником союза';
  end if;

  update public.participants
  set linked_user_id = target_user_id,
      updated_by = auth.uid()
  where id = target_participant_id
    and alliance_id = target_alliance_id;

  insert into public.alliance_members (alliance_id, user_id, role)
  values (target_alliance_id, target_user_id, 'viewer')
  on conflict (alliance_id, user_id) do nothing;

  return target_user_id;
end;
$$;

create or replace function public.unlink_alliance_participant_account(
  target_alliance_id uuid,
  target_participant_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  linked_id uuid;
  participant_rank text;
begin
  if public.get_alliance_role(target_alliance_id) <> 'owner' then
    raise exception 'Отвязывать аккаунты могут только владелец штаба и Р5';
  end if;

  select linked_user_id, rank_name into linked_id, participant_rank
  from public.participants
  where id = target_participant_id and alliance_id = target_alliance_id;

  if participant_rank = 'Р5' then
    raise exception 'Сначала назначь другого Р5';
  end if;

  if exists (
    select 1 from public.alliance_members m
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
end;
$$;

-- Назначение редактора или смотрителя.
create or replace function public.set_alliance_member_role(
  target_alliance_id uuid,
  target_user_id uuid,
  target_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_alliance_role(target_alliance_id) <> 'owner' then
    raise exception 'Назначать роли могут только владелец штаба и Р5';
  end if;

  if target_role not in ('editor', 'viewer') then
    raise exception 'Можно назначить только редактора или смотрителя';
  end if;

  if exists (
    select 1 from public.alliance_members m
    where m.alliance_id = target_alliance_id
      and m.user_id = target_user_id
      and m.role = 'owner'
  ) then
    raise exception 'Роль владельца меняется только через передачу штаба';
  end if;

  insert into public.alliance_members (alliance_id, user_id, role)
  values (target_alliance_id, target_user_id, target_role)
  on conflict (alliance_id, user_id) do update set role = excluded.role;
end;
$$;

-- Передача ранга Р5. Прежний Р5 становится editor или viewer.
create or replace function public.transfer_alliance_r5(
  target_alliance_id uuid,
  target_participant_id uuid,
  previous_r5_role text default 'editor'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  old_r5 record;
  new_r5 record;
begin
  if public.get_alliance_role(target_alliance_id) <> 'owner' then
    raise exception 'Назначать Р5 могут только владелец штаба и действующий Р5';
  end if;

  if previous_r5_role not in ('editor', 'viewer') then
    raise exception 'Прежний Р5 может остаться редактором или смотрителем';
  end if;

  select id, linked_user_id into old_r5
  from public.participants
  where alliance_id = target_alliance_id
    and rank_name = 'Р5'
    and member_status <> 'left'
  limit 1;

  select id, linked_user_id into new_r5
  from public.participants
  where id = target_participant_id
    and alliance_id = target_alliance_id
    and member_status <> 'left';

  if new_r5.id is null then
    raise exception 'Новый Р5 не найден';
  end if;

  if new_r5.linked_user_id is null then
    raise exception 'Сначала свяжи нового Р5 с зарегистрированным аккаунтом';
  end if;

  if old_r5.id is not null and old_r5.id <> new_r5.id then
    update public.participants
    set rank_name = '', updated_by = auth.uid()
    where id = old_r5.id;

    if old_r5.linked_user_id is not null and not exists (
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
  values (target_alliance_id, new_r5.linked_user_id, 'viewer')
  on conflict (alliance_id, user_id) do nothing;
end;
$$;

-- Передача владельца другому связанному пользователю.
create or replace function public.transfer_alliance_owner(
  target_alliance_id uuid,
  target_user_id uuid,
  previous_owner_role text default 'editor'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_owner_id uuid;
begin
  if public.get_alliance_role(target_alliance_id) <> 'owner' then
    raise exception 'Передать штаб могут только владелец и Р5';
  end if;

  if previous_owner_role not in ('editor', 'viewer') then
    raise exception 'Прежний владелец может остаться редактором или смотрителем';
  end if;

  select m.user_id into current_owner_id
  from public.alliance_members m
  where m.alliance_id = target_alliance_id and m.role = 'owner'
  limit 1;

  if current_owner_id is null then
    raise exception 'Текущий владелец не найден';
  end if;

  if target_user_id = current_owner_id then
    return;
  end if;

  if not exists (
    select 1 from public.alliance_members m
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

-- Перед удалением аккаунта владельца штаб автоматически переходит связанному Р5.
-- Если связанного Р5 нет, удаление блокируется до ручной передачи прав.
create or replace function public.protect_alliance_owner_before_user_delete()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  owned_alliance record;
  successor_id uuid;
begin
  for owned_alliance in
    select a.id
    from public.alliances a
    join public.alliance_members m on m.alliance_id = a.id
    where m.user_id = old.id and m.role = 'owner'
  loop
    select p.linked_user_id into successor_id
    from public.participants p
    where p.alliance_id = owned_alliance.id
      and p.rank_name = 'Р5'
      and p.member_status <> 'left'
      and p.linked_user_id is not null
      and p.linked_user_id <> old.id
    limit 1;

    if successor_id is null then
      raise exception 'Перед удалением аккаунта передай права владельца или назначь связанного Р5';
    end if;

    insert into public.alliance_members (alliance_id, user_id, role)
    values (owned_alliance.id, successor_id, 'owner')
    on conflict (alliance_id, user_id) do update set role = 'owner';

    update public.alliances
    set created_by = successor_id
    where id = owned_alliance.id;
  end loop;

  return old;
end;
$$;

drop trigger if exists protect_alliance_owner_before_user_delete on auth.users;
create trigger protect_alliance_owner_before_user_delete
before delete on auth.users
for each row execute function public.protect_alliance_owner_before_user_delete();

revoke all on function public.link_alliance_participant_account(uuid, uuid, text) from public;
revoke all on function public.unlink_alliance_participant_account(uuid, uuid) from public;
revoke all on function public.set_alliance_member_role(uuid, uuid, text) from public;
revoke all on function public.transfer_alliance_r5(uuid, uuid, text) from public;
revoke all on function public.transfer_alliance_owner(uuid, uuid, text) from public;

grant execute on function public.link_alliance_participant_account(uuid, uuid, text) to authenticated;
grant execute on function public.unlink_alliance_participant_account(uuid, uuid) to authenticated;
grant execute on function public.set_alliance_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.transfer_alliance_r5(uuid, uuid, text) to authenticated;
grant execute on function public.transfer_alliance_owner(uuid, uuid, text) to authenticated;
grant execute on function public.get_alliance_role(uuid) to authenticated;
grant execute on function public.get_my_alliance_hubs_v2() to authenticated;
grant execute on function public.join_alliance_by_code(text) to authenticated;

notify pgrst, 'reload schema';
