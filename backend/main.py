import os
import time
from collections import defaultdict, deque

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fetcher import fetch_papers, FetchError
from synthesizer import synthesize, SynthesisError

app = FastAPI(title="Researca Core OS Engine API")

# CORS: read allowed origins from the ALLOWED_ORIGINS env var (comma-separated)
# so the production Vercel domain can be added in Railway with no code change.
# Defaults to the local dev frontend. NOTE: allow_credentials=True is invalid
# with a "*" wildcard per the CORS spec, which is exactly why we enumerate.
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


# --- Basic per-IP rate limit (interim abuse guard, NOT auth) -----------------
# In-memory fixed-window counter so a single actor can't hammer /search and
# drain the Claude/Semantic Scholar budget. Resets on restart; that's fine for
# an interim guard. The full version (JWT auth-gating + per-user limits) is the
# fast-follow. Tunable via env vars.
RATE_LIMIT_MAX = int(os.getenv("RATE_LIMIT_MAX", "10"))       # requests...
RATE_LIMIT_WINDOW = int(os.getenv("RATE_LIMIT_WINDOW", "60"))  # ...per N seconds

# ip -> deque of recent request timestamps (only those within the window).
_request_log: dict[str, deque] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    # On Railway the app sits behind a proxy, so the real client IP is the first
    # entry in X-Forwarded-For; fall back to the socket peer.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _is_rate_limited(ip: str) -> bool:
    now = time.time()
    timestamps = _request_log[ip]
    # Drop timestamps that have aged out of the window.
    while timestamps and timestamps[0] <= now - RATE_LIMIT_WINDOW:
        timestamps.popleft()
    if len(timestamps) >= RATE_LIMIT_MAX:
        return True
    timestamps.append(now)
    return False


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # Safety net: /search must never return a raw 500. Anything that slips past
    # the explicit handling below comes out as clean JSON with the real reason
    # (which also makes production failures self-diagnosing).
    return JSONResponse(
        status_code=500,
        content={"error": "internal_error", "detail": f"{type(exc).__name__}: {exc}"},
    )


@app.post("/search")
async def search(request: SearchRequest, http_request: Request):
    # Per-IP rate limit: reject early, before doing any paid work.
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

    query = (request.query or "").strip()

    # Input validation: reject empty/whitespace queries with a 400, not a crash.
    if not query:
        return JSONResponse(
            status_code=400,
            content={"error": "empty_query", "detail": "Query must not be empty."},
        )

    # 1. Pull related papers from Semantic Scholar.
    try:
        papers = fetch_papers(query)
    except FetchError as e:
        return JSONResponse(
            status_code=502,
            content={"error": "semantic_scholar_unavailable", "detail": str(e)},
        )

    # No results is a valid, non-error outcome.
    if not papers:
        return {
            "synthesis": f'No papers found for "{query}". Try a broader or differently-worded query.',
            "papers": [],
        }

    # 2. Synthesize.
    try:
        synthesis_result = synthesize(query, request.level, papers)
    except SynthesisError as e:
        # Still hand back the papers so the frontend has something to show.
        return JSONResponse(
            status_code=502,
            content={"error": "synthesis_failed", "detail": str(e), "papers": papers},
        )

    # 3. Standard structured payload that maps to the frontend state hooks.
    return {"synthesis": synthesis_result, "papers": papers}


@app.get("/")
async def root():
    return {"status": "Researca Backend Engine is active and live"}


@app.get("/health")
async def health():
    return {"status": "ok"}
