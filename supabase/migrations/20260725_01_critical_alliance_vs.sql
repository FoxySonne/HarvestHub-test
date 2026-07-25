-- Critical access batch 2, part 1: alliance details and VS proposals.

create or replace function public.update_alliance_details(
  target_alliance_id uuid,
  target_name text,
  target_state_number text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_name text := btrim(coalesce(target_name, ''));
  clean_state text := btrim(coalesce(target_state_number, ''));
begin
  if auth.uid() is null or not public.can_manage_alliance_roles(target_alliance_id) then
    raise exception 'Изменять данные союза могут только владелец штаба и Р5';
  end if;
  if clean_name = '' or char_length(clean_name) > 80 then
    raise exception 'Название союза должно содержать от 1 до 80 символов';
  end if;
  if char_length(clean_state) > 30 then
    raise exception 'Номер штата не может быть длиннее 30 символов';
  end if;

  update public.alliances
  set name = clean_name,
      state_number = clean_state,
      updated_at = now()
  where id = target_alliance_id;

  if not found then
    raise exception 'Союз не найден';
  end if;
end;
$$;

revoke insert, update, delete on table public.alliances from anon, authenticated;
drop policy if exists alliances_insert_creator on public.alliances;
drop policy if exists alliances_update_owner on public.alliances;
drop policy if exists alliances_delete_owner on public.alliances;

revoke execute on function public.update_alliance_details(uuid, text, text) from public, anon;
grant execute on function public.update_alliance_details(uuid, text, text) to authenticated;

drop policy if exists vs_proposals_select on public.alliance_vs_result_proposals;
drop policy if exists vs_proposals_insert on public.alliance_vs_result_proposals;
drop policy if exists vs_proposals_update on public.alliance_vs_result_proposals;

create policy vs_proposals_select
on public.alliance_vs_result_proposals
for select
to authenticated
using (
  submitted_by = auth.uid()
  or public.get_alliance_role(alliance_id) in ('owner', 'editor')
);

create policy vs_proposals_insert
on public.alliance_vs_result_proposals
for insert
to authenticated
with check (
  submitted_by = auth.uid()
  and exists (
    select 1
    from public.participants p
    where p.id = participant_id
      and p.alliance_id = alliance_id
      and p.linked_user_id = auth.uid()
      and p.member_status <> 'left'
  )
);

create policy vs_proposals_update
on public.alliance_vs_result_proposals
for update
to authenticated
using (public.get_alliance_role(alliance_id) in ('owner', 'editor'))
with check (public.get_alliance_role(alliance_id) in ('owner', 'editor'));

create or replace function public.submit_my_alliance_vs_proposal(
  target_alliance_id uuid,
  target_participant_id uuid,
  target_result_date date,
  target_points numeric,
  target_is_vacation boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  proposal_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Необходимо войти в аккаунт';
  end if;
  if not exists (
    select 1
    from public.participants p
    where p.id = target_participant_id
      and p.alliance_id = target_alliance_id
      and p.linked_user_id = auth.uid()
      and p.member_status <> 'left'
  ) then
    raise exception 'Можно предложить результат только для собственного связанного игрока';
  end if;
  if target_result_date is null or extract(isodow from target_result_date) not between 1 and 6 then
    raise exception 'Для VS можно выбрать только день с понедельника по субботу';
  end if;
  if target_result_date > current_date then
    raise exception 'Нельзя отправить результат за будущий день';
  end if;
  if coalesce(target_is_vacation, false) = false and target_points is null then
    raise exception 'Укажи количество очков или отметь отпуск';
  end if;
  if target_points is not null and target_points < 0 then
    raise exception 'Количество очков не может быть отрицательным';
  end if;
  if exists (
    select 1
    from public.alliance_vs_result_proposals q
    where q.participant_id = target_participant_id
      and q.result_date = target_result_date
      and q.status = 'pending'
  ) then
    raise exception 'Заявка за этот день уже ожидает решения руководства';
  end if;

  begin
    insert into public.alliance_vs_result_proposals (
      alliance_id,
      participant_id,
      result_date,
      points,
      is_vacation,
      status,
      submitted_by,
      updated_at
    ) values (
      target_alliance_id,
      target_participant_id,
      target_result_date,
      case when coalesce(target_is_vacation, false) then null else round(target_points) end,
      coalesce(target_is_vacation, false),
      'pending',
      auth.uid(),
      now()
    )
    returning id into proposal_id;
  exception
    when unique_violation then
      raise exception 'Заявка за этот день уже ожидает решения руководства';
  end;

  return proposal_id;
end;
$$;

revoke execute on function public.submit_my_alliance_vs_proposal(uuid, uuid, date, numeric, boolean) from public, anon;
grant execute on function public.submit_my_alliance_vs_proposal(uuid, uuid, date, numeric, boolean) to authenticated;
