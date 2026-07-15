create table if not exists public.user_app_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  state_key text not null,
  data jsonb not null default '{}'::jsonb,
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, state_key)
);

alter table public.user_app_state enable row level security;

create policy "Users can read own app state"
on public.user_app_state
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert own app state"
on public.user_app_state
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own app state"
on public.user_app_state
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.set_user_app_state_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_user_app_state_updated_at on public.user_app_state;
create trigger set_user_app_state_updated_at
before update on public.user_app_state
for each row execute function public.set_user_app_state_updated_at();

create index if not exists user_app_state_updated_at_idx
on public.user_app_state (user_id, updated_at desc);
