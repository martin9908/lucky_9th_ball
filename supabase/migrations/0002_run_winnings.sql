-- Track the accumulated winnings of the current free-spin run, so the Credit Out
-- tally survives a refresh / reconnect mid-run.
alter table public.profiles
  add column if not exists run_winnings integer not null default 0;
