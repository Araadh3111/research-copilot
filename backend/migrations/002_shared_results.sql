-- Read-only public share links for synthesis results.
-- Run once in the Supabase SQL editor (project ref kkqydqziyfjhslkkzhxq).
--
-- A share is created by the backend with the service-role key (bypasses RLS) and
-- read back through the backend's GET /share/{token} (also service-role), so the
-- public /share/[token] page never needs the anon key or a public RLS policy.
-- RLS is left ENABLED with no policies: anon/authenticated clients get nothing
-- directly, only the service role can touch the table.

create table if not exists public.shared_results (
  token        uuid primary key default gen_random_uuid(),
  query        text not null,
  papers       jsonb not null default '[]'::jsonb,
  synthesis    text not null default '',
  output_mode  text not null default 'synthesis'
                 check (output_mode in ('synthesis', 'matrix')),
  created_at   timestamptz not null default now()
);

-- ── Row Level Security ──────────────────────────────────────────────────────
-- Enabled with no policies → only the service-role key can read or write.
alter table public.shared_results enable row level security;
