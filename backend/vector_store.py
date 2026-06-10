"""pgvector-backed store for embedded chunks (Supabase).

Wraps the `doc_chunks` table + `match_doc_chunks` RPC from migration 006. Used by
the paper cache (global chunks) and the BYO-PDF library (per-user chunks).

Embeddings are produced locally by embeddings.py. All writes are best-effort and
guarded by `if not sb` so a missing Supabase config never crashes a caller.
"""

from __future__ import annotations

import logging

from supabase_client import sb
import embeddings

logger = logging.getLogger("vector_store")


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
