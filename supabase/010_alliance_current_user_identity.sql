-- HarvestHub: участник видит связь только со своим аккаунтом.
-- Это нужно для компактной карточки пользователя в союзном штабе.

create or replace function public.get_alliance_participants(target_alliance_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  alliance_role text;
  can_see_private boolean;
  result jsonb;
begin
  alliance_role := public.get_alliance_role(target_alliance_id);
  if alliance_role is null then
    raise exception 'Нет доступа к этому союзному штабу';
  end if;

  can_see_private := alliance_role in ('owner', 'editor');

  select coalesce(jsonb_agg(item order by
    case item->>'rank_name'
      when 'Р5' then 5 when 'Р4' then 4 when 'Р3' then 3 when 'Р2' then 2 when 'Р1' then 1 else 0 end desc,
    lower(item->>'nickname')
  ), '[]'::jsonb)
  into result
  from (
    select jsonb_build_object(
      'id', p.id,
      'nickname', p.nickname,
      'rank_name', p.rank_name,
      'member_status', p.member_status,
      'birthday', p.birthday,
      'timezone_offset', case when can_see_private then p.timezone_offset else null end,
      'comment', case when can_see_private then p.comment else null end,
      'linked_user_id', case
        when can_see_private or p.linked_user_id = auth.uid() then p.linked_user_id
        else null
      end,
      'nickname_history', coalesce((
        select jsonb_agg(jsonb_build_object(
          'old_nickname', h.old_nickname,
          'new_nickname', h.new_nickname,
          'changed_at', h.changed_at
        ) order by h.changed_at desc)
        from public.participant_nickname_history h
        where h.participant_id = p.id
      ), '[]'::jsonb)
    ) as item
    from public.participants p
    where p.alliance_id = target_alliance_id
  ) rows_data;

  return result;
end;
$$;

revoke all on function public.get_alliance_participants(uuid) from public;
grant execute on function public.get_alliance_participants(uuid) to authenticated;

notify pgrst, 'reload schema';
