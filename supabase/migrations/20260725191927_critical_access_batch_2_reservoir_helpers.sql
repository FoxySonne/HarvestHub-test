-- Critical access batch 2: private reservoir authorization helpers.

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
