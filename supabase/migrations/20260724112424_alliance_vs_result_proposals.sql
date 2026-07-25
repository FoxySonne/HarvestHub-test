-- Restored from the applied Supabase migration history.

create table if not exists public.alliance_vs_result_proposals (
  id uuid primary key default gen_random_uuid(),
  alliance_id uuid not null references public.alliances(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  result_date date not null,
  points numeric,
  is_vacation boolean not null default false,
  status text not null default 'pending',
  submitted_by uuid not null references auth.users(id) on delete cascade,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint alliance_vs_result_proposals_day_check
    check (extract(isodow from result_date) between 1 and 6),
  constraint alliance_vs_result_proposals_points_check
    check (points is null or points >= 0),
  constraint alliance_vs_result_proposals_value_check
    check (is_vacation = true or points is not null),
  constraint alliance_vs_result_proposals_status_check
    check (status in ('pending', 'approved', 'rejected'))
);

alter table public.alliance_vs_result_proposals enable row level security;

create index if not exists alliance_vs_result_proposals_alliance_status_idx
  on public.alliance_vs_result_proposals (alliance_id, status, created_at);
create unique index if not exists alliance_vs_result_proposals_pending_unique
  on public.alliance_vs_result_proposals (participant_id, result_date)
  where status = 'pending';

create or replace function public.list_my_alliance_vs_proposals(target_alliance_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', q.id,
    'result_date', q.result_date,
    'points', q.points,
    'is_vacation', q.is_vacation,
    'status', q.status,
    'created_at', q.created_at,
    'updated_at', q.updated_at
  ) order by q.result_date desc), '[]'::jsonb)
  from public.alliance_vs_result_proposals q
  join public.participants p on p.id = q.participant_id
  where q.alliance_id = target_alliance_id
    and p.linked_user_id = (select auth.uid())
    and p.member_status <> 'left';
$$;

create or replace function public.list_alliance_vs_proposals(target_alliance_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if public.get_alliance_role(target_alliance_id) not in ('owner', 'editor') then
    raise exception 'Просматривать заявки VS могут только управляющие союза';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', q.id,
    'participant_id', q.participant_id,
    'nickname', p.nickname,
    'rank_name', p.rank_name,
    'result_date', q.result_date,
    'proposed_points', q.points,
    'proposed_is_vacation', q.is_vacation,
    'current_points', r.points,
    'current_is_vacation', coalesce(r.is_vacation, false),
    'created_at', q.created_at
  ) order by q.created_at asc), '[]'::jsonb)
  into result
  from public.alliance_vs_result_proposals q
  join public.participants p on p.id = q.participant_id
  left join public.alliance_vs_results r
    on r.participant_id = q.participant_id
   and r.result_date = q.result_date
  where q.alliance_id = target_alliance_id
    and q.status = 'pending';

  return result;
end;
$$;

create or replace function public.review_alliance_vs_proposal(
  target_proposal_id uuid,
  target_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  proposal public.alliance_vs_result_proposals%rowtype;
  resulting_status text;
begin
  select q.* into proposal
  from public.alliance_vs_result_proposals q
  where q.id = target_proposal_id
  for update;

  if proposal.id is null then
    raise exception 'Заявка не найдена';
  end if;
  if public.get_alliance_role(proposal.alliance_id) not in ('owner', 'editor') then
    raise exception 'Подтверждать заявки VS могут только управляющие союза';
  end if;
  if proposal.status <> 'pending' then
    raise exception 'Заявка уже обработана';
  end if;
  if target_decision not in ('approve', 'reject') then
    raise exception 'Неизвестное действие';
  end if;

  if target_decision = 'approve' then
    perform public.save_alliance_vs_result(
      proposal.alliance_id,
      proposal.participant_id,
      proposal.result_date,
      proposal.points,
      proposal.is_vacation
    );
    resulting_status := 'approved';
  else
    resulting_status := 'rejected';
  end if;

  update public.alliance_vs_result_proposals
  set status = resulting_status,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where id = proposal.id;

  return jsonb_build_object('id', proposal.id, 'status', resulting_status);
end;
$$;

revoke execute on function public.list_my_alliance_vs_proposals(uuid) from public, anon;
revoke execute on function public.list_alliance_vs_proposals(uuid) from public, anon;
revoke execute on function public.review_alliance_vs_proposal(uuid, text) from public, anon;
grant execute on function public.list_my_alliance_vs_proposals(uuid) to authenticated;
grant execute on function public.list_alliance_vs_proposals(uuid) to authenticated;
grant execute on function public.review_alliance_vs_proposal(uuid, text) to authenticated;
