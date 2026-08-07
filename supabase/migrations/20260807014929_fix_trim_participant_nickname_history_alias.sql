create or replace function public.trim_participant_nickname_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.participant_nickname_history history_to_delete
  where history_to_delete.id in (
    select history_row.id
    from public.participant_nickname_history history_row
    where history_row.participant_id = new.participant_id
    order by history_row.changed_at desc, history_row.id desc
    offset 6
  );

  return new;
end;
$$;

revoke execute on function public.trim_participant_nickname_history()
from public, anon, authenticated;
