-- The 9 Ball — player accounts & server-authoritative game state.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  credits integer not null default 100,
  free_spins integer not null default 0,
  -- Odds currently on offer (and locked through a free-spin run): { "1": 7, ..., "9": 0 }.
  current_odds jsonb,
  -- Bets reused during a free-spin run; null outside a run.
  locked_bets jsonb,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Players may READ only their own row. Nobody may write via the client —
-- all mutations go through the `game` Edge Function using the service-role key,
-- which bypasses RLS. This is what makes credits cheat-resistant.
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
