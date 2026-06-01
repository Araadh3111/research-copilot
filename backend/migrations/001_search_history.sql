-- Search history for logged-in users.
-- Run once in the Supabase SQL editor (project ref kkqydqziyfjhslkkzhxq).
--
-- The backend inserts rows with the service-role key (bypasses RLS); the
-- frontend reads them with the user's JWT, so RLS must restrict every read to
-- the caller's own rows.

create table if not exists public.search_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  query       text not null,
  output_mode text not null default 'synthesis'
                check (output_mode in ('synthesis', 'matrix')),
  created_at  timestamptz not null default now()
);

-- Fast "my most recent searches" lookups.
create index if not exists search_history_user_created_idx
  on public.search_history (user_id, created_at desc);

-- ── Row Level Security ──────────────────────────────────────────────────────
alter table public.search_history enable row level security;

-- A user can only ever see (and delete) their own history.
drop policy if exists "own history select" on public.search_history;
create policy "own history select"
  on public.search_history for select
  using (auth.uid() = user_id);

drop policy if exists "own history insert" on public.search_history;
create policy "own history insert"
  on public.search_history for insert
  with check (auth.uid() = user_id);

drop policy if exists "own history delete" on public.search_history;
create policy "own history delete"
  on public.search_history for delete
  using (auth.uid() = user_id);
