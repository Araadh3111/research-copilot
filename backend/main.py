import asyncio
import json
import os
import time
from collections import defaultdict, deque

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from query_processor import process_query, validate_query
from fetcher import fetch_pool, FetchError, RESULT_COUNT
from ranker import rank
from synthesizer import synthesize_stream, SynthesisError
from cache import normalize, get_cached, store_cache, stream_chunks
from usage import check_anon, verify_jwt, get_tier, check_user, SEARCH_COST, record_search
from synthesizer import FORCE_SONNET

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


def _quota_message(limit_type: str, tier: str) -> str:
    """Human-readable quota message for the 429 body shown to the user."""
    upsell = tier not in ("pro", "lab")
    if limit_type == "monthly":
        return (
            "Monthly search limit reached. Sign up for Pro to continue."
            if upsell
            else "Monthly search limit reached. It resets at the start of next month."
        )
    if limit_type == "daily":
        return (
            "Daily search limit reached. Come back tomorrow or upgrade to Pro to continue."
            if upsell
            else "Daily search limit reached. It resets tomorrow."
        )
    # anonymous "total" lifetime cap
    return "You've used your free searches. Sign up for a free account to keep researching."


def _estimated_search_cost(tier: str, output_mode: str) -> float:
    """Estimate USD cost for one search based on model (via tier) and output mode."""
    is_sonnet = FORCE_SONNET or tier in ("pro", "lab")
    base = SEARCH_COST["sonnet"] if is_sonnet else SEARCH_COST["haiku"]
    return base + (SEARCH_COST["matrix_surcharge"] if output_mode == "matrix" else 0.0)


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

    # Resolve the caller's identity up front so both cache hits and full
    # searches can be appended to their search history.
    jwt_token = _extract_jwt(http_request)
    user_id = await asyncio.to_thread(verify_jwt, jwt_token) if jwt_token else None

    # ── 2. Cache check (before quota — cache hits are instant and free) ───────
    # Matrix results are not cached — they're lightweight and always fresh.
    cached = await asyncio.to_thread(get_cached, query_norm, level) if output_mode == "synthesis" else None
    if cached:
        async def stream_from_cache():
            yield _sse({"type": "papers", "papers": cached["papers"]})
            for chunk in stream_chunks(cached["synthesis"]):
                yield _sse({"type": "text", "text": chunk})
            yield _sse({"type": "done"})
            if user_id:
                await asyncio.to_thread(record_search, user_id, raw_query, output_mode)

        return StreamingResponse(
            stream_from_cache(), media_type="text/event-stream", headers=_SSE_HEADERS
        )

    # ── 2.5 Query validation (cache misses only — cached queries were valid) ──
    # A fast Haiku classification weeds out greetings, gibberish and non-research
    # input before we spend any quota or run the full pipeline. Runs BEFORE the
    # quota check so an invalid query never consumes a search. Fails open inside
    # validate_query, so a model hiccup never blocks a real search.
    if not await asyncio.to_thread(validate_query, raw_query):
        return JSONResponse(
            status_code=400,
            content={
                "error": "invalid_query",
                "message": (
                    "Please enter a research topic. "
                    "Try: 'CRISPR gene editing' or 'prosthetic arm control'"
                ),
            },
        )

    # ── 3. Quota check ────────────────────────────────────────────────────────
    tier = await asyncio.to_thread(get_tier, user_id) if user_id else "anonymous"

    # Comparison Matrix is a Pro feature — gate before consuming any quota.
    if output_mode == "matrix" and tier not in ("pro", "lab"):
        return JSONResponse(
            status_code=403,
            content={
                "error": "matrix_gated",
                "message": "Comparison Matrix is a Pro feature. Upgrade to unlock it.",
            },
        )

    if user_id:
        estimated_cost = _estimated_search_cost(tier, output_mode)
        quota = await asyncio.to_thread(check_user, user_id, tier, estimated_cost)
    else:
        quota = check_anon(ip)  # synchronous in-memory

    # One clean line per request so Railway logs show the resolved identity.
    #   jwt=no          → frontend not sending the Authorization header
    #   user_id=None    → verify_jwt failed (token invalid / JWKS unreachable)
    #   tier=anonymous  → a logged-in user is falling through to the anon quota
    print(
        f"[search] ip={ip} jwt={'yes' if jwt_token else 'no'} "
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
                "message": _quota_message(quota["limit_type"], quota["tier"]),
            },
        )

    # ── 4. Full pipeline (cache miss) ─────────────────────────────────────────
    async def generate():
        synthesis_parts: list[str] = []

        try:
            processed = await asyncio.to_thread(process_query, raw_query, tier)
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
                async for chunk in synthesize_stream(cleaned_query, level, top_papers, output_mode, tier):
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

            # Append to the user's search history (best-effort, never blocks).
            if user_id:
                await asyncio.to_thread(record_search, user_id, raw_query, output_mode)

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


@app.get("/auth/debug")
async def auth_debug(http_request: Request):
    """Resolve the caller's identity from their bearer token — no search, no cost.

    A logged-in caller sees ``authenticated: true`` with their real tier instead
    of falling through to anonymous. Only ever reveals the caller's own identity.
    """
    jwt_token = _extract_jwt(http_request)
    user_id = await asyncio.to_thread(verify_jwt, jwt_token) if jwt_token else None
    tier = await asyncio.to_thread(get_tier, user_id) if user_id else "anonymous"
    return {
        "jwt_present": jwt_token is not None,
        "authenticated": user_id is not None,
        "user_id": user_id,
        "tier": tier,
    }


@app.get("/")
async def root():
    return {"status": "Researca Backend Engine is active and live"}


@app.get("/health")
async def health():
    return {"status": "ok"}
