import asyncio
import json
import os
import time
from collections import defaultdict, deque

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from query_processor import process_query
from fetcher import fetch_pool, FetchError, RESULT_COUNT
from ranker import rank
from synthesizer import synthesize_stream, SynthesisError

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
    level: str = "intermediate"


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


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"error": "internal_error", "detail": f"{type(exc).__name__}: {exc}"},
    )


@app.post("/search")
async def search(request: SearchRequest, http_request: Request):
    # Rate limiting and input validation return plain JSONResponse before
    # the stream is opened — these are not SSE events.
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

    level = request.level

    async def generate():
        try:
            # 1. Fix typos; generate search angles (sync Haiku call in thread).
            processed = await asyncio.to_thread(process_query, raw_query)
            cleaned_query = processed["cleaned_query"]
            search_angles = processed["search_angles"]

            # 2. Fetch candidate pool across all angles in parallel.
            try:
                pool = await asyncio.to_thread(fetch_pool, cleaned_query, search_angles)
            except FetchError as e:
                yield _sse({"type": "error", "detail": str(e)})
                return

            if not pool:
                yield _sse({"type": "papers", "papers": []})
                yield _sse({
                    "type": "text",
                    "text": f'No papers found for "{cleaned_query}". Try a broader or differently-worded query.',
                })
                yield _sse({"type": "done"})
                return

            # 3. Content-based ranking (sync Haiku call in thread).
            top_papers = await asyncio.to_thread(rank, raw_query, pool)
            if not top_papers:
                top_papers = pool[:RESULT_COUNT]

            # 4. Send papers immediately — sources appear while synthesis streams.
            yield _sse({"type": "papers", "papers": top_papers})

            # 5. Stream synthesis chunks as they arrive from Sonnet.
            try:
                async for chunk in synthesize_stream(cleaned_query, level, top_papers):
                    yield _sse({"type": "text", "text": chunk})
            except SynthesisError as e:
                yield _sse({"type": "error", "detail": str(e)})
                return

            yield _sse({"type": "done"})

        except Exception as e:
            yield _sse({"type": "error", "detail": f"{type(e).__name__}: {e}"})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disable Nginx/Railway proxy buffering
        },
    )


@app.get("/")
async def root():
    return {"status": "Researca Backend Engine is active and live"}


@app.get("/health")
async def health():
    return {"status": "ok"}
