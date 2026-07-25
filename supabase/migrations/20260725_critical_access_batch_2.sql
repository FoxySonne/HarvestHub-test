-- Critical access and reservoir integrity batch 2.

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

-- VS proposals stay RPC-only and receive explicit defense-in-depth RLS policies.
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

-- Reservoir authorization helpers are moved outside the exposed API schema.
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

-- Rebuild reservoir RLS around the private helpers.
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

alter table public.alliance_reservoir_assignments
  drop constraint if exists alliance_reservoir_assignments_location_key_check;
alter table public.alliance_reservoir_assignments
  add constraint alliance_reservoir_assignments_location_key_check
  check (location_key in (
    'treatment_1', 'treatment_2',
    'processing_1', 'processing_2', 'processing_3', 'processing_4',
    'solar', 'helipad', 'central', 'development', 'military'
  ));

alter table public.alliance_reservoir_location_notes
  drop constraint if exists alliance_reservoir_location_notes_location_key_check;
alter table public.alliance_reservoir_location_notes
  add constraint alliance_reservoir_location_notes_location_key_check
  check (location_key in (
    'treatment_1', 'treatment_2',
    'processing_1', 'processing_2', 'processing_3', 'processing_4',
    'solar', 'helipad', 'central', 'development', 'military',
    'collectors_north', 'collectors_east', 'collectors_south', 'collectors_west'
  ));

create or replace function public.save_reservoir_layout(
  target_week_id uuid,
  target_assignments jsonb,
  target_notes jsonb,
  target_general_comment text,
  target_published_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.reservoir_layout_manageable(target_week_id) then
    raise exception 'Недостаточно прав для изменения расстановки';
  end if;

  perform 1
  from public.alliance_reservoir_weeks w
  where w.id = target_week_id
  for update;
  if not found then
    raise exception 'Неделя резервуара не найдена';
  end if;

  if jsonb_typeof(coalesce(target_assignments, '[]'::jsonb)) <> 'array' then
    raise exception 'Некорректный список назначений';
  end if;
  if jsonb_typeof(coalesce(target_notes, '[]'::jsonb)) <> 'array' then
    raise exception 'Некорректный список комментариев';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(target_assignments, '[]'::jsonb))
      as x(location_key text, participant_id uuid, sort_order integer)
    left join public.alliance_reservoir_participants rp
      on rp.week_id = target_week_id
     and rp.participant_id = x.participant_id
     and rp.assignment in ('main', 'reserve')
    where x.location_key not in (
      'treatment_1', 'treatment_2',
      'processing_1', 'processing_2', 'processing_3', 'processing_4',
      'solar', 'helipad', 'central', 'development', 'military'
    )
       or x.participant_id is null
       or rp.participant_id is null
  ) then
    raise exception 'Расстановка содержит неизвестную локацию или участника вне состава недели';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(target_notes, '[]'::jsonb))
      as x(location_key text, comment text)
    where x.location_key not in (
      'treatment_1', 'treatment_2',
      'processing_1', 'processing_2', 'processing_3', 'processing_4',
      'solar', 'helipad', 'central', 'development', 'military',
      'collectors_north', 'collectors_east', 'collectors_south', 'collectors_west'
    )
  ) then
    raise exception 'Комментарий содержит неизвестную локацию';
  end if;

  delete from public.alliance_reservoir_assignments
  where week_id = target_week_id;

  insert into public.alliance_reservoir_assignments (
    week_id, location_key, participant_id, sort_order, updated_by, updated_at
  )
  select
    target_week_id,
    x.location_key,
    x.participant_id,
    coalesce(x.sort_order, 0),
    auth.uid(),
    now()
  from jsonb_to_recordset(coalesce(target_assignments, '[]'::jsonb))
    as x(location_key text, participant_id uuid, sort_order integer);

  delete from public.alliance_reservoir_location_notes
  where week_id = target_week_id;

  insert into public.alliance_reservoir_location_notes (
    week_id, location_key, comment, updated_by, updated_at
  )
  select
    target_week_id,
    x.location_key,
    btrim(x.comment),
    auth.uid(),
    now()
  from jsonb_to_recordset(coalesce(target_notes, '[]'::jsonb))
    as x(location_key text, comment text)
  where btrim(coalesce(x.comment, '')) <> '';

  insert into public.alliance_reservoir_layouts (
    week_id, general_comment, published_at, updated_by, updated_at
  ) values (
    target_week_id,
    btrim(coalesce(target_general_comment, '')),
    target_published_at,
    auth.uid(),
    now()
  )
  on conflict (week_id) do update
  set general_comment = excluded.general_comment,
      published_at = excluded.published_at,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;

  return jsonb_build_object('week_id', target_week_id, 'saved', true);
end;
$$;

create or replace function public.reset_reservoir_layout(target_week_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.reservoir_layout_manageable(target_week_id) then
    raise exception 'Недостаточно прав для сброса расстановки';
  end if;

  perform 1
  from public.alliance_reservoir_weeks w
  where w.id = target_week_id
  for update;
  if not found then
    raise exception 'Неделя резервуара не найдена';
  end if;

  delete from public.alliance_reservoir_assignments
  where week_id = target_week_id;
  delete from public.alliance_reservoir_location_notes
  where week_id = target_week_id;

  insert into public.alliance_reservoir_layouts (
    week_id, general_comment, published_at, updated_by, updated_at
  ) values (
    target_week_id, '', null, auth.uid(), now()
  )
  on conflict (week_id) do update
  set general_comment = '',
      published_at = null,
      updated_by = auth.uid(),
      updated_at = now();

  return jsonb_build_object('week_id', target_week_id, 'reset', true);
end;
$$;

revoke insert, update, delete on table public.alliance_reservoir_layouts from anon, authenticated;
revoke insert, update, delete on table public.alliance_reservoir_assignments from anon, authenticated;
revoke insert, update, delete on table public.alliance_reservoir_location_notes from anon, authenticated;

revoke execute on function public.save_reservoir_layout(uuid, jsonb, jsonb, text, timestamptz) from public, anon;
grant execute on function public.save_reservoir_layout(uuid, jsonb, jsonb, text, timestamptz) to authenticated;
revoke execute on function public.reset_reservoir_layout(uuid) from public, anon;
grant execute on function public.reset_reservoir_layout(uuid) to authenticated;

revoke execute on function public.can_access_reservoir(uuid) from public, anon, authenticated;
revoke execute on function public.can_override_reservoir_lock(uuid) from public, anon, authenticated;
revoke execute on function public.reservoir_layout_manageable(uuid) from public, anon, authenticated;
revoke execute on function public.reservoir_layout_viewable(uuid) from public, anon, authenticated;

drop function public.can_access_reservoir(uuid);
drop function public.can_override_reservoir_lock(uuid);
drop function public.reservoir_layout_manageable(uuid);
drop function public.reservoir_layout_viewable(uuid);
