import re
from datetime import datetime, timedelta, timezone

from supabase_client import sb


def normalize(query: str) -> str:
    """Lowercase + collapse whitespace. Canonical form used as the cache key."""
    return re.sub(r"\s+", " ", query.lower().strip())


def get_cached(query_norm: str, level: str) -> dict | None:
    """Return {synthesis: str, papers: list} for a fresh (<24 h) cache hit, else None."""
    if not sb:
        return None
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        result = (
            sb.table("search_cache")
            .select("synthesis, papers")
            .eq("query_norm", query_norm)
            .eq("level", level)
            .gte("created_at", cutoff)
            .limit(1)
            .execute()
        )
        if result.data:
            return result.data[0]
    except Exception:
        pass
    return None


def store_cache(query_norm: str, level: str, synthesis: str, papers: list) -> None:
    """Upsert one row per (query_norm, level) — always refreshes created_at.

    The UNIQUE constraint on (query_norm, level) means one row per query,
    bounded table size, no stale duplicates accumulating.
    """
    if not sb:
        return
    try:
        sb.table("search_cache").upsert(
            {
                "query_norm": query_norm,
                "level": level,
                "synthesis": synthesis,
                "papers": papers,
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
            on_conflict="query_norm,level",
        ).execute()
    except Exception:
        pass  # cache write failure is non-fatal — pipeline result still returned


def stream_chunks(synthesis: str):
    """Yield cached synthesis line by line so the frontend receives progressive text
    rather than a single large blob (preserves the streaming UX from cache)."""
    lines = synthesis.split("\n")
    for i, line in enumerate(lines):
        yield line + ("\n" if i < len(lines) - 1 else "")
