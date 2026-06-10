"""The single, airtight path for acquiring paper *full text* (Task 1.1).

AUDIT (2026-06): the live pipeline fetches only **abstracts + metadata** from the
Semantic Scholar API (see fetcher.py) and never downloads full-text PDFs, so
there is currently no paywalled-content exposure. This module exists so that the
moment we *do* ingest full text, it can only ever come from a legal open-access
source — enforced here, by construction, rather than trusted to each call site.

Whitelist (legal OA full text only):
  - arXiv          (open access by default)
  - PubMed Central — OA subset only
  - bioRxiv / medRxiv
  - Unpaywall-resolved OA copies of paywalled DOIs
  - DOAJ journals
  - Any openAccessPdf URL surfaced by Semantic Scholar / OpenAlex (already OA)

Anything that does not resolve to one of these is **abstract + metadata only**:
``fetch_full_text`` returns None and the paper is labelled accordingly.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

import requests

# Hosts we accept full-text fetches from. A resolved URL must match one of these
# (or be an explicit openAccessPdf from the metadata provider) or we refuse it.
_OA_HOST_WHITELIST = (
    "arxiv.org",
    "export.arxiv.org",
    "ncbi.nlm.nih.gov",        # PubMed Central
    "europepmc.org",
    "biorxiv.org",
    "medrxiv.org",
    "doaj.org",
)


@dataclass
class Coverage:
    """How much of a paper we can legally read, and from where."""
    full_text_available: bool   # an OA full-text copy exists for this paper
    source: str | None          # 'arxiv' | 'pmc' | 'biorxiv' | 'oa_pdf' | None
    badge: str                  # 'full_text' | 'abstract'  (for the UI)
    label: str                  # human label, e.g. "Open access" / "Abstract only"


def _external_ids(paper: dict) -> dict:
    return paper.get("externalIds") or {}


def _oa_pdf_url(paper: dict) -> str | None:
    url = (paper.get("openAccessPdf") or {}).get("url")
    return url or None


def classify(paper: dict) -> Coverage:
    """Classify a paper's open-access status from its metadata.

    Drives the honest "Full text" / "Abstract only" coverage badge (Task 1.2).
    Note: availability of an OA copy is independent of whether synthesis actually
    read it — today synthesis uses abstracts, so the badge means "an OA full-text
    copy exists you can open in one click", not "we ingested the full text".
    """
    ids = _external_ids(paper)

    if ids.get("ArXiv"):
        return Coverage(True, "arxiv", "full_text", "Open access · arXiv")
    if ids.get("PubMedCentral") or ids.get("PMC"):
        return Coverage(True, "pmc", "full_text", "Open access · PMC")
    if _oa_pdf_url(paper):
        return Coverage(True, "oa_pdf", "full_text", "Open access")

    return Coverage(False, None, "abstract", "Abstract only")


def coverage_dict(paper: dict) -> dict:
    """Serializable coverage info to attach to a paper in the API response."""
    c = classify(paper)
    return {"badge": c.badge, "label": c.label, "source": c.source}


def coverage_note(papers: list[dict]) -> str:
    """One-line honesty note for the synthesis, e.g. used by the UI under results.

    Reflects current reality: synthesis is built from abstracts + metadata, with a
    count of how many of those papers also have an OA full-text copy available.
    """
    n = len(papers)
    oa = sum(1 for p in papers if classify(p).full_text_available)
    if n == 0:
        return ""
    return (
        f"Synthesized from {n} paper{'s' if n != 1 else ''} (abstracts + metadata)"
        f" · {oa} with open-access full text available."
    )


# ── The single guarded full-text fetch path ──────────────────────────────────

_ARXIV_ID_RE = re.compile(r"(\d{4}\.\d{4,5})(v\d+)?")


def _host_allowed(url: str) -> bool:
    return any(h in url for h in _OA_HOST_WHITELIST)


def fetch_full_text(paper: dict, *, timeout: int = 20) -> str | None:
    """Fetch legal OA full text for a paper, or None if no OA copy is whitelisted.

    This is the ONLY function permitted to download paper bodies. It refuses any
    URL whose host is not on the OA whitelist, so a non-OA (paywalled) paper can
    never have its full text fetched, by construction. Returns None on any refusal
    or failure — callers fall back to abstract + metadata.

    (Not wired into the synthesis pipeline yet — synthesis uses abstracts. Present
    so future full-text ingestion has exactly one, enforced, entry point.)
    """
    cov = classify(paper)
    if not cov.full_text_available:
        return None

    url = _oa_pdf_url(paper)
    ids = _external_ids(paper)
    if not url and ids.get("ArXiv"):
        m = _ARXIV_ID_RE.search(str(ids["ArXiv"]))
        if m:
            url = f"https://arxiv.org/abs/{m.group(1)}"

    if not url or not _host_allowed(url):
        return None

    try:
        resp = requests.get(url, timeout=timeout)
        if resp.status_code != 200:
            return None
        return resp.text
    except requests.RequestException:
        return None
