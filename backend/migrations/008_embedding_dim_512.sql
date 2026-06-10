-- Embedding dimension 384 → 512 for the Voyage swap (voyage-3-lite).
-- Run AFTER 006. Safe + idempotent:
--   • doc_chunks holds no embeddings yet (the local MiniLM model OOM'd on Railway
--     before any insert ever succeeded), so retyping the vector column loses nothing.
--   • If you applied the NEW 006 (already vector(512)), every statement here is a
--     harmless no-op. If you applied the OLD 006 (vector(384)), this fixes it to 512.
-- Run once in the Supabase SQL editor.

-- Drop the function + ANN index first (both reference the column's dimension).
drop function if exists public.match_doc_chunks(vector, int, text, uuid);
drop index    if exists public.doc_chunks_embedding_idx;

-- Retype the embedding column to 512 dims (instant on an empty table).
alter table public.doc_chunks
  alter column embedding type vector(512);

-- Recreate the cosine-distance ANN index at the new dimension.
create index if not exists doc_chunks_embedding_idx
  on public.doc_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Recreate the search RPC with a 512-dim query parameter.
create or replace function public.match_doc_chunks(
  query_embedding vector(512),
  match_count     int default 8,
  filter_source   text default null,
  filter_owner    uuid default null
)
returns table (
  id uuid, owner_id uuid, source_type text, doc_id text,
  chunk_index int, content text, metadata jsonb, similarity float
)
language sql stable as $$
  select
    c.id, c.owner_id, c.source_type, c.doc_id,
    c.chunk_index, c.content, c.metadata,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.doc_chunks c
  where (filter_source is null or c.source_type = filter_source)
    and (filter_owner is null or c.owner_id = filter_owner or c.owner_id is null)
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
