"""pgvector-backed store for embedded chunks (Supabase).

Wraps the `doc_chunks` table + `match_doc_chunks` RPC from migration 006. Used by
the paper cache (global chunks) and the BYO-PDF library (per-user chunks).

Embeddings come from the hosted provider in embeddings.py (Voyage or Gemini).
All writes are best-effort and guarded by `if not sb` so a missing Supabase
config never crashes a caller.
"""

from __future__ import annotations

import logging
import os

from supabase_client import sb
import embeddings

logger = logging.getLogger("vector_store")

# How many chunks to embed+write per round trip during background indexing. Small
# enough that progress (and resume granularity) is fine-grained; embed_texts still
# sub-batches under the provider's TPM cap inside each call.
_STORE_BATCH = int(os.getenv("STORE_BATCH", "24"))


def _to_pgvector(vec: list[float]) -> str:
    """pgvector accepts its text form '[v1,v2,...]' for both inserts and rpc args."""
    return "[" + ",".join(repr(float(x)) for x in vec) + "]"


def has_doc(source_type: str, doc_id: str, owner_id: str | None = None) -> bool:
    """True if this doc already has chunks stored — lets callers process once, ever."""
    if not sb:
        return False
    try:
        q = (
            sb.table("doc_chunks").select("id")
            .eq("source_type", source_type).eq("doc_id", doc_id).limit(1)
        )
        q = q.is_("owner_id", "null") if owner_id is None else q.eq("owner_id", owner_id)
        return bool((q.execute().data))
    except Exception as e:
        logger.warning("has_doc failed (%s: %s)", type(e).__name__, e)
        return False


def upsert_chunks(
    *,
    source_type: str,
    doc_id: str,
    chunks: list[str],
    owner_id: str | None = None,
    metadata: dict | None = None,
) -> int:
    """Embed and store chunks for a document. Returns the number of chunks written.

    No-op (returns 0) when Supabase is unconfigured or there's nothing to store.
    """
    if not sb or not chunks:
        return 0
    vectors = embeddings.embed_texts(chunks)
    rows = [
        {
            "owner_id": owner_id,
            "source_type": source_type,
            "doc_id": doc_id,
            "chunk_index": i,
            "content": chunk,
            "embedding": _to_pgvector(vec),
            "metadata": metadata or {},
        }
        for i, (chunk, vec) in enumerate(zip(chunks, vectors))
    ]
    try:
        sb.table("doc_chunks").upsert(
            rows, on_conflict="source_type,doc_id,chunk_index,owner_id"
        ).execute()
        return len(rows)
    except Exception as e:
        logger.warning("upsert_chunks failed (%s: %s)", type(e).__name__, e)
        return 0


def store_pending_chunks(
    *,
    source_type: str,
    doc_id: str,
    owner_id: str | None,
    chunks: list[str],
    metadata: dict | None = None,
    on_progress=None,
) -> int:
    """Embed + store ``chunks`` in resumable batches; return total chunks stored.

    Unlike ``upsert_chunks`` (one all-or-nothing call), this writes per batch and
    skips chunk indexes already stored for this doc — so a background worker that
    died (redeploy) or paused (daily-quota wall) resumes without re-embedding what
    it already did. ``on_progress(done)`` is called after each batch with the
    running total. Embedding errors (incl. EmbeddingQuotaError) propagate so the
    caller can record the right status.
    """
    if not sb or not chunks:
        return 0

    existing = (
        sb.table("doc_chunks").select("chunk_index")
        .eq("source_type", source_type).eq("doc_id", doc_id)
    )
    existing = (existing.is_("owner_id", "null") if owner_id is None
                else existing.eq("owner_id", owner_id))
    done_idx = {r["chunk_index"] for r in (existing.execute().data or [])}
    todo = [(i, c) for i, c in enumerate(chunks) if i not in done_idx]
    done = len(done_idx)
    if on_progress and done:
        on_progress(done)

    for j in range(0, len(todo), _STORE_BATCH):
        slice_ = todo[j : j + _STORE_BATCH]
        vectors = embeddings.embed_texts([c for _, c in slice_])
        rows = [
            {
                "owner_id": owner_id,
                "source_type": source_type,
                "doc_id": doc_id,
                "chunk_index": i,
                "content": c,
                "embedding": _to_pgvector(vec),
                "metadata": metadata or {},
            }
            for (i, c), vec in zip(slice_, vectors)
        ]
        sb.table("doc_chunks").upsert(
            rows, on_conflict="source_type,doc_id,chunk_index,owner_id"
        ).execute()
        done += len(rows)
        if on_progress:
            on_progress(done)
    return done


def reembed_all(batch: int = 100) -> dict:
    """Re-embed every stored chunk with the active provider (after a provider swap).

    Vectors from different providers aren't comparable, so after switching
    (Voyage ↔ Gemini) every stored embedding must be regenerated or retrieval
    silently breaks. Pages through doc_chunks by id and rewrites each row's
    embedding from its stored content. Returns {"updated": n, "failed": n}.
    """
    if not sb:
        return {"updated": 0, "failed": 0, "error": "supabase_unconfigured"}
    updated = failed = 0
    offset = 0
    while True:
        res = (
            sb.table("doc_chunks").select("id, content")
            .order("id").range(offset, offset + batch - 1).execute()
        )
        rows = res.data or []
        if not rows:
            break
        vectors = embeddings.embed_texts([r["content"] for r in rows])
        for row, vec in zip(rows, vectors):
            try:
                sb.table("doc_chunks").update(
                    {"embedding": _to_pgvector(vec)}
                ).eq("id", row["id"]).execute()
                updated += 1
            except Exception as e:
                logger.warning("reembed update failed for %s (%s: %s)",
                               row["id"], type(e).__name__, e)
                failed += 1
        if len(rows) < batch:
            break
        offset += batch
    return {"updated": updated, "failed": failed}


def search(
    query: str,
    *,
    source_type: str | None = None,
    owner_id: str | None = None,
    k: int = 8,
) -> list[dict]:
    """Semantic search: embed the query, return the k most similar chunks.

    With ``owner_id`` set, the RPC matches that user's chunks plus any global
    (owner-NULL) chunks. Returns [] on any failure.
    """
    if not sb:
        return []
    try:
        qv = _to_pgvector(embeddings.embed_query(query))
        res = sb.rpc(
            "match_doc_chunks",
            {
                "query_embedding": qv,
                "match_count": k,
                "filter_source": source_type,
                "filter_owner": owner_id,
            },
        ).execute()
        return res.data or []
    except Exception as e:
        logger.warning("vector search failed (%s: %s)", type(e).__name__, e)
        return []
