"""arXiv as a first-class source (Task 3.1).

The wedge is ML researchers, and arXiv is ~100% open access and where ML moves.
This fetches from the arXiv API and normalizes results into the SAME paper dict
shape the rest of the pipeline expects (matching Semantic Scholar's fields), so
ranking, synthesis, coverage badges, and export all work unchanged.

Stdlib only (xml.etree) — no new dependency. Best-effort: any failure returns an
empty list so arXiv augments the Semantic Scholar pool but never breaks a search.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from xml.etree import ElementTree as ET

import requests

ARXIV_API = "http://export.arxiv.org/api/query"

# Default ML-focused categories for the wedge (cs.* + stat.ML).
DEFAULT_CATEGORIES = ("cs.LG", "cs.CL", "cs.CV", "cs.AI", "stat.ML")

_ATOM = "{http://www.w3.org/2005/Atom}"
_ARX = "{http://arxiv.org/schemas/atom}"

# Venue detection from the free-text arXiv "comment" field, e.g.
# "Accepted at NeurIPS 2023". Order matters only for display.
_VENUE_PATTERNS = {
    "NeurIPS": r"neurips|nips|neural information processing",
    "ICML": r"\bicml\b|international conference on machine learning",
    "ICLR": r"\biclr\b|international conference on learning representations",
    "ACL": r"\bacl\b(?!\w)",
    "EMNLP": r"\bemnlp\b",
    "NAACL": r"\bnaacl\b",
    "CVPR": r"\bcvpr\b|computer vision and pattern recognition",
    "ICCV": r"\biccv\b",
    "ECCV": r"\beccv\b",
    "AAAI": r"\baaai\b",
    "KDD": r"\bkdd\b",
    "SIGIR": r"\bsigir\b",
}


def _detect_venue(comment: str | None, journal_ref: str | None) -> str | None:
    blob = f"{comment or ''} {journal_ref or ''}".lower()
    for venue, pat in _VENUE_PATTERNS.items():
        if re.search(pat, blob):
            return venue
    return None


def _arxiv_id(entry_id: str) -> str:
    # entry id looks like http://arxiv.org/abs/2106.09685v2 → "2106.09685"
    tail = entry_id.rstrip("/").split("/")[-1]
    return re.sub(r"v\d+$", "", tail)


def _build_search_query(query: str, categories) -> str:
    terms = f"all:{query}"
    cats = [c for c in (categories or []) if c]
    if cats:
        cat_expr = " OR ".join(f"cat:{c}" for c in cats)
        return f"({cat_expr}) AND {terms}"
    return terms


def fetch_arxiv(
    query: str,
    *,
    categories=None,
    since_year: int | None = None,
    max_results: int = 25,
    timeout: int = 15,
) -> list[dict]:
    """Fetch arXiv papers normalized to the pipeline's paper shape.

    ``categories`` filters to arXiv categories (defaults applied by the caller).
    ``since_year`` drops papers older than that year (recency matters in ML).
    """
    params = {
        "search_query": _build_search_query(query, categories),
        "start": 0,
        "max_results": max_results,
        "sortBy": "relevance",
        "sortOrder": "descending",
    }
    try:
        resp = requests.get(ARXIV_API, params=params, timeout=timeout)
        if resp.status_code != 200:
            return []
        root = ET.fromstring(resp.text)
    except (requests.RequestException, ET.ParseError):
        return []

    papers: list[dict] = []
    for entry in root.findall(f"{_ATOM}entry"):
        paper = _parse_entry(entry)
        if not paper:
            continue
        if since_year and paper.get("year") and paper["year"] < since_year:
            continue
        papers.append(paper)
    return papers


def _text(node, tag: str) -> str:
    el = node.find(tag)
    return (el.text or "").strip() if el is not None and el.text else ""


def _parse_entry(entry) -> dict | None:
    raw_id = _text(entry, f"{_ATOM}id")
    if not raw_id:
        return None
    arxiv_id = _arxiv_id(raw_id)

    title = re.sub(r"\s+", " ", _text(entry, f"{_ATOM}title")).strip()
    abstract = re.sub(r"\s+", " ", _text(entry, f"{_ATOM}summary")).strip()

    published = _text(entry, f"{_ATOM}published")  # 2021-06-17T...Z
    year = None
    if len(published) >= 4 and published[:4].isdigit():
        year = int(published[:4])

    authors = [
        {"name": _text(a, f"{_ATOM}name")}
        for a in entry.findall(f"{_ATOM}author")
        if _text(a, f"{_ATOM}name")
    ]

    # PDF link is the <link title="pdf">; the abs page is the entry id.
    pdf_url = None
    for link in entry.findall(f"{_ATOM}link"):
        if link.get("title") == "pdf" or link.get("type") == "application/pdf":
            pdf_url = link.get("href")
            break

    comment = _text(entry, f"{_ARX}comment")
    journal_ref = _text(entry, f"{_ARX}journal_ref")
    doi = _text(entry, f"{_ARX}doi") or None
    venue = _detect_venue(comment, journal_ref) or "arXiv"

    return {
        "paperId": f"arxiv:{arxiv_id}",
        "title": title,
        "abstract": abstract,
        "year": year,
        "citationCount": None,  # arXiv API doesn't provide citation counts
        "authors": authors,
        "openAccessPdf": {"url": pdf_url} if pdf_url else None,
        "url": f"https://arxiv.org/abs/{arxiv_id}",
        "externalIds": {"ArXiv": arxiv_id, **({"DOI": doi} if doi else {})},
        "venue": venue,
        "source": "arxiv",
    }


def recency_to_year(recency: str | None) -> int | None:
    """Map a UI recency token ('6m','1y','2y','all') to a since-year cutoff."""
    if not recency or recency == "all":
        return None
    now = datetime.now(timezone.utc)
    if recency == "6m":
        # within ~6 months → this year, or last year if we're early in the year
        return now.year if now.month > 6 else now.year - 1
    m = re.match(r"(\d+)y$", recency)
    if m:
        return now.year - int(m.group(1))
    return None
