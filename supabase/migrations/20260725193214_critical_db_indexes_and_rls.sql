-- Critical database quality batch 3: targeted indexes, RLS init plans and trigger search path.

create index if not exists alliance_members_user_alliance_idx
  on public.alliance_members (user_id, alliance_id);
create index if not exists alliances_created_by_idx
  on public.alliances (created_by);
create index if not exists participants_linked_user_active_idx
  on public.participants (linked_user_id, alliance_id)
  where linked_user_id is not null and member_status <> 'left';
create index if not exists participant_nickname_history_participant_changed_idx
  on public.participant_nickname_history (participant_id, changed_at desc);
create index if not exists participant_nickname_history_alliance_changed_idx
  on public.participant_nickname_history (alliance_id, changed_at desc);
create index if not exists reservoir_assignments_participant_idx
  on public.alliance_reservoir_assignments (participant_id);
create index if not exists vs_proposals_submitted_by_idx
  on public.alliance_vs_result_proposals (submitted_by);
create index if not exists vs_proposals_reviewed_by_idx
  on public.alliance_vs_result_proposals (reviewed_by)
  where reviewed_by is not null;

drop policy if exists vs_proposals_select on public.alliance_vs_result_proposals;
drop policy if exists vs_proposals_insert on public.alliance_vs_result_proposals;
create policy vs_proposals_select
on public.alliance_vs_result_proposals
for select
to authenticated
using (
  submitted_by = (select auth.uid())
  or public.get_alliance_role(alliance_id) in ('owner', 'editor')
);
create policy vs_proposals_insert
on public.alliance_vs_result_proposals
for insert
to authenticated
with check (
  submitted_by = (select auth.uid())
  and exists (
    select 1
    from public.participants p
    where p.id = participant_id
      and p.alliance_id = alliance_id
      and p.linked_user_id = (select auth.uid())
      and p.member_status <> 'left'
  )
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
