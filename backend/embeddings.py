"""Local text embeddings (no external API key).

Uses sentence-transformers 'all-MiniLM-L6-v2' — small (~80MB), fast on CPU, and
produces 384-dim vectors. Runs entirely on our own backend, so paper/library
text is never sent to a third-party embedding service.

The model is loaded lazily on first use (a few seconds, once per process) and
cached. sentence-transformers is imported lazily too, so this module — and the
rest of the backend — imports cleanly even where the heavy dependency isn't
installed (e.g. a lightweight test environment). Call sites that actually need
embeddings will get a clear ImportError if the dependency is missing.
"""

from __future__ import annotations

import os
import threading

# Must match vector(384) in migration 006 and the chosen model's output size.
EMBED_DIM = 384
MODEL_NAME = os.getenv("EMBED_MODEL", "all-MiniLM-L6-v2")

_model = None
_lock = threading.Lock()


def _get_model():
    """Load (once) and return the SentenceTransformer model. Thread-safe."""
    global _model
    if _model is None:
        with _lock:
            if _model is None:
                from sentence_transformers import SentenceTransformer  # lazy, heavy
                _model = SentenceTransformer(MODEL_NAME)
    return _model


def is_available() -> bool:
    """True if the embedding backend can be loaded (dependency installed)."""
    try:
        import sentence_transformers  # noqa: F401
        return True
    except Exception:
        return False


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a batch of texts → list of 384-dim float vectors."""
    if not texts:
        return []
    model = _get_model()
    vectors = model.encode(texts, normalize_embeddings=True, convert_to_numpy=True)
    return [v.tolist() for v in vectors]


def embed_query(text: str) -> list[float]:
    """Embed a single query/string → one 384-dim float vector."""
    return embed_texts([text])[0]
