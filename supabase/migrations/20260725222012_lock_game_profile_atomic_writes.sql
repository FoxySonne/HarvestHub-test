-- Profile creation, activation and deletion must go through atomic RPC functions.
-- Direct client updates remain available only for editable profile fields.

revoke insert, delete, update on table public.game_profiles from authenticated;
grant update (nickname, state, data) on table public.game_profiles to authenticated;
