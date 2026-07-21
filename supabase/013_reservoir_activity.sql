create table if not exists public.alliance_reservoir_weeks (
  id uuid primary key default gen_random_uuid(),
  alliance_id uuid not null references public.alliances(id) on delete cascade,
  event_date date not null,
  event_hour_msk smallint not null default 14 check (event_hour_msk in (6,14,22)),
  roster_saved_at timestamptz,
  closed_at timestamptz,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (alliance_id, event_date),
  check (extract(isodow from event_date) = 7)
);

create table if not exists public.alliance_reservoir_participants (
  week_id uuid not null references public.alliance_reservoir_weeks(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  time_match boolean,
  intent text check (intent is null or intent in ('willing','refusing')),
  assignment text not null default 'none' check (assignment in ('none','main','reserve')),
  attendance text check (attendance is null or attendance in ('present','ready','absent_excused','absent')),
  comment text not null default '',
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (week_id, participant_id)
);

create index if not exists alliance_reservoir_weeks_alliance_date_idx on public.alliance_reservoir_weeks (alliance_id, event_date desc);
create index if not exists alliance_reservoir_participants_participant_idx on public.alliance_reservoir_participants (participant_id);

alter table public.alliance_reservoir_weeks enable row level security;
alter table public.alliance_reservoir_participants enable row level security;

create or replace function public.can_access_reservoir(p_alliance_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.alliance_members m where m.alliance_id = p_alliance_id and m.user_id = auth.uid() and m.role in ('owner','editor'))
$$;

create or replace function public.can_override_reservoir_lock(p_alliance_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.alliance_members m where m.alliance_id = p_alliance_id and m.user_id = auth.uid() and m.role = 'owner')
$$;

drop policy if exists reservoir_weeks_select on public.alliance_reservoir_weeks;
create policy reservoir_weeks_select on public.alliance_reservoir_weeks for select to authenticated using (public.can_access_reservoir(alliance_id));
drop policy if exists reservoir_weeks_insert on public.alliance_reservoir_weeks;
create policy reservoir_weeks_insert on public.alliance_reservoir_weeks for insert to authenticated with check (public.can_access_reservoir(alliance_id));
drop policy if exists reservoir_weeks_update on public.alliance_reservoir_weeks;
create policy reservoir_weeks_update on public.alliance_reservoir_weeks for update to authenticated using (public.can_access_reservoir(alliance_id)) with check (public.can_access_reservoir(alliance_id));

drop policy if exists reservoir_participants_select on public.alliance_reservoir_participants;
create policy reservoir_participants_select on public.alliance_reservoir_participants for select to authenticated using (exists (select 1 from public.alliance_reservoir_weeks w where w.id = week_id and public.can_access_reservoir(w.alliance_id)));
drop policy if exists reservoir_participants_insert on public.alliance_reservoir_participants;
create policy reservoir_participants_insert on public.alliance_reservoir_participants for insert to authenticated with check (exists (select 1 from public.alliance_reservoir_weeks w where w.id = week_id and public.can_access_reservoir(w.alliance_id)));
drop policy if exists reservoir_participants_update on public.alliance_reservoir_participants;
create policy reservoir_participants_update on public.alliance_reservoir_participants for update to authenticated using (exists (select 1 from public.alliance_reservoir_weeks w where w.id = week_id and public.can_access_reservoir(w.alliance_id))) with check (exists (select 1 from public.alliance_reservoir_weeks w where w.id = week_id and public.can_access_reservoir(w.alliance_id)));

create or replace function public.validate_reservoir_participant()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_week public.alliance_reservoir_weeks%rowtype;
  v_count integer;
  v_event_at timestamp;
  v_deadline timestamp;
  v_attendance_changed boolean := true;
begin
  select * into v_week from public.alliance_reservoir_weeks where id = new.week_id;
  if not found then raise exception 'Неделя резервуара не найдена.'; end if;
  if not exists (select 1 from public.participants p where p.id = new.participant_id and p.alliance_id = v_week.alliance_id) then raise exception 'Участник не относится к этому союзу.'; end if;
  v_event_at := v_week.event_date::timestamp + make_interval(hours => v_week.event_hour_msk);
  v_deadline := (v_week.event_date + 4)::timestamp;
  if tg_op = 'UPDATE' then
    v_attendance_changed := new.attendance is distinct from old.attendance;
    if new.assignment is distinct from old.assignment and (now() at time zone 'Europe/Moscow') >= v_event_at then raise exception 'После начала события состав менять нельзя.'; end if;
  end if;
  if new.attendance is not null and new.assignment = 'none' then raise exception 'Посещение можно отметить только участнику основы или резерва.'; end if;
  if v_attendance_changed and new.attendance is not null and (now() at time zone 'Europe/Moscow') >= v_deadline and not public.can_override_reservoir_lock(v_week.alliance_id) then raise exception 'Срок внесения посещения завершён.'; end if;
  if new.assignment in ('main','reserve') then
    select count(*) into v_count from public.alliance_reservoir_participants where week_id = new.week_id and assignment = new.assignment and participant_id <> new.participant_id;
    if new.assignment = 'main' and v_count >= 30 then raise exception 'В основном составе уже 30 участников.'; end if;
    if new.assignment = 'reserve' and v_count >= 10 then raise exception 'В резерве уже 10 участников.'; end if;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists validate_reservoir_participant_trigger on public.alliance_reservoir_participants;
create trigger validate_reservoir_participant_trigger before insert or update on public.alliance_reservoir_participants for each row execute function public.validate_reservoir_participant();

create or replace function public.touch_reservoir_week()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  if tg_op = 'INSERT' then new.created_by := auth.uid(); end if;
  return new;
end
$$;

drop trigger if exists touch_reservoir_week_trigger on public.alliance_reservoir_weeks;
create trigger touch_reservoir_week_trigger before insert or update on public.alliance_reservoir_weeks for each row execute function public.touch_reservoir_week();

grant select, insert, update on public.alliance_reservoir_weeks to authenticated;
grant select, insert, update on public.alliance_reservoir_participants to authenticated;
revoke all on function public.can_access_reservoir(uuid) from anon;
revoke all on function public.can_override_reservoir_lock(uuid) from anon;
grant execute on function public.can_access_reservoir(uuid) to authenticated;
grant execute on function public.can_override_reservoir_lock(uuid) to authenticated;
