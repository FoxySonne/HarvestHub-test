-- The invitation code is now temporary guest access only.
revoke execute on function public.join_alliance_by_code(text)
from public, anon, authenticated;
