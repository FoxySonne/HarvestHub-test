-- Critical access batch 2, part 2: reservoir authorization and locks.

create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.can_access_reservoir(target_alliance_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and public.get_alliance_role(target_alliance_id) in ('owner', 'editor');
$$;

create or replace function private.can_override_reservoir_lock(target_alliance_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and public.can_manage_alliance_roles(target_alliance_id);
$$;

create or replace function private.reservoir_week_viewable(target_week_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.alliance_reservoir_weeks w
    where w.id = target_week_id
      and (
        private.can_access_reservoir(w.alliance_id)
        or (
          public.is_alliance_member(w.alliance_id)
          and exists (
            select 1
            from public.alliance_reservoir_layouts l
            where l.week_id = w.id
              and l.published_at is not null
          )
        )
      )
  );
$$;

create or replace function private.reservoir_layout_manageable(target_week_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.alliance_reservoir_weeks w
    where w.id = target_week_id
      and private.can_access_reservoir(w.alliance_id)
      and (
        w.closed_at is null
        or private.can_override_reservoir_lock(w.alliance_id)
      )
  );
$$;

create or replace function private.reservoir_layout_viewable(target_week_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.reservoir_week_viewable(target_week_id);
$$;

grant execute on function private.can_access_reservoir(uuid) to authenticated;
grant execute on function private.can_override_reservoir_lock(uuid) to authenticated;
grant execute on function private.reservoir_week_viewable(uuid) to authenticated;
grant execute on function private.reservoir_layout_manageable(uuid) to authenticated;
grant execute on function private.reservoir_layout_viewable(uuid) to authenticated;

create or replace function public.guard_reservoir_week_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.closed_at is not null
     and not private.can_override_reservoir_lock(old.alliance_id) then
    raise exception 'Закрытую неделю могут изменять только владелец штаба и Р5';
  end if;

  if old.roster_saved_at is not null
     and new.event_hour_msk is distinct from old.event_hour_msk
     and not private.can_override_reservoir_lock(old.alliance_id) then
    raise exception 'После сохранения состава время события меняют только владелец штаба и Р5';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_reservoir_week_update() from public, anon, authenticated;
drop trigger if exists guard_reservoir_week_update_trigger on public.alliance_reservoir_weeks;
create trigger guard_reservoir_week_update_trigger
before update on public.alliance_reservoir_weeks
for each row execute function public.guard_reservoir_week_update();

create or replace function public.validate_reservoir_participant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_week public.alliance_reservoir_weeks%rowtype;
  v_count integer;
  v_event_at timestamp;
  v_deadline timestamp;
  v_attendance_changed boolean := true;
begin
  select * into v_week
  from public.alliance_reservoir_weeks
  where id = new.week_id;

  if not found then
    raise exception 'Неделя резервуара не найдена.';
  end if;

  if not exists (
    select 1
    from public.participants p
    where p.id = new.participant_id
      and p.alliance_id = v_week.alliance_id
  ) then
    raise exception 'Участник не относится к этому союзу.';
  end if;

  v_event_at := v_week.event_date::timestamp + make_interval(hours => v_week.event_hour_msk);
  v_deadline := (v_week.event_date + 4)::timestamp;

  if tg_op = 'UPDATE' then
    v_attendance_changed := new.attendance is distinct from old.attendance;
    if new.assignment is distinct from old.assignment
       and (now() at time zone 'Europe/Moscow') >= v_event_at then
      raise exception 'После начала события состав менять нельзя.';
    end if;
  end if;

  if new.attendance is not null and new.assignment = 'none' then
    raise exception 'Посещение можно отметить только участнику основы или резерва.';
  end if;

  if v_attendance_changed
     and new.attendance is not null
     and (now() at time zone 'Europe/Moscow') >= v_deadline
     and not private.can_override_reservoir_lock(v_week.alliance_id) then
    raise exception 'Срок внесения посещения завершён.';
  end if;

  if new.assignment in ('main', 'reserve') then
    select count(*) into v_count
    from public.alliance_reservoir_participants
    where week_id = new.week_id
      and assignment = new.assignment
      and participant_id <> new.participant_id;

    if new.assignment = 'main' and v_count >= 30 then
      raise exception 'В основном составе уже 30 участников.';
    end if;
    if new.assignment = 'reserve' and v_count >= 10 then
      raise exception 'В резерве уже 10 участников.';
    end if;
  end if;

  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.validate_reservoir_participant() from public, anon, authenticated;

drop policy if exists reservoir_weeks_insert on public.alliance_reservoir_weeks;
drop policy if exists reservoir_weeks_select on public.alliance_reservoir_weeks;
drop policy if exists reservoir_weeks_update on public.alliance_reservoir_weeks;
create policy reservoir_weeks_insert
on public.alliance_reservoir_weeks
for insert
to authenticated
with check (private.can_access_reservoir(alliance_id));
create policy reservoir_weeks_select
on public.alliance_reservoir_weeks
for select
to authenticated
using (private.reservoir_week_viewable(id));
create policy reservoir_weeks_update
on public.alliance_reservoir_weeks
for update
to authenticated
using (private.can_access_reservoir(alliance_id))
with check (private.can_access_reservoir(alliance_id));

drop policy if exists reservoir_participants_insert on public.alliance_reservoir_participants;
drop policy if exists reservoir_participants_select on public.alliance_reservoir_participants;
drop policy if exists reservoir_participants_update on public.alliance_reservoir_participants;
create policy reservoir_participants_insert
on public.alliance_reservoir_participants
for insert
to authenticated
with check (
  exists (
    select 1
    from public.alliance_reservoir_weeks w
    where w.id = week_id
      and private.can_access_reservoir(w.alliance_id)
  )
);
create policy reservoir_participants_select
on public.alliance_reservoir_participants
for select
to authenticated
using (
  exists (
    select 1
    from public.alliance_reservoir_weeks w
    where w.id = week_id
      and (
        private.can_access_reservoir(w.alliance_id)
        or (
          private.reservoir_week_viewable(week_id)
          and assignment in ('main', 'reserve')
        )
      )
  )
);
create policy reservoir_participants_update
on public.alliance_reservoir_participants
for update
to authenticated
using (
  exists (
    select 1
    from public.alliance_reservoir_weeks w
    where w.id = week_id
      and private.can_access_reservoir(w.alliance_id)
  )
)
with check (
  exists (
    select 1
    from public.alliance_reservoir_weeks w
    where w.id = week_id
      and private.can_access_reservoir(w.alliance_id)
  )
);

drop policy if exists reservoir_layouts_insert on public.alliance_reservoir_layouts;
drop policy if exists reservoir_layouts_select on public.alliance_reservoir_layouts;
drop policy if exists reservoir_layouts_update on public.alliance_reservoir_layouts;
create policy reservoir_layouts_select
on public.alliance_reservoir_layouts
for select
to authenticated
using (private.reservoir_layout_viewable(week_id));

drop policy if exists reservoir_assignments_delete on public.alliance_reservoir_assignments;
drop policy if exists reservoir_assignments_insert on public.alliance_reservoir_assignments;
drop policy if exists reservoir_assignments_select on public.alliance_reservoir_assignments;
drop policy if exists reservoir_assignments_update on public.alliance_reservoir_assignments;
create policy reservoir_assignments_select
on public.alliance_reservoir_assignments
for select
to authenticated
using (private.reservoir_layout_viewable(week_id));

drop policy if exists reservoir_location_notes_delete on public.alliance_reservoir_location_notes;
drop policy if exists reservoir_location_notes_insert on public.alliance_reservoir_location_notes;
drop policy if exists reservoir_location_notes_select on public.alliance_reservoir_location_notes;
drop policy if exists reservoir_location_notes_update on public.alliance_reservoir_location_notes;
create policy reservoir_location_notes_select
on public.alliance_reservoir_location_notes
for select
to authenticated
using (private.reservoir_layout_viewable(week_id));
