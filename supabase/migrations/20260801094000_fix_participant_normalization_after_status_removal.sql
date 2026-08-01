-- Fix participant updates after the legacy participants.status column was removed.
-- The normalization trigger must only touch columns that still exist.

create or replace function public.normalize_participant_record()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.nickname := btrim(new.nickname);
  new.comment := btrim(coalesce(new.comment, ''));
  new.rank_name := btrim(coalesce(new.rank_name, ''));
  new.primary_nickname := nullif(btrim(coalesce(new.primary_nickname, '')), '');
  return new;
end;
$$;

revoke execute on function public.normalize_participant_record() from public, anon, authenticated;
