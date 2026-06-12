import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from dotenv import load_dotenv

from arxiv_fetcher import fetch_arxiv, fetch_arxiv_by_ids

load_dotenv()

# arXiv results per search to merge into the Semantic Scholar pool (Task 3.1).
ARXIV_RESULTS = int(os.getenv("ARXIV_RESULTS", "25"))

API_KEY = os.getenv("SEMANTIC_SCHOLAR_API_KEY")
S2_URL = "https://api.semanticscholar.org/graph/v1/paper/search"

S2_FIELDS = "title,abstract,year,citationCount,authors,openAccessPdf,url,externalIds,venue"

# Per-tier sizing — override via env; free defaults shown here.
POOL_SIZE = int(os.getenv("POOL_SIZE", "50"))
RESULT_COUNT = int(os.getenv("RESULT_COUNT", "5"))


class FetchError(Exception):
    """Semantic Scholar could not be reached or returned an unusable response."""


# Semantic Scholar's keyed tier allows ~1 request/second. The angle queries are
# fired from parallel threads, which burst past that and 429 — and because every
# angle then exhausts its retries, whole searches silently fell back to an
# arXiv-only pool. Space request STARTS globally instead (applies to retries too).
_S2_MIN_INTERVAL = float(os.getenv("S2_MIN_INTERVAL", "1.05"))
_s2_gate = threading.Lock()
_s2_next_ok = 0.0


def _s2_throttle() -> None:
    global _s2_next_ok
    with _s2_gate:
        now = time.monotonic()
        wait = _s2_next_ok - now
        _s2_next_ok = max(now, _s2_next_ok) + _S2_MIN_INTERVAL
    if wait > 0:
        time.sleep(wait)


def _fetch_one(query: str, limit: int) -> list:
    """Fetch up to `limit` papers for a single query string."""
    params = {"query": query, "limit": limit, "fields": S2_FIELDS}
    headers = {"x-api-key": API_KEY} if API_KEY else {}

    last_status = None
    last_body = None

    for _ in range(3):
        _s2_throttle()
        try:
            response = requests.get(url=S2_URL, params=params, headers=headers, timeout=15)
        except requests.RequestException as e:
            last_body = f"{type(e).__name__}: {e}"
            time.sleep(1.5)
            continue

        last_status = response.status_code

        if response.status_code in (429, 500, 502, 503, 504):
            last_body = response.text[:200]
            time.sleep(2)
            continue

        if response.status_code != 200:
            raise FetchError(
                f"Semantic Scholar returned HTTP {response.status_code}: {response.text[:200]}"
            )

        try:
            result = response.json()
        except ValueError:
            last_body = response.text[:200]
            time.sleep(2)
            continue

        if "data" in result:
            return result["data"] or []

        last_body = str(result)[:200]
        time.sleep(2)

    raise FetchError(
        f"Semantic Scholar unavailable after 3 attempts "
        f"(last status={last_status}, last body={last_body})"
    )


def _dedupe_key(paper: dict):
    """Cross-source identity for a paper: arXiv id > DOI > paperId > title.

    Lets us merge Semantic Scholar and arXiv results without listing the same
    paper twice when both sources return it under different ids.
    """
    ids = paper.get("externalIds") or {}
    ax = ids.get("ArXiv")
    if ax:
        return ("arxiv", re.sub(r"v\d+$", "", str(ax)))
    doi = ids.get("DOI")
    if doi:
        return ("doi", str(doi).lower())
    pid = paper.get("paperId")
    if pid:
        return ("pid", pid)
    return ("title", (paper.get("title") or "").lower().strip())


def fetch_pool(
    cleaned_query: str,
    search_angles: list[str],
    pool_size: int = POOL_SIZE,
    *,
    categories=None,
    since_year: int | None = None,
    include_arxiv: bool = True,
) -> list:
    """Fetch a deduplicated candidate pool across the cleaned query + all angles.

    Semantic Scholar queries and one arXiv query (Task 3.1) are fired in parallel.
    Papers without an abstract are excluded — they can't be content-ranked. Results
    are merged with cross-source dedup; ranking is handled by ranker.py.
    """
    queries = list(dict.fromkeys([cleaned_query] + search_angles))

    # Parallel fetch: each S2 query gets a thread, plus one arXiv future.
    angle_results: dict[str, list] = {}
    arxiv_papers: list = []
    with ThreadPoolExecutor(max_workers=len(queries) + 1) as pool:
        future_to_query = {pool.submit(_fetch_one, q, pool_size): q for q in queries}
        arxiv_future = (
            pool.submit(
                fetch_arxiv, cleaned_query,
                categories=categories, since_year=since_year, max_results=ARXIV_RESULTS,
            )
            if include_arxiv else None
        )
        for future in as_completed(list(future_to_query)):
            q = future_to_query[future]
            try:
                angle_results[q] = future.result()
            except FetchError:
                angle_results[q] = []  # one angle failing doesn't abort the pool
        if arxiv_future is not None:
            try:
                arxiv_papers = arxiv_future.result()
            except Exception:
                arxiv_papers = []  # arXiv augments the pool; never let it break a search

    # Merge: S2 first (carries citation counts), then arXiv. Cross-source dedup.
    seen: set = set()
    pool_papers: list = []
    # S2 returns abstract=null for many landmark papers (publisher licensing).
    # Those with an arXiv id are recoverable — collect them for a backfill pass
    # instead of silently dropping the most important papers in the pool.
    no_abstract: list = []

    def _add(paper: dict) -> None:
        key = _dedupe_key(paper)
        if key in seen:
            return
        if not (paper.get("abstract") or "").strip():
            if (paper.get("externalIds") or {}).get("ArXiv"):
                no_abstract.append(paper)
            return  # no abstract (and none recoverable) → can't content-rank
        seen.add(key)
        pool_papers.append(paper)

    for q in queries:
        for paper in angle_results.get(q, []):
            _add(paper)
    for paper in arxiv_papers:
        _add(paper)

    # Backfill missing abstracts from arXiv in one batched id_list request,
    # then run the recovered papers through the same dedup/add path.
    pending, pending_keys = [], set()
    for p in no_abstract:
        key = _dedupe_key(p)
        if key not in seen and key not in pending_keys:
            pending_keys.add(key)
            pending.append(p)
    if pending:
        ids = [re.sub(r"v\d+$", "", str(p["externalIds"]["ArXiv"])) for p in pending]
        found = fetch_arxiv_by_ids(ids)
        for paper, bare_id in zip(pending, ids):
            entry = found.get(bare_id)
            if entry and entry.get("abstract"):
                paper["abstract"] = entry["abstract"]
                _add(paper)

    return pool_papers


# Legacy entry point kept for the __main__ runner.
def fetch_papers(query: str, limit: int = POOL_SIZE) -> list:
    try:
        results = _fetch_one(query, limit=limit)
    except FetchError:
        return []
    return [p for p in results if (p.get("abstract") or "").strip()]


if __name__ == "__main__":
    query = input("Enter query: ")
    papers = fetch_papers(query)
    for i, p in enumerate(papers):
        print(f"{i+1}. {p['title']} ({p.get('year', 'N/A')}) — {p.get('citationCount', 0)} citations")
