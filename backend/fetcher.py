import requests
from dotenv import load_dotenv
import os
import time

load_dotenv()

API_KEY = os.getenv("SEMANTIC_SCHOLAR_API_KEY")
S2_URL = "https://api.semanticscholar.org/graph/v1/paper/search"

# Fields we ask Semantic Scholar for. `url` + `openAccessPdf` give us real links
# for the sources list; `externalIds` lets us fall back to a DOI link.
S2_FIELDS = "title,abstract,year,citationCount,authors,openAccessPdf,url,externalIds"


class FetchError(Exception):
    """Semantic Scholar could not be reached or returned an unusable response.

    Raised so the API layer can convert it into a clean JSON error instead of
    letting an unhandled exception become a raw 500. This is the failure mode
    that bites on cloud hosts (e.g. Railway), where Semantic Scholar rate-limits
    the shared datacenter IP and returns a non-200 / non-JSON body.
    """


def fetch_papers(query, limit=10):
    params = {
        "query": query,
        "limit": limit,
        "fields": S2_FIELDS,
    }

    headers = {}
    if API_KEY:
        headers["x-api-key"] = API_KEY

    last_status = None
    last_body = None

    for attempt in range(3):
        try:
            response = requests.get(url=S2_URL, params=params, headers=headers, timeout=15)
        except requests.RequestException as e:
            # Network/DNS/timeout: back off and retry.
            last_body = f"{type(e).__name__}: {e}"
            time.sleep(1.5)
            continue

        last_status = response.status_code

        # Transient upstream / rate limit: back off and retry.
        if response.status_code in (429, 500, 502, 503, 504):
            last_body = response.text[:200]
            time.sleep(2)
            continue

        # Any other non-200 is a hard failure we can't recover from.
        if response.status_code != 200:
            raise FetchError(
                f"Semantic Scholar returned HTTP {response.status_code}: {response.text[:200]}"
            )

        # 200 but body may not be JSON (Cloudflare/HTML block page).
        try:
            result = response.json()
        except ValueError:
            last_body = response.text[:200]
            time.sleep(2)
            continue

        # Happy path. Empty `data` is a valid "no results" answer, not an error.
        if "data" in result:
            return _rank(result["data"] or [])

        # 200 JSON without `data` (e.g. {"message": "..."}). Retry, then give up.
        last_body = str(result)[:200]
        time.sleep(2)

    raise FetchError(
        f"Semantic Scholar unavailable after 3 attempts "
        f"(last status={last_status}, last body={last_body})"
    )


def _rank(data):
    def score_paper(paper):
        citations = paper.get("citationCount") or 0
        year = paper.get("year") or 2000
        recency = (year - 2000) * 10
        return citations + recency

    return sorted(data, key=score_paper, reverse=True)


if __name__ == "__main__":
    query = input("Enter what do u wna explore today: ")
    papers = fetch_papers(query)
    for i, paper in enumerate(papers):
        print(f"{i+1}. {paper['title']} ({paper.get('year', 'N/A')}) — {paper.get('citationCount', 0)} citations")
