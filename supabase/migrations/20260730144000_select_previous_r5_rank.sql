create or replace function public.transfer_alliance_r5(
  target_alliance_id uuid,
  target_participant_id uuid,
  previous_r5_role text default 'Р4'
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
  previous_account_role text;
begin
  caller_role := public.get_alliance_role(target_alliance_id);
  if caller_role not in ('owner', 'r5') then
    raise exception 'Назначать Р5 могут только владелец штаба и действующий Р5';
  end if;

  if previous_r5_role not in ('Р1', 'Р2', 'Р3', 'Р4') then
    raise exception 'Для прежнего Р5 можно выбрать только ранг Р1, Р2, Р3 или Р4';
  end if;

  previous_account_role := case
    when previous_r5_role = 'Р4' then 'editor'
    else 'viewer'
  end;

  perform 1
  from public.alliances a
  where a.id = target_alliance_id
  for update;

  if not found then
    raise exception 'Союз не найден';
  end if;

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
    select 1
    from public.alliance_members m
    where m.alliance_id = target_alliance_id
      and m.user_id = new_r5.linked_user_id
      and m.role = 'owner'
  ) then
    raise exception 'Владелец штаба не может быть назначен отдельным Р5';
  end if;

  if old_r5.id is not null and old_r5.id <> new_r5.id then
    update public.participants
    set rank_name = previous_r5_role,
        updated_by = auth.uid()
    where id = old_r5.id;

    if old_r5.linked_user_id is not null then
      insert into public.alliance_members (alliance_id, user_id, role)
      values (target_alliance_id, old_r5.linked_user_id, previous_account_role)
      on conflict (alliance_id, user_id) do update
      set role = case
        when public.alliance_members.role = 'owner' then 'owner'
        else excluded.role
      end;
    end if;
  end if;

  update public.participants
  set rank_name = 'Р5',
      updated_by = auth.uid()
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

revoke execute on function public.transfer_alliance_r5(uuid, uuid, text) from public, anon;
grant execute on function public.transfer_alliance_r5(uuid, uuid, text) to authenticated;
