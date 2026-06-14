-- Background indexing for library uploads (decouple "upload accepted" from
-- "embedding finished"). Run once in the Supabase SQL editor, after 007.
--
-- WHY: embedding ran synchronously inside POST /library/upload. A large PDF =
-- hundreds of chunks, paced under the embedding provider's per-minute token cap,
-- so the request stayed open for many minutes and the platform dropped the
-- connection ("Failed to fetch"). We now store the document immediately with
-- status='indexing' and embed its chunks in a background worker that updates
-- progress and flips the row to 'ready' (or 'paused' on a daily-quota wall,
-- 'failed' on a hard error). A periodic sweep resumes any 'indexing'/'paused'
-- row, so a redeploy mid-embed or a spent free-tier quota self-heals.

alter table public.library_documents
  add column if not exists status        text not null default 'ready',
  add column if not exists chunks_total   integer,
  add column if not exists chunks_done     integer not null default 0,
  add column if not exists pending_chunks  jsonb,    -- chunk texts awaiting embedding; cleared when ready
  add column if not exists error           text;

-- The background sweep scans for rows still needing work.
create index if not exists library_documents_status_idx
  on public.library_documents (status)
  where status in ('indexing', 'paused');
