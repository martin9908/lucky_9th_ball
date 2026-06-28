-- House-edge redesign: track lifetime flow per player so the engine can apply a
-- per-user adaptive throttle (compensated RTP) for players running far ahead.
-- Both default to 0; existing rows are backfilled by the default.

alter table public.profiles
  add column if not exists lifetime_wagered bigint not null default 0,
  add column if not exists lifetime_won bigint not null default 0;
