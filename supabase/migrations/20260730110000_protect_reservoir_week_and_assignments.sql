alter table public.alliance_reservoir_participants
  drop constraint if exists alliance_reservoir_participants_comment_length_check,
  add constraint alliance_reservoir_participants_comment_length_check
    check (char_length(comment) <= 1000);

alter table public.alliance_reservoir_assignments
  drop constraint if exists alliance_reservoir_assignments_sort_order_check,
  add constraint alliance_reservoir_assignments_sort_order_check
    check (sort_order between 0 and 99);

create or replace function public.validate_reservoir_week_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.alliance_id is distinct from old.alliance_id then
    raise exception 'Неделю резервуара нельзя переместить в другой союз';
  end if;
  if old.closed_at is not null and new.closed_at is null then
    raise exception 'Закрытую неделю нельзя снова открыть прямым изменением';
  end if;
  return new;
end;
$$;

create or replace function public.validate_reservoir_participant_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  week_row public.alliance_reservoir_weeks%rowtype;
  participant_row public.participants%rowtype;
  caller_role text;
begin
  select * into week_row from public.alliance_reservoir_weeks where id = new.week_id;
  if not found then raise exception 'Неделя резервуара не найдена'; end if;

  select * into participant_row from public.participants where id = new.participant_id;
  if not found
     or participant_row.alliance_id <> week_row.alliance_id
     or participant_row.member_status = 'left'
     or participant_row.purged_at is not null then
    raise exception 'Можно добавить только действующего участника этого союза';
  end if;

  if char_length(coalesce(new.comment, '')) > 1000 then
    raise exception 'Комментарий не должен быть длиннее 1000 символов';
  end if;

  if week_row.closed_at is not null then
    caller_role := public.get_alliance_role(week_row.alliance_id);
    if caller_role not in ('owner','r5') then
      raise exception 'Закрытую неделю меняют только владелец и Р5';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.validate_reservoir_assignment_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  week_row public.alliance_reservoir_weeks%rowtype;
  participant_row public.participants%rowtype;
  caller_role text;
begin
  select * into week_row from public.alliance_reservoir_weeks where id = new.week_id;
  if not found then raise exception 'Неделя резервуара не найдена'; end if;

  select * into participant_row from public.participants where id = new.participant_id;
  if not found
     or participant_row.alliance_id <> week_row.alliance_id
     or participant_row.member_status = 'left'
     or participant_row.purged_at is not null then
    raise exception 'В расстановку можно добавить только действующего участника этого союза';
  end if;

  if not exists (
    select 1 from public.alliance_reservoir_participants rp
    where rp.week_id = new.week_id
      and rp.participant_id = new.participant_id
      and rp.assignment in ('main','reserve')
  ) then
    raise exception 'Сначала добавь игрока в состав недели резервуара';
  end if;

  if exists (
    select 1 from public.alliance_reservoir_assignments a
    where a.week_id = new.week_id
      and a.participant_id = new.participant_id
      and a.location_key <> new.location_key
  ) then
    raise exception 'Игрок уже назначен в другую локацию этой недели';
  end if;

  if week_row.closed_at is not null then
    caller_role := public.get_alliance_role(week_row.alliance_id);
    if caller_role not in ('owner','r5') then
      raise exception 'Закрытую неделю меняют только владелец и Р5';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.validate_reservoir_week_update() from public, anon, authenticated;
revoke execute on function public.validate_reservoir_participant_write() from public, anon, authenticated;
revoke execute on function public.validate_reservoir_assignment_write() from public, anon, authenticated;

drop trigger if exists reservoir_week_integrity_guard on public.alliance_reservoir_weeks;
create trigger reservoir_week_integrity_guard
before update on public.alliance_reservoir_weeks
for each row execute function public.validate_reservoir_week_update();

drop trigger if exists reservoir_participant_integrity_guard on public.alliance_reservoir_participants;
create trigger reservoir_participant_integrity_guard
before insert or update on public.alliance_reservoir_participants
for each row execute function public.validate_reservoir_participant_write();

drop trigger if exists reservoir_assignment_integrity_guard on public.alliance_reservoir_assignments;
create trigger reservoir_assignment_integrity_guard
before insert or update on public.alliance_reservoir_assignments
for each row execute function public.validate_reservoir_assignment_write();
