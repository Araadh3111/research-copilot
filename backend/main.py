import os
import time
from collections import defaultdict, deque

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from query_processor import process_query
from fetcher import fetch_pool, FetchError, RESULT_COUNT
from ranker import rank
from synthesizer import synthesize, SynthesisError

app = FastAPI(title="Researca Core OS Engine API")

ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SearchRequest(BaseModel):
    query: str
    level: str = "undergrad"


RATE_LIMIT_MAX = int(os.getenv("RATE_LIMIT_MAX", "10"))
RATE_LIMIT_WINDOW = int(os.getenv("RATE_LIMIT_WINDOW", "60"))

_request_log: dict[str, deque] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _is_rate_limited(ip: str) -> bool:
    now = time.time()
    timestamps = _request_log[ip]
    while timestamps and timestamps[0] <= now - RATE_LIMIT_WINDOW:
        timestamps.popleft()
    if len(timestamps) >= RATE_LIMIT_MAX:
        return True
    timestamps.append(now)
    return False


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"error": "internal_error", "detail": f"{type(exc).__name__}: {exc}"},
    )


@app.post("/search")
async def search(request: SearchRequest, http_request: Request):
    ip = _client_ip(http_request)
    if _is_rate_limited(ip):
        return JSONResponse(
            status_code=429,
            content={
                "error": "rate_limited",
                "detail": (
                    f"Too many requests. Limit is {RATE_LIMIT_MAX} per "
                    f"{RATE_LIMIT_WINDOW}s. Please wait and try again."
                ),
            },
        )

    raw_query = (request.query or "").strip()
    if not raw_query:
        return JSONResponse(
            status_code=400,
            content={"error": "empty_query", "detail": "Query must not be empty."},
        )

    # 1. Fix typos; generate search angles.
    processed = process_query(raw_query)
    cleaned_query = processed["cleaned_query"]
    search_angles = processed["search_angles"]

    # 2. Fetch a large candidate pool across all angles (parallel S2 requests).
    try:
        pool = fetch_pool(cleaned_query, search_angles)
    except FetchError as e:
        return JSONResponse(
            status_code=502,
            content={"error": "semantic_scholar_unavailable", "detail": str(e)},
        )

    if not pool:
        return {
            "synthesis": f'No papers found for "{cleaned_query}". Try a broader or differently-worded query.',
            "papers": [],
        }

    # 3. Content-based ranking: score by relevance to the ORIGINAL query.
    top_papers = rank(raw_query, pool, result_count=RESULT_COUNT)

    if not top_papers:
        top_papers = pool[:RESULT_COUNT]

    # 4. Synthesize (unchanged).
    try:
        synthesis_result = synthesize(cleaned_query, request.level, top_papers)
    except SynthesisError as e:
        return JSONResponse(
            status_code=502,
            content={"error": "synthesis_failed", "detail": str(e), "papers": top_papers},
        )

    return {"synthesis": synthesis_result, "papers": top_papers}


@app.get("/")
async def root():
    return {"status": "Researca Backend Engine is active and live"}


@app.get("/health")
async def health():
    return {"status": "ok"}
