create table if not exists public.alliance_reservoir_layouts (
  week_id uuid primary key references public.alliance_reservoir_weeks(id) on delete cascade,
  general_comment text not null default '',
  published_at timestamptz,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.alliance_reservoir_location_notes (
  week_id uuid not null references public.alliance_reservoir_weeks(id) on delete cascade,
  location_key text not null,
  comment text not null default '',
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (week_id, location_key)
);

create table if not exists public.alliance_reservoir_assignments (
  week_id uuid not null references public.alliance_reservoir_weeks(id) on delete cascade,
  location_key text not null,
  participant_id uuid not null references public.participants(id) on delete cascade,
  sort_order integer not null default 0,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (week_id, location_key, participant_id)
);

alter table public.alliance_reservoir_layouts enable row level security;
alter table public.alliance_reservoir_location_notes enable row level security;
alter table public.alliance_reservoir_assignments enable row level security;

create or replace function public.reservoir_layout_manageable(target_week_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.alliance_reservoir_weeks w
    join public.alliance_members m on m.alliance_id=w.alliance_id
    where w.id=target_week_id and m.user_id=auth.uid() and m.role in ('owner','editor')
  )
$$;

create or replace function public.reservoir_layout_viewable(target_week_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.alliance_reservoir_weeks w
    join public.alliance_members m on m.alliance_id=w.alliance_id
    where w.id=target_week_id and m.user_id=auth.uid()
  ) or exists (
    select 1 from public.alliance_reservoir_layouts l where l.week_id=target_week_id and l.published_at is not null
  )
$$;

create policy reservoir_layouts_select on public.alliance_reservoir_layouts for select to authenticated using (public.reservoir_layout_viewable(week_id));
create policy reservoir_layouts_insert on public.alliance_reservoir_layouts for insert to authenticated with check (public.reservoir_layout_manageable(week_id));
create policy reservoir_layouts_update on public.alliance_reservoir_layouts for update to authenticated using (public.reservoir_layout_manageable(week_id)) with check (public.reservoir_layout_manageable(week_id));
create policy reservoir_location_notes_select on public.alliance_reservoir_location_notes for select to authenticated using (public.reservoir_layout_viewable(week_id));
create policy reservoir_location_notes_insert on public.alliance_reservoir_location_notes for insert to authenticated with check (public.reservoir_layout_manageable(week_id));
create policy reservoir_location_notes_update on public.alliance_reservoir_location_notes for update to authenticated using (public.reservoir_layout_manageable(week_id)) with check (public.reservoir_layout_manageable(week_id));
create policy reservoir_location_notes_delete on public.alliance_reservoir_location_notes for delete to authenticated using (public.reservoir_layout_manageable(week_id));
create policy reservoir_assignments_select on public.alliance_reservoir_assignments for select to authenticated using (public.reservoir_layout_viewable(week_id));
create policy reservoir_assignments_insert on public.alliance_reservoir_assignments for insert to authenticated with check (public.reservoir_layout_manageable(week_id));
create policy reservoir_assignments_update on public.alliance_reservoir_assignments for update to authenticated using (public.reservoir_layout_manageable(week_id)) with check (public.reservoir_layout_manageable(week_id));
create policy reservoir_assignments_delete on public.alliance_reservoir_assignments for delete to authenticated using (public.reservoir_layout_manageable(week_id));

grant select,insert,update on public.alliance_reservoir_layouts to authenticated;
grant select,insert,update,delete on public.alliance_reservoir_location_notes to authenticated;
grant select,insert,update,delete on public.alliance_reservoir_assignments to authenticated;
revoke all on function public.reservoir_layout_manageable(uuid) from anon;
revoke all on function public.reservoir_layout_viewable(uuid) from anon;
grant execute on function public.reservoir_layout_manageable(uuid) to authenticated;
grant execute on function public.reservoir_layout_viewable(uuid) to authenticated;
