-- Fix the participant/alliance scope check in the VS proposal insert policy.

drop policy if exists vs_proposals_insert on public.alliance_vs_result_proposals;
create policy vs_proposals_insert
on public.alliance_vs_result_proposals
for insert
to authenticated
with check (
  submitted_by = (select auth.uid())
  and exists (
    select 1
    from public.participants p
    where p.id = public.alliance_vs_result_proposals.participant_id
      and p.alliance_id = public.alliance_vs_result_proposals.alliance_id
      and p.linked_user_id = (select auth.uid())
      and p.member_status <> 'left'
  )
);
