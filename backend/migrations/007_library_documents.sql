-- BYO-PDF library (Task 1.3). One row per uploaded document; the document's text
-- chunks live in doc_chunks (source_type='library', owner_id=<uid>, doc_id=this id).
-- Run once in the Supabase SQL editor (requires migration 006 first).

create table if not exists public.library_documents (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null,
  title       text not null,
  filename    text,
  pages       integer,
  chunk_count integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists library_documents_owner_idx
  on public.library_documents (owner_id, created_at desc);
