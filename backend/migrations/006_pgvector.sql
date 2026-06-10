-- pgvector + local-embeddings foundation (unblocks BYO-PDF 1.3 and paper cache 2.2).
-- Run once in the Supabase SQL editor.
--
-- Embeddings are produced by the Voyage API model 'voyage-3-lite', which outputs
-- 512-dim vectors — hence vector(512). If you swap the model, change the dimension
-- here AND in backend/embeddings.py (EMBED_DIM). (Originally vector(384) for the
-- local all-MiniLM-L6-v2 model; migration 008 bumps an already-applied 384 schema.)

create extension if not exists vector;

-- One row per text chunk. Used for both:
--   • global paper chunks  (owner_id NULL, source_type='paper')   → process-once cache
--   • a user's library     (owner_id=<uid>, source_type='library') → BYO-PDF, private
create table if not exists public.doc_chunks (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid,                         -- NULL = global/shared; else the owning user
  source_type  text not null,               -- 'paper' | 'library'
  doc_id       text not null,               -- paperId / arXiv id / uploaded-doc id
  chunk_index  integer not null default 0,
  content      text not null,
  embedding    vector(512) not null,
  metadata     jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  unique (source_type, doc_id, chunk_index, owner_id)
);

-- Approximate-nearest-neighbour index for cosine distance. ivfflat needs ANALYZE
-- after data loads; lists=100 suits up to ~100k rows (raise as the corpus grows).
create index if not exists doc_chunks_embedding_idx
  on public.doc_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create index if not exists doc_chunks_owner_idx
  on public.doc_chunks (owner_id, source_type);

-- Cosine-similarity search callable from the Supabase client via rpc('match_doc_chunks').
-- Returns the closest chunks, optionally filtered to a source type and/or owner
-- (owner filter matches global rows OR the given user's rows).
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
