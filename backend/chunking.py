"""Text chunking for embeddings (shared by the paper cache and BYO-PDF library).

Splits long text into overlapping, sentence-aware chunks small enough to embed
well. Pure and dependency-free so it can be unit-tested without a model.
"""

from __future__ import annotations

import re

DEFAULT_MAX_CHARS = 1200
DEFAULT_OVERLAP = 150

_SENT_SPLIT = re.compile(r"(?<=[.!?])\s+")


def chunk_text(text: str, *, max_chars: int = DEFAULT_MAX_CHARS, overlap: int = DEFAULT_OVERLAP) -> list[str]:
    """Split ``text`` into chunks of <= max_chars, breaking on sentence boundaries.

    Consecutive chunks share ``overlap`` characters of tail context so a fact that
    straddles a boundary isn't lost. Returns [] for empty input.
    """
    text = re.sub(r"\s+", " ", text or "").strip()
    if not text:
        return []
    if len(text) <= max_chars:
        return [text]

    sentences = _SENT_SPLIT.split(text)
    chunks: list[str] = []
    current = ""
    for sent in sentences:
        # A single sentence longer than the budget gets hard-split.
        if len(sent) > max_chars:
            if current:
                chunks.append(current.strip())
                current = ""
            for i in range(0, len(sent), max_chars):
                chunks.append(sent[i : i + max_chars].strip())
            continue
        if current and len(current) + 1 + len(sent) > max_chars:
            chunks.append(current.strip())
            tail = current[-overlap:] if overlap else ""
            current = (tail + " " + sent).strip()
        else:
            current = (current + " " + sent).strip() if current else sent
    if current.strip():
        chunks.append(current.strip())
    return [c for c in chunks if c]
