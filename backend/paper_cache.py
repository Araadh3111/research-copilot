"""Global paper-embedding cache — "process once, ever" (Task 2.2).

The same arXiv/S2 paper shouldn't be re-embedded for every user and query. This
caches each paper's (title+abstract) embedding once, keyed by paperId, in the
shared pgvector table (doc_chunks, source_type='paper', owner_id NULL). Cached
vectors power a semantic pre-filter for ranking, so retrieval runs against cheap
cached artifacts and only the final synthesis call ever spends fresh model tokens.

Embeddings are produced by the LOCAL model (embeddings.py). All Supabase access is
best-effort: any failure degrades to "not cached" and the caller falls back to the
lexical pre-filter, so this can never break a search.
"""

from __future__ import annotations

import logging
import math

from supabase_client import sb
import embeddings as emb
import vector_store

logger = logging.getLogger("paper_cache")


def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b:
        return -1.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return -1.0
    return dot / (na * nb)


def _parse_vector(raw) -> list[float]:
    """pgvector returns its text form '[v1,v2,...]'; turn it back into floats."""
    if isinstance(raw, list):
        return [float(x) for x in raw]
    if isinstance(raw, str) and raw.startswith("["):
        try:
            return [float(x) for x in raw.strip("[]").split(",") if x.strip()]
        except ValueError:
            return []
    return []


def _paper_text(paper: dict) -> str:
    return f"{(paper.get('title') or '').strip()}. {(paper.get('abstract') or '').strip()}".strip()


def _fetch_cached(paper_ids: list[str]) -> dict[str, list[float]]:
    """Read cached embeddings for these paperIds (chunk_index 0, global rows)."""
    if not sb or not paper_ids:
        return {}
    out: dict[str, list[float]] = {}
    try:
        res = (
            sb.table("doc_chunks").select("doc_id, embedding")
            .eq("source_type", "paper").eq("chunk_index", 0)
            .in_("doc_id", paper_ids).execute()
        )
        for row in res.data or []:
            vec = _parse_vector(row.get("embedding"))
            if vec:
                out[row["doc_id"]] = vec
    except Exception as e:
        logger.warning("_fetch_cached failed (%s: %s)", type(e).__name__, e)
    return out


def get_or_embed(papers: list[dict]) -> dict[str, list[float]]:
    """Return {paperId: embedding}, embedding+caching any paper not already cached."""
    ids = [p["paperId"] for p in papers if p.get("paperId")]
    cached = _fetch_cached(ids)

    missing = [p for p in papers if p.get("paperId") and p["paperId"] not in cached]
    if missing:
        vectors = emb.embed_texts([_paper_text(p) for p in missing])
        for paper, vec in zip(missing, vectors):
            cached[paper["paperId"]] = vec
            # Persist once (best-effort) so the next query touching this paper is free.
            try:
                vector_store.upsert_chunks(
                    source_type="paper",
                    doc_id=paper["paperId"],
                    chunks=[_paper_text(paper)],
                    owner_id=None,
                    metadata={"title": paper.get("title")},
                )
            except Exception as e:
                logger.warning("cache write failed (%s: %s)", type(e).__name__, e)
    return cached


def semantic_prefilter(query: str, pool: list[dict], limit: int) -> list[dict]:
    """Rank the pool by cosine similarity of cached/just-embedded paper vectors.

    Returns the top `limit` papers. Raises on embedding failure so the caller can
    fall back to the lexical pre-filter.
    """
    vecs = get_or_embed(pool)
    qv = emb.embed_query(query)

    def score(paper):
        v = vecs.get(paper.get("paperId"))
        return (_cosine(qv, v), paper.get("citationCount") or 0)

    return sorted(pool, key=score, reverse=True)[:limit]
