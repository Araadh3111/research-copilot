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
S2_BATCH_URL = "https://api.semanticscholar.org/graph/v1/paper/batch"

S2_FIELDS = "title,abstract,year,citationCount,authors,openAccessPdf,url,externalIds,venue"

# Per-tier sizing — override via env; free defaults shown here.
POOL_SIZE = int(os.getenv("POOL_SIZE", "50"))
RESULT_COUNT = int(os.getenv("RESULT_COUNT", "5"))

# Landmark sweep: an extra S2 pass per search with a citation floor. Plain
# keyword search ranks recent term-stuffed papers above seminal work (probing
# showed the LoRA/SimCLR/MoCo papers absent from their own topic's top-50), but
# with minCitationCount they come back on top. Costs a few extra throttled calls.
LANDMARK_MIN_CITATIONS = int(os.getenv("LANDMARK_MIN_CITATIONS", "200"))
LANDMARK_LIMIT = int(os.getenv("LANDMARK_LIMIT", "15"))
LANDMARK_SWEEP_QUERIES = int(os.getenv("LANDMARK_SWEEP_QUERIES", "3"))


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


def _fetch_one(query: str, limit: int, min_citations: int | None = None) -> list:
    """Fetch up to `limit` papers for a single query string."""
    params = {"query": query, "limit": limit, "fields": S2_FIELDS}
    if min_citations:
        params["minCitationCount"] = min_citations
    headers = {"x-api-key": API_KEY} if API_KEY else {}

    last_status = None
    last_body = None

    for attempt in range(3):
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
            time.sleep(2 * (attempt + 1))  # 2s, 4s, 6s — outlast a 429 window
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


# S2's keyword search has two sharp edges (verified by probing the API):
#   • hyphenated terms often match NOTHING ("parameter-efficient fine-tuning" → 0
#     results; "parameter efficient fine tuning" → the right papers), and
#   • long natural-language queries return 0 because every term must match.
# So when a query comes back empty, walk a fallback ladder instead of silently
# contributing nothing to the pool.
_QUERY_STOPWORDS = {
    "the", "a", "an", "of", "for", "to", "in", "on", "with", "and", "or",
    "using", "based", "via", "how", "what", "is", "are",
}


def _shorten_query(query: str, max_terms: int = 6) -> str:
    words = [w for w in re.findall(r"[A-Za-z0-9]+", query) if w.lower() not in _QUERY_STOPWORDS]
    return " ".join(words[:max_terms])


def _fetch_with_fallback(query: str, limit: int) -> list:
    """_fetch_one, retrying empty result sets with progressively simpler queries."""
    tried: set = set()
    last_error: FetchError | None = None
    for candidate in (query, query.replace("-", " "), _shorten_query(query)):
        candidate = re.sub(r"\s+", " ", candidate).strip()
        if not candidate or candidate.lower() in tried:
            continue
        tried.add(candidate.lower())
        try:
            papers = _fetch_one(candidate, limit)
        except FetchError as e:
            last_error = e  # an outage on one rung shouldn't kill the ladder
            continue
        if papers:
            return papers
    if last_error is not None:
        raise last_error
    return []


def _enrich_citations(papers: list) -> None:
    """Fill in citationCount for arXiv-sourced papers via one S2 batch lookup.

    arXiv's API has no citation data, so papers that only came from arXiv sort
    as zero-citation in the prefilter tiebreak and the rank fallback — which
    buries landmarks (LoRA: 19k+ citations, treated as 0). Best-effort: any
    failure leaves the papers unchanged.
    """
    targets = [
        p for p in papers
        if p.get("citationCount") is None and (p.get("externalIds") or {}).get("ArXiv")
    ][:500]  # S2 batch cap
    if not targets:
        return
    ids = []
    for p in targets:
        bare = re.sub(r"v\d+$", "", str(p["externalIds"]["ArXiv"]))
        ids.append(f"ARXIV:{bare}")
    headers = {"x-api-key": API_KEY} if API_KEY else {}
    _s2_throttle()
    try:
        resp = requests.post(
            S2_BATCH_URL, params={"fields": "citationCount"},
            json={"ids": ids}, headers=headers, timeout=15,
        )
        if resp.status_code != 200:
            return
        results = resp.json()  # aligned with input ids; null for unknown papers
    except (requests.RequestException, ValueError):
        return
    for paper, match in zip(targets, results):
        if isinstance(match, dict) and match.get("citationCount") is not None:
            paper["citationCount"] = match["citationCount"]


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
    # Sweep short queries first: S2 returns ~0 results for long queries, so a
    # 12-word cleaned query wastes a sweep slot that a 5-word angle would use.
    landmark_queries = (
        sorted(queries, key=lambda q: len(q.split()))[:LANDMARK_SWEEP_QUERIES]
        if LANDMARK_MIN_CITATIONS > 0 else []
    )

    # Parallel fetch: each S2 query gets a thread, plus the landmark sweep and
    # one arXiv future.
    angle_results: dict[str, list] = {}
    landmark_papers: list = []
    arxiv_papers: list = []
    with ThreadPoolExecutor(max_workers=len(queries) + len(landmark_queries) + 1) as pool:
        future_to_query = {pool.submit(_fetch_with_fallback, q, pool_size): q for q in queries}
        landmark_futures = [
            pool.submit(_fetch_one, q, LANDMARK_LIMIT, LANDMARK_MIN_CITATIONS)
            for q in landmark_queries
        ]
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
        for future in landmark_futures:
            try:
                landmark_papers.extend(future.result())
            except FetchError:
                pass  # the sweep is additive; a miss just means no extra landmarks
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
        # Title is a SECOND key, not just the id fallback: S2 sometimes omits a
        # paper's arXiv id, so its copy keys by DOI/paperId while the arXiv copy
        # keys by arXiv id — same paper, two keys, shown twice in results.
        title_key = ("title", re.sub(r"[^a-z0-9]+", " ", (paper.get("title") or "").lower()).strip())
        if key in seen or (title_key[1] and title_key in seen):
            return
        if not (paper.get("abstract") or "").strip():
            if (paper.get("externalIds") or {}).get("ArXiv"):
                no_abstract.append(paper)
            return  # no abstract (and none recoverable) → can't content-rank
        seen.add(key)
        seen.add(title_key)
        pool_papers.append(paper)

    for q in queries:
        for paper in angle_results.get(q, []):
            _add(paper)

    # Landmark sweep results merge after the relevance-ordered angles (they're
    # a recall net, not the head of the pool) but before arXiv, so the S2 copy
    # with its citationCount claims the dedupe key.
    for paper in landmark_papers:
        _add(paper)

    # Backfill missing abstracts from arXiv in one batched id_list request, then
    # run the recovered papers through the same dedup/add path. This MUST happen
    # before the arXiv merge below: the S2 copy carries the citationCount, and if
    # the arXiv twin (citationCount=None) claims the dedupe key first, landmark
    # papers sort as zero-citation everywhere downstream.
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

    for paper in arxiv_papers:
        _add(paper)

    # arXiv-only papers have no citation counts — backfill them from S2 so
    # landmark papers don't sort as zero-citation in ranking tiebreaks.
    _enrich_citations(pool_papers)

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
