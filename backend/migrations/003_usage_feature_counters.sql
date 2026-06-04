-- Per-feature monthly usage counters on user_usage.
-- Run once in the Supabase SQL editor (project ref kkqydqziyfjhslkkzhxq).
--
-- user_usage already has one row per (user_id, date) with daily_count (searches)
-- and estimated_cost_usd. These add per-day counters for the two new Pro-gated
-- features so each has its own monthly budget (summed across the month), tracked
-- independently of the synthesis search count:
--   matrix_runs_used → Comparison Matrix runs
--   verifies_used    → "Verify" claim checks in writing mode
-- The backend increments them with the service-role client (bypasses RLS).

alter table public.user_usage
  add column if not exists matrix_runs_used integer not null default 0,
  add column if not exists verifies_used    integer not null default 0;
