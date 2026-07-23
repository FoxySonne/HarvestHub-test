-- HarvestHub: временное хранение вышедших участников и восстановление по никнейму.

alter table public.participants
  add column if not exists left_at timestamptz,
  add column if not exists member_status_before_left text;

alter table public.participants drop constraint if exists participants_member_status_before_left_check;
alter table public.participants
  add constraint participants_member_status_before_left_check
  check (member_status_before_left is null or member_status_before_left in ('main', 'reserve', 'inactive'));

-- Для участников, вышедших до появления архива, срок начинается сейчас.
update public.participants
set left_at = coalesce(left_at, now()),
    member_status_before_left = coalesce(member_status_before_left, 'main')
where member_status = 'left';

create index if not exists participants_left_nickname_lookup_idx
  on public.participants (alliance_id, lower(btrim(nickname)), left_at)
  where member_status = 'left';

create or replace function public.prepare_participant_departure()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.member_status <> 'left' and new.member_status = 'left' then
    new.left_at := coalesce(new.left_at, now());
    new.member_status_before_left := old.member_status;
  elsif old.member_status = 'left' and new.member_status <> 'left' then
    new.left_at := null;
    new.member_status_before_left := null;
  end if;
  return new;
end;
$$;

revoke all on function public.prepare_participant_departure() from public, anon, authenticated;

drop trigger if exists participants_prepare_departure on public.participants;
create trigger participants_prepare_departure
before update of member_status on public.participants
for each row execute function public.prepare_participant_departure();

create or replace function public.find_recent_departed_participant(
  target_alliance_id uuid,
  target_nickname text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  alliance_role text;
  result jsonb;
begin
  alliance_role := public.get_alliance_role(target_alliance_id);
  if alliance_role not in ('owner', 'editor') then
    raise exception 'Проверять архив могут только управляющие союза';
  end if;

  if trim(coalesce(target_nickname, '')) = '' then
    return null;
  end if;

  select jsonb_build_object('id', p.id, 'nickname', p.nickname)
  into result
  from public.participants p
  where p.alliance_id = target_alliance_id
    and p.member_status = 'left'
    and p.left_at > now() - interval '60 days'
    and lower(btrim(p.nickname)) = lower(btrim(target_nickname))
  order by p.left_at desc
  limit 1;

  return result;
end;
$$;

revoke all on function public.find_recent_departed_participant(uuid, text) from public, anon;
grant execute on function public.find_recent_departed_participant(uuid, text) to authenticated;

create or replace function public.mark_alliance_participant_left(
  target_alliance_id uuid,
  target_participant_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  alliance_role text;
  saved_id uuid;
begin
  alliance_role := public.get_alliance_role(target_alliance_id);
  if alliance_role not in ('owner', 'editor') then
    raise exception 'Изменять состав могут только управляющие союза';
  end if;

  update public.participants
  set member_status = 'left',
      updated_by = auth.uid()
  where id = target_participant_id
    and alliance_id = target_alliance_id
    and member_status <> 'left'
  returning id into saved_id;

  if saved_id is null then
    raise exception 'Участник не найден в составе союза';
  end if;

  return saved_id;
end;
$$;

revoke all on function public.mark_alliance_participant_left(uuid, uuid) from public, anon;
grant execute on function public.mark_alliance_participant_left(uuid, uuid) to authenticated;

create or replace function public.restore_alliance_participant(
  target_alliance_id uuid,
  target_participant_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  alliance_role text;
  departed_rank text;
  saved_id uuid;
begin
  alliance_role := public.get_alliance_role(target_alliance_id);
  if alliance_role not in ('owner', 'editor') then
    raise exception 'Восстанавливать участников могут только управляющие союза';
  end if;

  select p.rank_name
  into departed_rank
  from public.participants p
  where p.id = target_participant_id
    and p.alliance_id = target_alliance_id
    and p.member_status = 'left'
    and p.left_at > now() - interval '60 days'
  for update;

  if not found then
    raise exception 'Срок хранения участника истёк или запись не найдена';
  end if;

  if departed_rank = 'Р5' and exists (
    select 1
    from public.participants p
    where p.alliance_id = target_alliance_id
      and p.member_status <> 'left'
      and p.rank_name = 'Р5'
      and p.id <> target_participant_id
  ) then
    raise exception 'Нельзя восстановить прежнего Р5, пока в союзе уже назначен другой Р5';
  end if;

  update public.participants
  set member_status = coalesce(member_status_before_left, 'main'),
      updated_by = auth.uid()
  where id = target_participant_id
    and alliance_id = target_alliance_id
  returning id into saved_id;

  return saved_id;
end;
$$;

revoke all on function public.restore_alliance_participant(uuid, uuid) from public, anon;
grant execute on function public.restore_alliance_participant(uuid, uuid) to authenticated;

-- Просроченные записи удаляются ежедневно вместе со связанными данными по ON DELETE CASCADE.
create extension if not exists pg_cron;

do $$
declare
  existing_job record;
begin
  for existing_job in
    select jobid from cron.job where jobname = 'purge-departed-alliance-participants'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;

  perform cron.schedule(
    'purge-departed-alliance-participants',
    '20 3 * * *',
    $job$delete from public.participants
      where member_status = 'left'
        and left_at <= now() - interval '60 days'$job$
  );
end;
$$;

notify pgrst, 'reload schema';
