-- Critical guest access batch 4: safe code-based view without persistent data exposure.

create or replace function public.open_alliance_by_code(access_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_alliance_id uuid;
  target_alliance_name text;
  target_state_number text;
  participant_list jsonb;
  published_layout jsonb;
begin
  select a.id, a.name, a.state_number
  into target_alliance_id, target_alliance_name, target_state_number
  from public.alliances a
  where a.invite_code = upper(trim(access_code))
  limit 1;
  if target_alliance_id is null then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nickname', p.nickname, 'rank_name', p.rank_name) order by p.nickname), '[]'::jsonb)
  into participant_list
  from public.participants p
  where p.alliance_id = target_alliance_id and p.member_status <> 'left';
  select jsonb_build_object(
    'week', jsonb_build_object('id', latest.id, 'event_date', latest.event_date, 'event_hour_msk', latest.event_hour_msk),
    'published_at', latest.published_at,
    'general_comment', coalesce(latest.general_comment, ''),
    'roster', (select coalesce(jsonb_agg(jsonb_build_object('participant_id', p.id, 'nickname', p.nickname, 'assignment', rp.assignment) order by case rp.assignment when 'main' then 0 else 1 end, p.nickname), '[]'::jsonb) from public.alliance_reservoir_participants rp join public.participants p on p.id = rp.participant_id where rp.week_id = latest.id and rp.assignment in ('main', 'reserve') and p.alliance_id = target_alliance_id and p.member_status <> 'left'),
    'assignments', (select coalesce(jsonb_agg(jsonb_build_object('location_key', a.location_key, 'participant_id', a.participant_id, 'sort_order', a.sort_order) order by a.location_key, a.sort_order), '[]'::jsonb) from public.alliance_reservoir_assignments a join public.participants p on p.id = a.participant_id join public.alliance_reservoir_participants rp on rp.week_id = a.week_id and rp.participant_id = a.participant_id and rp.assignment in ('main', 'reserve') where a.week_id = latest.id and p.alliance_id = target_alliance_id and p.member_status <> 'left'),
    'notes', (select coalesce(jsonb_agg(jsonb_build_object('location_key', n.location_key, 'comment', n.comment) order by n.location_key), '[]'::jsonb) from public.alliance_reservoir_location_notes n where n.week_id = latest.id)
  ) into published_layout
  from (select w.id, w.event_date, w.event_hour_msk, l.general_comment, l.published_at from public.alliance_reservoir_weeks w join public.alliance_reservoir_layouts l on l.week_id = w.id where w.alliance_id = target_alliance_id and l.published_at is not null order by w.event_date desc, l.published_at desc limit 1) latest;
  return jsonb_build_object('alliance', jsonb_build_object('id', target_alliance_id, 'name', target_alliance_name, 'state_number', target_state_number), 'participants', participant_list, 'published_layout', published_layout);
end;
$$;

revoke execute on function public.open_alliance_by_code(text) from public;
grant execute on function public.open_alliance_by_code(text) to anon, authenticated;

delete from public.alliance_members m
where m.role = 'viewer'
  and not exists (select 1 from public.participants p where p.alliance_id = m.alliance_id and p.linked_user_id = m.user_id and p.member_status <> 'left');
