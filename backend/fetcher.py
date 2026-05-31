import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("SEMANTIC_SCHOLAR_API_KEY")
S2_URL = "https://api.semanticscholar.org/graph/v1/paper/search"

S2_FIELDS = "title,abstract,year,citationCount,authors,openAccessPdf,url,externalIds"

# Per-tier sizing — override via env; free defaults shown here.
POOL_SIZE = int(os.getenv("POOL_SIZE", "20"))
RESULT_COUNT = int(os.getenv("RESULT_COUNT", "5"))


class FetchError(Exception):
    """Semantic Scholar could not be reached or returned an unusable response."""


def _fetch_one(query: str, limit: int) -> list:
    """Fetch up to `limit` papers for a single query string."""
    params = {"query": query, "limit": limit, "fields": S2_FIELDS}
    headers = {"x-api-key": API_KEY} if API_KEY else {}

    last_status = None
    last_body = None

    for _ in range(3):
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


def fetch_pool(cleaned_query: str, search_angles: list[str], pool_size: int = POOL_SIZE) -> list:
    """Fetch a deduplicated candidate pool across the cleaned query + all search angles.

    Requests to Semantic Scholar are fired in parallel (one thread per angle).
    Papers without an abstract are excluded — they can't be content-ranked.
    Returns raw S2 paper dicts; ranking is handled by ranker.py.
    """
    queries = list(dict.fromkeys([cleaned_query] + search_angles))

    # Parallel fetch: each query gets its own thread.
    angle_results: dict[str, list] = {}
    with ThreadPoolExecutor(max_workers=len(queries)) as pool:
        future_to_query = {pool.submit(_fetch_one, q, pool_size): q for q in queries}
        for future in as_completed(future_to_query):
            q = future_to_query[future]
            try:
                angle_results[q] = future.result()
            except FetchError:
                angle_results[q] = []  # one angle failing doesn't abort the pool

    # Merge in query order: cleaned_query first, then angles.
    seen_ids: set = set()
    pool_papers: list = []

    for q in queries:
        for paper in angle_results.get(q, []):
            pid = paper.get("paperId")
            if not pid or pid in seen_ids:
                continue
            if not (paper.get("abstract") or "").strip():
                continue  # no abstract → can't content-rank, skip
            seen_ids.add(pid)
            pool_papers.append(paper)

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
