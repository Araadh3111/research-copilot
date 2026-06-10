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
import vector_store

logger = logging.getLogger("library")

# Stored-document caps per tier (Task 1.3 spec: 100 free / 1000 Pro).
STORAGE_CAPS = {"anonymous": 0, "free": 100, "pro": 1000, "lab": 2000}

MAX_PDF_BYTES = 25 * 1024 * 1024  # 25 MB guardrail


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
            .select("id, title, filename, pages, chunk_count, created_at")
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


def add_document(owner_id: str, tier: str, *, data: bytes, filename: str, title: str | None = None) -> dict:
    """Ingest one uploaded PDF: enforce quota, extract, chunk, embed, store.

    Returns the new document's summary row. Raises LibraryError on quota/parse
    problems so the API can return a clean 4xx.
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

    # Embed + store the chunks first; only record the document if that succeeds,
    # so the Library list never shows a paper with no searchable content.
    stored = vector_store.upsert_chunks(
        source_type="library",
        doc_id=doc_id,
        chunks=chunks,
        owner_id=owner_id,
        metadata={"title": doc_title, "filename": filename},
    )
    if stored == 0:
        raise LibraryError("Couldn't index this PDF. Please try again.")

    row = {
        "id": doc_id,
        "owner_id": owner_id,
        "title": doc_title,
        "filename": filename,
        "pages": pages,
        "chunk_count": stored,
    }
    try:
        sb.table("library_documents").insert(row).execute()
    except Exception as e:
        logger.warning("library_documents insert failed (%s: %s)", type(e).__name__, e)
        raise LibraryError("Couldn't save this document. Please try again.") from e

    return {k: row[k] for k in ("id", "title", "filename", "pages", "chunk_count")}


def search_library(owner_id: str, query: str, *, k: int = 5) -> list[dict]:
    """Return library 'papers' relevant to the query, shaped like pipeline papers.

    Groups the top matching chunks by document, using the best chunk as the
    abstract and tagging coverage as 'Your library'. Merged into search results.
    """
    hits = vector_store.search(query, source_type="library", owner_id=owner_id, k=k * 3)
    by_doc: dict[str, dict] = {}
    for h in hits:
        doc_id = h.get("doc_id")
        if not doc_id:
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
