drop index if exists public.participants_linked_user_active_idx;

create index if not exists participants_linked_user_active_idx
on public.participants (alliance_id, linked_user_id)
where linked_user_id is not null
  and member_status <> 'left'
  and purged_at is null;
