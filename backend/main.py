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
from cache import normalize, get_cached, store_cache, stream_chunks
from usage import check_anon, verify_jwt, get_tier, check_user

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
    output_mode: str = "synthesis"


RATE_LIMIT_MAX = int(os.getenv("RATE_LIMIT_MAX", "10"))
RATE_LIMIT_WINDOW = int(os.getenv("RATE_LIMIT_WINDOW", "60"))

_request_log: dict[str, deque] = defaultdict(deque)

_SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",
}


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


def _extract_jwt(request: Request) -> str | None:
    auth = request.headers.get("Authorization", "")
    return auth[7:] if auth.startswith("Bearer ") else None


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
    # ── 1. IP-level rate limit (burst guard) ─────────────────────────────────
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
    output_mode = request.output_mode if request.output_mode in ("synthesis", "matrix") else "synthesis"
    query_norm = normalize(raw_query)

    # ── 2. Cache check (before quota — cache hits are instant and free) ───────
    # Matrix results are not cached — they're lightweight and always fresh.
    cached = await asyncio.to_thread(get_cached, query_norm, level) if output_mode == "synthesis" else None
    if cached:
        async def stream_from_cache():
            yield _sse({"type": "papers", "papers": cached["papers"]})
            for chunk in stream_chunks(cached["synthesis"]):
                yield _sse({"type": "text", "text": chunk})
            yield _sse({"type": "done"})

        return StreamingResponse(
            stream_from_cache(), media_type="text/event-stream", headers=_SSE_HEADERS
        )

    # ── 3. Quota check ────────────────────────────────────────────────────────
    jwt = _extract_jwt(http_request)
    user_id = await asyncio.to_thread(verify_jwt, jwt) if jwt else None

    if user_id:
        tier = await asyncio.to_thread(get_tier, user_id)
        quota = await asyncio.to_thread(check_user, user_id, tier)
    else:
        quota = check_anon(ip)  # synchronous in-memory

    # Debug: log auth resolution so Railway logs show exactly what's happening.
    # jwt_present=no  → frontend not sending Authorization header
    # user_id=None    → verify_jwt failed (bad/missing SUPABASE_SERVICE_ROLE_KEY)
    # tier=anonymous  → logged-in user falling through to anon quota
    print(
        f"[search] ip={ip} jwt={'yes' if jwt else 'no'} "
        f"user_id={user_id!r} tier={quota.get('tier')!r} "
        f"allowed={quota['allowed']}",
        flush=True,
    )

    if not quota["allowed"]:
        return JSONResponse(
            status_code=429,
            content={
                "error": "quota_exceeded",
                "limit_type": quota["limit_type"],
                "tier": quota["tier"],
                "resets_at": quota.get("resets_at"),
            },
        )

    # ── 4. Full pipeline (cache miss) ─────────────────────────────────────────
    async def generate():
        synthesis_parts: list[str] = []

        try:
            processed = await asyncio.to_thread(process_query, raw_query)
            cleaned_query = processed["cleaned_query"]
            search_angles = processed["search_angles"]

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

            top_papers = await asyncio.to_thread(rank, raw_query, pool)
            if not top_papers:
                top_papers = pool[:RESULT_COUNT]

            # Papers arrive immediately — sources visible while synthesis streams.
            yield _sse({"type": "papers", "papers": top_papers})

            try:
                async for chunk in synthesize_stream(cleaned_query, level, top_papers, output_mode):
                    synthesis_parts.append(chunk)
                    yield _sse({"type": "text", "text": chunk})
            except SynthesisError as e:
                yield _sse({"type": "error", "detail": str(e)})
                return

            # Store in cache after successful synthesis (synthesis mode only).
            if output_mode == "synthesis":
                full_synthesis = "".join(synthesis_parts)
                await asyncio.to_thread(
                    store_cache, query_norm, level, full_synthesis, top_papers
                )

        except Exception as e:
            yield _sse({"type": "error", "detail": f"{type(e).__name__}: {e}"})
            return

        # Quota info — lets the frontend update the remaining-searches badge.
        yield _sse({
            "type": "quota",
            "tier": quota["tier"],
            "remaining_daily": quota["remaining_daily"],
            "limit_daily": quota["limit_daily"],
            "remaining_monthly": quota.get("remaining_monthly"),
            "limit_monthly": quota.get("limit_monthly"),
        })
        yield _sse({"type": "done"})

    return StreamingResponse(
        generate(), media_type="text/event-stream", headers=_SSE_HEADERS
    )


@app.get("/")
async def root():
    return {"status": "Researca Backend Engine is active and live"}


@app.get("/health")
async def health():
    return {"status": "ok"}
