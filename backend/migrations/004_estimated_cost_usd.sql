-- Adds the per-day cost accumulator the quota system reads/writes.
-- Run once in the Supabase SQL editor (project ref kkqydqziyfjhslkkzhxq).
--
-- WHY THIS EXISTS: usage.check_user selected and wrote user_usage.estimated_cost_usd
-- on every search. The column was never created, so every query raised 42703
-- ("column does not exist") and fell into check_user's fail-open except — users
-- were never limited and the usage bar never filled. The backend now degrades to
-- count-only enforcement when this column is absent; running this migration
-- restores the monthly USD cost ceiling on top of the search-count limit.

alter table public.user_usage
  add column if not exists estimated_cost_usd float not null default 0;


