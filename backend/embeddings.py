"""Text embeddings via the Voyage AI API (voyage-3-lite, 512-dim).

Swapped from local sentence-transformers (all-MiniLM-L6-v2) because the torch
runtime OOM'd on Railway under the BYO-PDF library load — torch simply doesn't
fit in production memory. Voyage runs the model server-side, so our backend image
is light (no torch / sentence-transformers) and memory-stable. Paper text and
user-uploaded library text are sent to Voyage's API to be embedded.

The public interface is unchanged from the local version — ``embed_texts``,
``embed_query``, ``is_available``, ``EMBED_DIM``, ``MODEL_NAME`` — so paper_cache,
vector_store and the /admin/embed-check route work without modification.

Asymmetry: document chunks are embedded with input_type='document' and search
queries with input_type='query', which Voyage uses to produce retrieval-tuned
vectors (a small recall win over the old symmetric model).
"""

from __future__ import annotations

import os

import requests

# voyage-3-lite outputs 512-dim vectors — MUST match vector(512) in migrations
# 006/008. If you switch VOYAGE_MODEL (e.g. voyage-3.5-lite → 1024), update
# EMBED_DIM here AND add a migration changing the pgvector column dimension.
MODEL_NAME = os.getenv("VOYAGE_MODEL", "voyage-3-lite")
EMBED_DIM = int(os.getenv("EMBED_DIM", "512"))

_API_URL = "https://api.voyageai.com/v1/embeddings"
_API_KEY = os.getenv("VOYAGE_API_KEY", "")
_TIMEOUT = float(os.getenv("VOYAGE_TIMEOUT", "30"))
# Voyage accepts up to 1,000 texts per request; we batch smaller to stay well
# under the per-request token cap and keep each HTTP round-trip quick.
_BATCH = int(os.getenv("VOYAGE_BATCH", "128"))


def is_available() -> bool:
    """True if embeddings can be produced (the Voyage API key is configured)."""
    return bool(_API_KEY)


def _embed(texts: list[str], input_type: str) -> list[list[float]]:
    """Call Voyage to embed ``texts``; returns vectors in the same order as input."""
    if not texts:
        return []
    if not _API_KEY:
        raise RuntimeError("VOYAGE_API_KEY is not set — cannot produce embeddings.")

    headers = {"Authorization": f"Bearer {_API_KEY}", "Content-Type": "application/json"}
    out: list[list[float]] = []
    for i in range(0, len(texts), _BATCH):
        batch = texts[i : i + _BATCH]
        resp = requests.post(
            _API_URL,
            headers=headers,
            json={"input": batch, "model": MODEL_NAME, "input_type": input_type},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json().get("data", [])
        # Voyage tags each item with its input index; sort to guarantee order.
        data.sort(key=lambda d: d.get("index", 0))
        out.extend(d["embedding"] for d in data)
    return out


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a batch of documents → list of 512-dim vectors (input_type=document)."""
    return _embed(texts, "document")


def embed_query(text: str) -> list[float]:
    """Embed a single query/string → one 512-dim vector (input_type=query)."""
    return _embed([text], "query")[0]
