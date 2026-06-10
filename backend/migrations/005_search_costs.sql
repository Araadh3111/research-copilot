-- Task 2.1 — per-search cost instrumentation.
-- One row per search request, capturing the real LLM spend so we can answer
-- "what does a search cost?" (p50/p95), daily burn, and cost by pipeline stage.
-- Run once in the Supabase SQL editor.

create table if not exists public.search_costs (
  id               uuid primary key default gen_random_uuid(),
  query_id         uuid not null,
  user_id          uuid,
  tier             text,
  output_mode      text,
  models           text[]      not null default '{}',
  input_tokens     integer     not null default 0,
  output_tokens    integer     not null default 0,
  cost_usd         double precision not null default 0,
  latency_ms       integer,
  papers_processed integer,
  cache_hit        boolean     not null default false,
  by_stage         jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists search_costs_created_idx
  on public.search_costs (created_at desc);

create index if not exists search_costs_user_idx
  on public.search_costs (user_id, created_at desc);
