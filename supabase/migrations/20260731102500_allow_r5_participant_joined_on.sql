create or replace function public.set_alliance_participant_joined_on(
  target_alliance_id uuid,
  target_participant_id uuid,
  target_joined_on date
)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  alliance_role text;
  previous_left_on date;
  saved_date date;
begin
  alliance_role := public.get_alliance_role(target_alliance_id);
  if alliance_role not in ('owner', 'r5', 'editor') then
    raise exception 'Изменять дату вступления могут только управляющие союза';
  end if;

  if target_joined_on is null or target_joined_on > current_date then
    raise exception 'Дата вступления не может быть пустой или находиться в будущем';
  end if;

  if not exists (
    select 1
    from public.participants p
    where p.id = target_participant_id
      and p.alliance_id = target_alliance_id
      and p.member_status <> 'left'
      and p.purged_at is null
  ) then
    raise exception 'Действующий участник не найден';
  end if;

  select max(mp.left_on)
  into previous_left_on
  from public.participant_membership_periods mp
  where mp.participant_id = target_participant_id
    and mp.alliance_id = target_alliance_id
    and mp.left_on is not null;

  if previous_left_on is not null and target_joined_on < previous_left_on then
    raise exception 'Дата нового вступления не может быть раньше предыдущего выхода';
  end if;

  update public.participant_membership_periods mp
  set joined_on = target_joined_on,
      updated_by = auth.uid()
  where mp.participant_id = target_participant_id
    and mp.alliance_id = target_alliance_id
    and mp.left_on is null
  returning mp.joined_on into saved_date;

  if saved_date is null then
    insert into public.participant_membership_periods (
      alliance_id,
      participant_id,
      joined_on,
      created_by,
      updated_by
    ) values (
      target_alliance_id,
      target_participant_id,
      target_joined_on,
      auth.uid(),
      auth.uid()
    ) returning joined_on into saved_date;
  end if;

  return saved_date;
end;
$$;

revoke execute on function public.set_alliance_participant_joined_on(uuid, uuid, date) from public, anon;
grant execute on function public.set_alliance_participant_joined_on(uuid, uuid, date) to authenticated;