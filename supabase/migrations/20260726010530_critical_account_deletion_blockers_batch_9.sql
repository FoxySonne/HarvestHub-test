create or replace function private.account_deletion_blockers(target_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'can_delete', not exists (
      select 1
      from public.alliance_members m
      where m.user_id = target_user_id
        and m.role in ('owner', 'r5')
    ) and not exists (
      select 1
      from public.participants p
      where p.linked_user_id = target_user_id
        and p.rank_name = 'Р5'
        and p.member_status <> 'left'
        and p.purged_at is null
    ),
    'ownerships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'alliance_id', a.id,
        'alliance_name', a.name,
        'state_number', a.state_number
      ) order by lower(a.name))
      from public.alliance_members m
      join public.alliances a on a.id = m.alliance_id
      where m.user_id = target_user_id
        and m.role = 'owner'
    ), '[]'::jsonb),
    'r5_assignments', coalesce((
      select jsonb_agg(distinct jsonb_build_object(
        'alliance_id', a.id,
        'alliance_name', a.name,
        'state_number', a.state_number
      ))
      from public.alliances a
      where exists (
        select 1 from public.alliance_members m
        where m.alliance_id = a.id
          and m.user_id = target_user_id
          and m.role = 'r5'
      ) or exists (
        select 1 from public.participants p
        where p.alliance_id = a.id
          and p.linked_user_id = target_user_id
          and p.rank_name = 'Р5'
          and p.member_status <> 'left'
          and p.purged_at is null
      )
    ), '[]'::jsonb),
    'linked_participants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'alliance_id', a.id,
        'alliance_name', a.name,
        'participant_id', p.id,
        'nickname', p.nickname,
        'rank_name', p.rank_name
      ) order by lower(a.name), lower(p.nickname))
      from public.participants p
      join public.alliances a on a.id = p.alliance_id
      where p.linked_user_id = target_user_id
        and p.member_status <> 'left'
        and p.purged_at is null
    ), '[]'::jsonb)
  );
$$;

revoke all on function private.account_deletion_blockers(uuid) from public, anon, authenticated;

create or replace function public.get_my_account_deletion_blockers()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Требуется авторизация.' using errcode = '42501';
  end if;
  return private.account_deletion_blockers(auth.uid());
end;
$$;

revoke execute on function public.get_my_account_deletion_blockers() from public, anon;
grant execute on function public.get_my_account_deletion_blockers() to authenticated;

create or replace function public.protect_alliance_owner_before_user_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  blockers jsonb;
begin
  blockers := private.account_deletion_blockers(old.id);
  if coalesce((blockers->>'can_delete')::boolean, false) is not true then
    raise exception 'ACCOUNT_DELETE_BLOCKED: перед удалением аккаунта передай владение штабом и роль Р5.'
      using errcode = '23503', detail = blockers::text;
  end if;
  return old;
end;
$$;
