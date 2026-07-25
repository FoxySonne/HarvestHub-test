-- Critical access batch 2, part 2b: reservoir RLS policies.

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
