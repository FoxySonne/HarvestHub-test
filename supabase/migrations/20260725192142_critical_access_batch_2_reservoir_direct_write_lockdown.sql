-- Critical access batch 2: block direct layout writes and remove obsolete public helpers.

revoke insert, update, delete on table public.alliance_reservoir_layouts from anon, authenticated;
revoke insert, update, delete on table public.alliance_reservoir_assignments from anon, authenticated;
revoke insert, update, delete on table public.alliance_reservoir_location_notes from anon, authenticated;

revoke execute on function public.can_access_reservoir(uuid) from public, anon, authenticated;
revoke execute on function public.can_override_reservoir_lock(uuid) from public, anon, authenticated;
revoke execute on function public.reservoir_layout_manageable(uuid) from public, anon, authenticated;
revoke execute on function public.reservoir_layout_viewable(uuid) from public, anon, authenticated;

drop function if exists public.can_access_reservoir(uuid);
drop function if exists public.can_override_reservoir_lock(uuid);
drop function if exists public.reservoir_layout_manageable(uuid);
drop function if exists public.reservoir_layout_viewable(uuid);
