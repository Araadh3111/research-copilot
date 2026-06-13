-- Fix silent retrieval failure: replace the ivfflat ANN index with HNSW.
-- Run once in the Supabase SQL editor, AFTER 006/008. No re-embed needed —
-- only the index changes; stored vectors and the match_doc_chunks RPC are kept.
--
-- WHY: 006/008 built `doc_chunks_embedding_idx` as ivfflat with lists=100. ivfflat
-- computes its cluster centroids at index-BUILD time (the table was empty then)
-- and pgvector's default ivfflat.probes=1 scans only ONE cluster per query. On a
-- small table each cluster holds ~1 vector, so match_doc_chunks returned ~1 row
-- for ANY query regardless of match_count — verified live: a self-match query
-- (a chunk's own embedding) with match_count=50 returned 1 hit out of 87 rows.
-- Effect: uploaded library PDFs embedded + stored correctly but never surfaced in
-- search (search_library got nothing back), so they were never cited.
--
-- HNSW has no build-time clustering and no probes cliff: it gives near-exact
-- recall on small tables out of the box (ef_search default 40) and scales to large
-- ones. pgvector >= 0.5 (Supabase) supports it.

drop index if exists public.doc_chunks_embedding_idx;

create index if not exists doc_chunks_embedding_idx
  on public.doc_chunks using hnsw (embedding vector_cosine_ops);

-- (Optional) raise recall further per session if ever needed:
--   set hnsw.ef_search = 100;
