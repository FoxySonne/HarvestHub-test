-- Restored from the applied Supabase migration history.

alter table public.alliance_reservoir_participants
  add column if not exists preferred_assignment text;

alter table public.alliance_reservoir_participants
  drop constraint if exists alliance_reservoir_participants_preferred_assignment_check;
alter table public.alliance_reservoir_participants
  add constraint alliance_reservoir_participants_preferred_assignment_check
  check (preferred_assignment is null or preferred_assignment in ('main', 'reserve'));

create or replace function public.save_my_reservoir_preferences(
  target_week_id uuid,
  target_participant_id uuid,
  target_time_match boolean,
  target_intent text,
  target_preferred_assignment text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_alliance_id uuid;
  normalized_intent text := case
    when target_intent = 'refused' then 'refusing'
    else target_intent
  end;
begin
  select w.alliance_id into target_alliance_id
  from public.alliance_reservoir_weeks w
  where w.id = target_week_id;

  if target_alliance_id is null then
    raise exception 'Неделя резервуара не найдена';
  end if;

  if not exists (
    select 1
    from public.participants p
    where p.id = target_participant_id
      and p.alliance_id = target_alliance_id
      and p.linked_user_id = auth.uid()
      and p.member_status <> 'left'
  ) then
    raise exception 'Можно менять только свои данные резервуара';
  end if;

  if normalized_intent is not null and normalized_intent not in ('willing', 'refusing') then
    raise exception 'Некорректный статус участия';
  end if;

  if target_preferred_assignment is not null and target_preferred_assignment not in ('main', 'reserve') then
    raise exception 'Некорректное предпочтение состава';
  end if;

  insert into public.alliance_reservoir_participants (
    week_id,
    participant_id,
    time_match,
    intent,
    preferred_assignment,
    assignment,
    comment,
    updated_by
  ) values (
    target_week_id,
    target_participant_id,
    target_time_match,
    normalized_intent,
    target_preferred_assignment,
    'none',
    '',
    auth.uid()
  )
  on conflict (week_id, participant_id) do update set
    time_match = excluded.time_match,
    intent = excluded.intent,
    preferred_assignment = excluded.preferred_assignment,
    updated_by = auth.uid(),
    updated_at = now();
end;
$$;

revoke execute on function public.save_my_reservoir_preferences(uuid, uuid, boolean, text, text) from public, anon;
grant execute on function public.save_my_reservoir_preferences(uuid, uuid, boolean, text, text) to authenticated;
