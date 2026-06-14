"""Bring-Your-Own-PDF library (Task 1.3).

Users upload PDFs they have legitimate access to; we extract the text server-side,
chunk + embed it, and store it privately per-user in pgvector (doc_chunks with
source_type='library', owner_id=<uid>). A library_documents row tracks each upload
for the Library list / delete / quota. Library papers are private to the user,
never shared and never used for training — this is the legal route to covering
paywalled work without Researca ever fetching it.
"""

from __future__ import annotations

import io
import logging
import uuid

from supabase_client import sb
import chunking
import embeddings
import vector_store

logger = logging.getLogger("library")

# Stored-document caps per tier (Task 1.3 spec: 100 free / 1000 Pro).
STORAGE_CAPS = {"anonymous": 0, "free": 100, "pro": 1000, "lab": 2000}

MAX_PDF_BYTES = 25 * 1024 * 1024  # 25 MB guardrail

# Background-indexing lifecycle (migration 010). A row is created 'indexing' and
# its chunks are embedded by a background worker that flips it to 'ready'. A daily
# embedding-quota wall parks it at 'paused' (resumes automatically); a hard error
# lands at 'failed'. Pre-010 rows default to 'ready' so existing libraries work.
STATUS_INDEXING = "indexing"
STATUS_READY = "ready"
STATUS_PAUSED = "paused"
STATUS_FAILED = "failed"
# Statuses the periodic sweep should (re)enqueue.
RESUMABLE_STATUSES = (STATUS_INDEXING, STATUS_PAUSED)


class LibraryError(Exception):
    """A user-facing problem with an upload (bad PDF, over quota, etc.)."""


def storage_cap(tier: str) -> int:
    return STORAGE_CAPS.get(tier, STORAGE_CAPS["free"])


def extract_pdf_text(data: bytes) -> tuple[str, int]:
    """Extract text from a PDF byte string → (text, page_count). Raises LibraryError."""
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(data))
        pages = len(reader.pages)
        text = "\n".join((page.extract_text() or "") for page in reader.pages)
        return text.strip(), pages
    except Exception as e:
        raise LibraryError(f"Could not read this PDF ({type(e).__name__}). Is it a valid, text-based PDF?") from e


def count_documents(owner_id: str) -> int:
    if not sb:
        return 0
    try:
        res = (
            sb.table("library_documents").select("id", count="exact")
            .eq("owner_id", owner_id).execute()
        )
        return res.count or 0
    except Exception as e:
        logger.warning("count_documents failed (%s: %s)", type(e).__name__, e)
        return 0


def list_documents(owner_id: str) -> list[dict]:
    if not sb:
        return []
    try:
        res = (
            sb.table("library_documents")
            .select("id, title, filename, pages, chunk_count, status, "
                    "chunks_total, chunks_done, error, created_at")
            .eq("owner_id", owner_id).order("created_at", desc=True).execute()
        )
        return res.data or []
    except Exception as e:
        logger.warning("list_documents failed (%s: %s)", type(e).__name__, e)
        return []


def delete_document(owner_id: str, doc_id: str) -> bool:
    """Delete a library document and all its embedded chunks. Returns True on success."""
    if not sb:
        return False
    try:
        # Chunks first (orphan-safe), then the tracking row — both scoped to owner.
        sb.table("doc_chunks").delete().eq("source_type", "library") \
            .eq("doc_id", doc_id).eq("owner_id", owner_id).execute()
        sb.table("library_documents").delete() \
            .eq("id", doc_id).eq("owner_id", owner_id).execute()
        return True
    except Exception as e:
        logger.warning("delete_document failed (%s: %s)", type(e).__name__, e)
        return False


def delete_all_documents(owner_id: str) -> bool:
    """Delete ALL of a user's library documents and their chunks. For data deletion."""
    if not sb:
        return False
    try:
        sb.table("doc_chunks").delete() \
            .eq("source_type", "library").eq("owner_id", owner_id).execute()
        sb.table("library_documents").delete().eq("owner_id", owner_id).execute()
        return True
    except Exception as e:
        logger.warning("delete_all_documents failed (%s: %s)", type(e).__name__, e)
        return False


def create_document(owner_id: str, tier: str, *, data: bytes, filename: str, title: str | None = None) -> dict:
    """Accept an upload: enforce quota, extract + chunk, store the doc as 'indexing'.

    Returns FAST — the (slow, rate-limited) embedding is left to a background
    worker via ``index_document``. The chunk texts are parked on ``pending_chunks``
    so the worker (and the resume sweep) can embed them without re-parsing the PDF.
    Raises LibraryError on quota/parse problems so the API can return a clean 4xx.
    """
    if not sb:
        raise LibraryError("Library storage is unavailable right now.")
    if not data:
        raise LibraryError("The uploaded file was empty.")
    if len(data) > MAX_PDF_BYTES:
        raise LibraryError("PDF is too large (max 25 MB).")

    cap = storage_cap(tier)
    if cap <= 0:
        raise LibraryError("Sign in to build a library.")
    if count_documents(owner_id) >= cap:
        raise LibraryError(
            f"You've reached your library limit of {cap} papers on the {tier} plan."
        )

    text, pages = extract_pdf_text(data)
    if not text:
        raise LibraryError("No extractable text found — this looks like a scanned/image-only PDF.")

    doc_title = (title or filename or "Untitled").strip()[:300]
    doc_id = str(uuid.uuid4())
    chunks = chunking.chunk_text(text)
    if not chunks:
        raise LibraryError("Couldn't index this PDF. Please try again.")

    row = {
        "id": doc_id,
        "owner_id": owner_id,
        "title": doc_title,
        "filename": filename,
        "pages": pages,
        "chunk_count": 0,
        "status": STATUS_INDEXING,
        "chunks_total": len(chunks),
        "chunks_done": 0,
        "pending_chunks": chunks,
    }
    try:
        sb.table("library_documents").insert(row).execute()
    except Exception as e:
        logger.warning("library_documents insert failed (%s: %s)", type(e).__name__, e)
        raise LibraryError("Couldn't save this document. Please try again.") from e

    return {
        "id": doc_id, "title": doc_title, "filename": filename, "pages": pages,
        "chunk_count": 0, "status": STATUS_INDEXING,
        "chunks_total": len(chunks), "chunks_done": 0,
    }


def index_document(owner_id: str, doc_id: str) -> None:
    """Background worker: embed a doc's pending chunks and finalize its status.

    Idempotent and resume-safe — re-running picks up where it left off (skips
    already-embedded chunks) and is a no-op once the doc is 'ready'. Records
    'paused' on a daily-quota wall (the sweep retries it) and 'failed' on a hard
    error. Never raises; this runs detached from any request.
    """
    if not sb:
        return
    try:
        res = (
            sb.table("library_documents")
            .select("id, title, filename, status, pending_chunks")
            .eq("id", doc_id).eq("owner_id", owner_id).limit(1).execute()
        )
        rows = res.data or []
        if not rows or rows[0]["status"] == STATUS_READY:
            return
        row = rows[0]
        chunks = row.get("pending_chunks") or []
        if not chunks:
            sb.table("library_documents").update(
                {"status": STATUS_READY}
            ).eq("id", doc_id).eq("owner_id", owner_id).execute()
            return

        def _progress(done: int) -> None:
            try:
                sb.table("library_documents").update(
                    {"chunks_done": done}
                ).eq("id", doc_id).eq("owner_id", owner_id).execute()
            except Exception:  # progress is best-effort, never fails the embed
                pass

        stored = vector_store.store_pending_chunks(
            source_type="library",
            doc_id=doc_id,
            owner_id=owner_id,
            chunks=chunks,
            metadata={"title": row["title"], "filename": row.get("filename")},
            on_progress=_progress,
        )
        sb.table("library_documents").update({
            "status": STATUS_READY,
            "chunk_count": stored,
            "chunks_done": stored,
            "pending_chunks": None,
            "error": None,
        }).eq("id", doc_id).eq("owner_id", owner_id).execute()
        logger.info("indexed library doc %s (%s chunks)", doc_id, stored)
    except embeddings.EmbeddingQuotaError:
        # Daily free-tier cap. Keep pending_chunks so the sweep resumes after reset.
        _safe_update(owner_id, doc_id, {
            "status": STATUS_PAUSED,
            "error": "Indexing paused — daily capacity reached. Resumes automatically.",
        })
        logger.info("library doc %s paused on embedding quota", doc_id)
    except Exception as e:
        logger.warning("index_document failed for %s (%s: %s)", doc_id, type(e).__name__, e)
        _safe_update(owner_id, doc_id, {
            "status": STATUS_FAILED,
            "error": "Indexing failed. Try deleting and re-uploading.",
        })


def _safe_update(owner_id: str, doc_id: str, fields: dict) -> None:
    try:
        sb.table("library_documents").update(fields) \
            .eq("id", doc_id).eq("owner_id", owner_id).execute()
    except Exception as e:
        logger.warning("library status update failed (%s: %s)", type(e).__name__, e)


def pending_index_jobs(skip_doc_ids: frozenset[str] = frozenset()) -> list[tuple[str, str]]:
    """(owner_id, doc_id) for docs that still need indexing — for the resume sweep.

    Excludes ``skip_doc_ids`` (jobs a worker is already running this process) to
    avoid re-spawning in-flight work.
    """
    if not sb:
        return []
    try:
        res = (
            sb.table("library_documents").select("id, owner_id")
            .in_("status", list(RESUMABLE_STATUSES)).execute()
        )
        return [(r["owner_id"], r["id"]) for r in (res.data or [])
                if r["id"] not in skip_doc_ids]
    except Exception as e:
        logger.warning("pending_index_jobs failed (%s: %s)", type(e).__name__, e)
        return []


def _ready_doc_ids(owner_id: str) -> set[str]:
    """Doc ids fully embedded for this owner — only these are citable in search."""
    if not sb:
        return set()
    try:
        res = (
            sb.table("library_documents").select("id")
            .eq("owner_id", owner_id).eq("status", STATUS_READY).execute()
        )
        return {r["id"] for r in (res.data or [])}
    except Exception as e:
        logger.warning("_ready_doc_ids failed (%s: %s)", type(e).__name__, e)
        return set()


def search_library(owner_id: str, query: str, *, k: int = 5) -> list[dict]:
    """Return library 'papers' relevant to the query, shaped like pipeline papers.

    Groups the top matching chunks by document, using the best chunk as the
    abstract and tagging coverage as 'Your library'. Merged into search results.
    """
    hits = vector_store.search(query, source_type="library", owner_id=owner_id, k=k * 3)
    ready = _ready_doc_ids(owner_id)  # only fully-indexed docs are citable
    by_doc: dict[str, dict] = {}
    for h in hits:
        doc_id = h.get("doc_id")
        if not doc_id or doc_id not in ready:
            continue
        meta = h.get("metadata") or {}
        entry = by_doc.setdefault(doc_id, {
            "paperId": f"library:{doc_id}",
            "title": meta.get("title") or "Library paper",
            "abstract": "",
            "year": None,
            "citationCount": None,
            "authors": [],
            "url": None,
            "externalIds": {},
            "venue": "Your library",
            "source": "library",
            "coverage": {"badge": "library", "label": "Your library", "source": "library"},
            "_score": 0.0,
        })
        # Keep the highest-similarity chunk as the representative abstract.
        if (h.get("similarity") or 0) > entry["_score"]:
            entry["_score"] = h.get("similarity") or 0
            entry["abstract"] = (h.get("content") or "")[:1500]
    ranked = sorted(by_doc.values(), key=lambda d: d["_score"], reverse=True)
    for d in ranked:
        d.pop("_score", None)
    return ranked[:k]
