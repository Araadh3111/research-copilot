"""Text embeddings via a hosted API — Voyage AI or Google AI Studio (Gemini).

Originally local sentence-transformers (all-MiniLM-L6-v2), swapped to the Voyage
API because torch OOM'd on Railway. Voyage's no-payment-method tier then proved
too small for real use (~3 requests/min — one PDF upload trips 429 even with
backoff), so Google AI Studio's gemini-embedding-001 was added as a switchable
provider: its free tier (~100 RPM) comfortably covers PDF-upload embedding
bursts and needs no credit card.

Provider selection (checked once at import):
  • EMBED_PROVIDER=voyage|gemini forces a provider explicitly.
  • Otherwise: Gemini if GEMINI_API_KEY (or GOOGLE_API_KEY) is set, else Voyage.

Both providers are pinned to EMBED_DIM (512) so vectors keep matching
vector(512) in migrations 006/008 — no migration, no schema change. BUT vectors
from the two providers live in different spaces: after switching providers with
data already in doc_chunks, re-embed it (POST /admin/reembed) or retrieval
silently degrades to garbage.

The public interface is stable — ``embed_texts``, ``embed_query``,
``is_available``, ``EMBED_DIM``, ``MODEL_NAME`` (plus ``PROVIDER``) — so
paper_cache, vector_store and /admin/embed-check work regardless of provider.

Asymmetry: document chunks are embedded as documents and queries as queries
(Voyage input_type document/query; Gemini taskType RETRIEVAL_DOCUMENT/
RETRIEVAL_QUERY), which both providers use to produce retrieval-tuned vectors.
"""

from __future__ import annotations

import math
import os
import threading
import time

import requests

# Both models support Matryoshka/truncated output dimensions; we PIN 512 via the
# request payload on EVERY call — voyage-3.5-lite otherwise defaults to 1024 and
# gemini-embedding-001 to 3072, either of which breaks the vector(512) column.
# To move to another dim: bump EMBED_DIM AND add a migration retyping
# doc_chunks.embedding + the match_doc_chunks RPC, then re-embed.
EMBED_DIM = int(os.getenv("EMBED_DIM", "512"))

_VOYAGE_KEY = os.getenv("VOYAGE_API_KEY", "")
_GEMINI_KEY = os.getenv("GEMINI_API_KEY", "") or os.getenv("GOOGLE_API_KEY", "")

_VOYAGE_MODEL = os.getenv("VOYAGE_MODEL", "voyage-3.5-lite")
_GEMINI_MODEL = os.getenv("GEMINI_EMBED_MODEL", "gemini-embedding-001")


def _pick_provider() -> str:
    explicit = os.getenv("EMBED_PROVIDER", "").strip().lower()
    if explicit in ("voyage", "gemini"):
        return explicit
    return "gemini" if _GEMINI_KEY else "voyage"


PROVIDER = _pick_provider()
MODEL_NAME = _GEMINI_MODEL if PROVIDER == "gemini" else _VOYAGE_MODEL

_VOYAGE_URL = "https://api.voyageai.com/v1/embeddings"
_GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"{_GEMINI_MODEL}:batchEmbedContents"
)
_TIMEOUT = float(os.getenv("EMBED_TIMEOUT", os.getenv("VOYAGE_TIMEOUT", "30")))
# Voyage accepts up to 1,000 texts per request, Gemini's batch endpoint up to 100.
# We batch small anyway to stay under per-request token caps and keep each HTTP
# round-trip quick.
_BATCH = min(int(os.getenv("VOYAGE_BATCH", "128")), 100)
# Retry on 429 (rate limit) / 5xx so a transient limit doesn't hard-fail an
# upload. Honors a Retry-After header when present, else exponential backoff.
_MAX_RETRIES = int(os.getenv("VOYAGE_MAX_RETRIES", "4"))
_RETRY_STATUSES = {429, 500, 502, 503, 504}

# Gemini's free embedding tier is generous on requests (~100/min) but tight on
# TOKENS (~30K/min) — one PDF's chunk burst (1200-char chunks ≈ 300 tokens each)
# blows that cap in a single 100-text batch. So the Gemini path uses smaller
# batches and paces itself against a rolling 60-second token budget instead of
# slamming into 429s and exhausting retries.
_GEMINI_BATCH = int(os.getenv("GEMINI_BATCH", "24"))
_GEMINI_TPM = int(os.getenv("GEMINI_TPM", "24000"))  # safety margin under 30K
_tpm_lock = threading.Lock()
_tpm_window: list[tuple[float, int]] = []  # (monotonic time, est tokens) per request


def _est_tokens(texts: list[str]) -> int:
    """Rough token estimate (~4 chars/token) plus per-text overhead."""
    return sum(len(t) for t in texts) // 4 + 8 * len(texts)


def _gemini_pace(tokens: int) -> None:
    """Block until ``tokens`` fits the rolling per-minute Gemini token budget."""
    while True:
        with _tpm_lock:
            now = time.monotonic()
            while _tpm_window and now - _tpm_window[0][0] > 60:
                _tpm_window.pop(0)
            spent = sum(t for _, t in _tpm_window)
            if spent + tokens <= _GEMINI_TPM or not _tpm_window:
                _tpm_window.append((now, tokens))
                return
            wait = 60 - (now - _tpm_window[0][0]) + 0.5
        time.sleep(min(max(wait, 0.5), 61))


def is_available() -> bool:
    """True if embeddings can be produced (the active provider's key is set)."""
    return bool(_GEMINI_KEY if PROVIDER == "gemini" else _VOYAGE_KEY)


def _normalize(vec: list[float]) -> list[float]:
    """Scale to unit length — Gemini vectors below 3072 dims aren't normalized."""
    norm = math.sqrt(sum(x * x for x in vec))
    return [x / norm for x in vec] if norm > 1e-9 else vec


def _embed_voyage(batch: list[str], input_type: str) -> list[list[float]]:
    headers = {"Authorization": f"Bearer {_VOYAGE_KEY}", "Content-Type": "application/json"}
    payload = {
        "input": batch,
        "model": _VOYAGE_MODEL,
        "input_type": input_type,
        # Pin Matryoshka output to EMBED_DIM (512) — voyage-3.5-lite would
        # otherwise return its 1024-dim default and break the 512 column.
        "output_dimension": EMBED_DIM,
    }
    resp = _post_with_retry(_VOYAGE_URL, headers, payload)
    resp.raise_for_status()
    data = resp.json().get("data", [])
    # Voyage tags each item with its input index; sort to guarantee order.
    data.sort(key=lambda d: d.get("index", 0))
    return [d["embedding"] for d in data]


def _embed_gemini(batch: list[str], input_type: str) -> list[list[float]]:
    _gemini_pace(_est_tokens(batch))
    headers = {"x-goog-api-key": _GEMINI_KEY, "Content-Type": "application/json"}
    task = "RETRIEVAL_QUERY" if input_type == "query" else "RETRIEVAL_DOCUMENT"
    payload = {
        "requests": [
            {
                "model": f"models/{_GEMINI_MODEL}",
                "content": {"parts": [{"text": text}]},
                "taskType": task,
                # Pin truncated output to EMBED_DIM (512) — the model's 3072-dim
                # default would break the vector(512) column.
                "outputDimensionality": EMBED_DIM,
            }
            for text in batch
        ]
    }
    resp = _post_with_retry(_GEMINI_URL, headers, payload)
    resp.raise_for_status()
    items = resp.json().get("embeddings", [])  # same order as the requests array
    return [_normalize(item["values"]) for item in items]


def _embed(texts: list[str], input_type: str) -> list[list[float]]:
    """Embed ``texts`` with the active provider; vectors come back in input order."""
    if not texts:
        return []
    if not is_available():
        key = "GEMINI_API_KEY" if PROVIDER == "gemini" else "VOYAGE_API_KEY"
        raise RuntimeError(f"{key} is not set — cannot produce embeddings.")

    embed_batch = _embed_gemini if PROVIDER == "gemini" else _embed_voyage
    batch_size = _GEMINI_BATCH if PROVIDER == "gemini" else _BATCH
    out: list[list[float]] = []
    for i in range(0, len(texts), batch_size):
        out.extend(embed_batch(texts[i : i + batch_size], input_type))
    return out


def _post_with_retry(url: str, headers: dict, payload: dict) -> requests.Response:
    """POST to the provider, retrying on 429/5xx with Retry-After-aware backoff.

    Returns the final Response (caller still calls raise_for_status, so a
    non-retryable 4xx or an exhausted-retry 429 still surfaces as an error).
    """
    resp = None
    for attempt in range(_MAX_RETRIES + 1):
        resp = requests.post(url, headers=headers, json=payload, timeout=_TIMEOUT)
        if resp.status_code not in _RETRY_STATUSES or attempt == _MAX_RETRIES:
            return resp
        time.sleep(min(_retry_delay(resp, attempt), 65.0))
    return resp  # pragma: no cover — loop always returns inside


def _retry_delay(resp: requests.Response, attempt: int) -> float:
    """How long to wait before retrying: server hint > exponential backoff.

    Voyage sends a Retry-After header; Google sends RetryInfo with a
    "retryDelay" like "39s" inside the 429's JSON error details. A TPM-limit
    429 only clears when the 60s window rolls, so honoring the hint matters.
    """
    retry_after = resp.headers.get("Retry-After")
    if retry_after:
        try:
            return float(retry_after)
        except ValueError:
            pass
    try:
        for detail in resp.json().get("error", {}).get("details", []):
            delay = str(detail.get("retryDelay", "")).rstrip("s")
            if delay:
                return float(delay)
    except Exception:
        pass
    return 2.0 ** attempt


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a batch of documents → list of 512-dim vectors."""
    return _embed(texts, "document")


def embed_query(text: str) -> list[float]:
    """Embed a single query/string → one 512-dim vector."""
    return _embed([text], "query")[0]
