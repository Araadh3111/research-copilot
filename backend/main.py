import asyncio
import json
import os
import re
import uuid

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded

from query_processor import process_query, validate_query
from fetcher import fetch_pool, FetchError, RESULT_COUNT
from ranker import rank
from synthesizer import synthesize_stream, verify_claim, SynthesisError
from cache import normalize, get_cached, store_cache, stream_chunks
from usage import (
    check_anon, verify_jwt, get_tier, check_user, SEARCH_COST, record_search,
    check_matrix, check_verify, usage_summary,
)
from synthesizer import FORCE_SONNET
from supabase_client import sb

def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ── IP-based rate limiting (slowapi) ──────────────────────────────────────────
# Second layer on top of the per-user tier limits: caps raw request volume per
# IP so the synthesis endpoint can't be spammed even by traffic that bypasses
# auth. Keyed by the real client IP (x-forwarded-for first, since Railway runs
# behind a proxy) rather than slowapi's default so the proxy IP isn't shared by
# every caller.
limiter = Limiter(key_func=_client_ip)

app = FastAPI(title="Researca Core OS Engine API")
app.state.limiter = limiter


async def _rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={
            "error": "rate_limited",
            "detail": (
                f"Too many requests (limit {exc.detail} per IP). "
                "Please wait a moment and try again."
            ),
        },
    )


app.add_exception_handler(RateLimitExceeded, _rate_limit_handler)

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


class WaitlistRequest(BaseModel):
    email: str


class ShareRequest(BaseModel):
    query: str
    papers: list = []
    synthesis: str = ""
    output_mode: str = "synthesis"


class VerifyRequest(BaseModel):
    claim: str = ""
    synthesis: str = ""
    papers: list = []


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


_SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",
}


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


def _quota_exceeded_response(quota: dict) -> JSONResponse:
    limit_type = quota.get("limit_type")
    tier = quota.get("tier")
    limit = quota.get("limit")
    if limit_type == "matrix":
        message = (
            f"You've used all {limit} Comparison Matrix runs this month on your "
            f"{tier} plan. Your quota resets at the start of next month."
        )
    elif limit_type == "verify":
        message = (
            f"You've used all {limit} verifications this month on your {tier} plan. "
            "Your quota resets at the start of next month."
        )
    else:
        message = _quota_message(limit_type, tier)
    return JSONResponse(
        status_code=429,
        content={
            "error": "quota_exceeded",
            "limit_type": limit_type,
            "tier": tier,
            "resets_at": quota.get("resets_at"),
            "limit": limit,
            "used": quota.get("used"),
            "remaining": quota.get("remaining"),
            "message": message,
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"error": "internal_error", "detail": f"{type(exc).__name__}: {exc}"},
    )


@app.post("/search")
@limiter.limit("5/minute")
async def search(payload: SearchRequest, request: Request):
    # IP-level rate limiting (5/min/IP) is enforced by the @limiter.limit
    # decorator above — it rejects with a 429 (via _rate_limit_handler) before
    # this body runs. This is the second layer, on top of the per-user tier
    # limits checked below, so the endpoint can't be spammed even without auth.
    ip = _client_ip(request)

    raw_query = (payload.query or "").strip()
    if not raw_query:
        return JSONResponse(
            status_code=400,
            content={"error": "empty_query", "detail": "Query must not be empty."},
        )

    level = payload.level
    output_mode = payload.output_mode if payload.output_mode in ("synthesis", "matrix") else "synthesis"
    query_norm = normalize(raw_query)

    # Resolve the caller's identity up front so both cache hits and full
    # searches can be appended to their search history.
    jwt_token = _extract_jwt(request)
    user_id = await asyncio.to_thread(verify_jwt, jwt_token) if jwt_token else None

    # ── 1. Cache check (before quota — cache hits are instant and free) ───────
    # Cache hits replay stored text and never call Anthropic, so they don't
    # consume a search. Matrix results are not cached — always fresh.
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

    # ── 2. Resolve tier + gate Pro-only features ──────────────────────────────
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

    # ── 3. Quota PEEK — enforce the tier limit BEFORE any Anthropic call ──────
    # Every downstream step (query validation, processing, ranking, synthesis)
    # calls Anthropic, so the per-user limit is enforced HERE first, entirely
    # server-side, regardless of what the frontend believes. We peek without
    # incrementing so that a query rejected by validation below doesn't burn one
    # of the user's searches — the real increment happens at the commit step.
    # Matrix runs draw on their own monthly budget (matrix_runs_used), separate
    # from the synthesis search count. Matrix is Pro-only and already gated above,
    # so user_id is guaranteed here for that branch.
    estimated_cost = _estimated_search_cost(tier, output_mode)
    if output_mode == "matrix":
        quota = await asyncio.to_thread(check_matrix, user_id, tier, commit=False)
    elif user_id:
        quota = await asyncio.to_thread(check_user, user_id, tier, estimated_cost, commit=False)
    else:
        quota = check_anon(ip, commit=False)  # synchronous in-memory

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
        return _quota_exceeded_response(quota)

    # ── 4. Query validation (Anthropic Haiku) — after the gate, before commit ─
    # A fast classification weeds out greetings, gibberish and non-research input.
    # It runs AFTER the peek (so an over-limit caller never reaches Anthropic) but
    # BEFORE the commit (so a rejected query doesn't consume a search). Fails open
    # inside validate_query, so a model hiccup never blocks a real search.
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

    # ── 5. Quota COMMIT — the query is real, so consume one search now ────────
    # Re-checks the ceilings and increments. The re-check closes the race where a
    # concurrent request consumed the last slot between the peek and here.
    if output_mode == "matrix":
        quota = await asyncio.to_thread(check_matrix, user_id, tier, commit=True)
    elif user_id:
        quota = await asyncio.to_thread(check_user, user_id, tier, estimated_cost, commit=True)
    else:
        quota = check_anon(ip, commit=True)

    if not quota["allowed"]:
        return _quota_exceeded_response(quota)

    # ── 6. Full pipeline (cache miss) ─────────────────────────────────────────
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

        # Quota info — lets the frontend update the remaining badge. Shapes differ
        # between the search counter (check_user) and the matrix feature counter,
        # so fall back to the feature fields for matrix runs.
        yield _sse({
            "type": "quota",
            "tier": quota["tier"],
            "remaining_daily": quota.get("remaining_daily"),
            "limit_daily": quota.get("limit_daily"),
            "remaining_monthly": quota.get("remaining_monthly", quota.get("remaining")),
            "limit_monthly": quota.get("limit_monthly", quota.get("limit")),
        })
        yield _sse({"type": "done"})

    return StreamingResponse(
        generate(), media_type="text/event-stream", headers=_SSE_HEADERS
    )


@app.post("/verify")
@limiter.limit("20/minute")
async def verify(payload: VerifyRequest, request: Request):
    """Fact-check a highlighted claim against the synthesis + papers (Pro writing mode).

    Pro-only, enforced server-side (valid JWT → pro/lab). Draws on the verify
    monthly budget (verifies_used), NOT the search quota. Uses Haiku. Returns a
    verdict (accurate | nuanced | unsupported) + a short explanation.
    """
    jwt_token = _extract_jwt(request)
    user_id = await asyncio.to_thread(verify_jwt, jwt_token) if jwt_token else None
    if not user_id:
        return JSONResponse(
            status_code=401,
            content={"error": "unauthorized", "message": "Sign in to verify claims."},
        )

    tier = await asyncio.to_thread(get_tier, user_id)
    if tier not in ("pro", "lab"):
        return JSONResponse(
            status_code=403,
            content={"error": "pro_required", "message": "Verifying claims is a Pro feature."},
        )

    claim = (payload.claim or "").strip()
    if not claim:
        return JSONResponse(
            status_code=400,
            content={"error": "empty_claim", "message": "Highlight a sentence to verify."},
        )

    # Verify-budget peek BEFORE the Anthropic call.
    quota = await asyncio.to_thread(check_verify, user_id, tier, commit=False)
    if not quota["allowed"]:
        return _quota_exceeded_response(quota)

    synthesis = (payload.synthesis or "")[:8000]
    papers = payload.papers if isinstance(payload.papers, list) else []

    try:
        result = await asyncio.to_thread(verify_claim, claim[:2000], synthesis, papers)
    except SynthesisError as e:
        return JSONResponse(status_code=502, content={"error": "verify_failed", "message": str(e)})

    # Consume one verify only after a successful check.
    committed = await asyncio.to_thread(check_verify, user_id, tier, commit=True)
    print(f"[verify] user={user_id} tier={tier} verdict={result['verdict']}", flush=True)

    return {
        "verdict": result["verdict"],
        "explanation": result["explanation"],
        "remaining": committed.get("remaining"),
        "limit": committed.get("limit"),
    }


@app.get("/usage")
async def usage(request: Request):
    """Return the caller's three monthly quotas (searches, matrix, verifies)."""
    jwt_token = _extract_jwt(request)
    user_id = await asyncio.to_thread(verify_jwt, jwt_token) if jwt_token else None
    if not user_id:
        return JSONResponse(status_code=401, content={"error": "unauthorized"})
    tier = await asyncio.to_thread(get_tier, user_id)
    return await asyncio.to_thread(usage_summary, user_id, tier)


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


@app.post("/waitlist")
async def waitlist(req: WaitlistRequest):
    """Capture a Pro-launch waitlist email into the pro_waitlist table.

    Inserts with the service-role client (bypasses RLS). A duplicate email is
    treated as success so the user always gets a clean confirmation. Requires the
    pro_waitlist table to exist (see the SQL in the deploy notes); returns 503 if
    Supabase isn't configured.
    """
    email = (req.email or "").strip().lower()
    if not _EMAIL_RE.match(email) or len(email) > 254:
        return JSONResponse(
            status_code=400,
            content={"error": "invalid_email", "message": "Please enter a valid email address."},
        )
    if not sb:
        return JSONResponse(
            status_code=503,
            content={"error": "unavailable", "message": "The waitlist is temporarily unavailable. Try again later."},
        )
    try:
        await asyncio.to_thread(
            lambda: sb.table("pro_waitlist").insert({"email": email}).execute()
        )
    except Exception as e:
        msg = str(e).lower()
        # Unique-violation → already on the list. Treat as success.
        if "duplicate" in msg or "unique" in msg or "23505" in msg:
            print(f"[waitlist] duplicate {email!r}", flush=True)
            return {"ok": True, "already": True}
        print(f"[waitlist] insert failed {email!r}: {type(e).__name__}: {e}", flush=True)
        return JSONResponse(
            status_code=500,
            content={"error": "save_failed", "message": "Couldn't save your email. Please try again later."},
        )
    print(f"[waitlist] added {email!r}", flush=True)
    return {"ok": True}


# Bounds so a share insert can't be used to stuff huge blobs into the table.
_SHARE_MAX_PAPERS = 50
_SHARE_MAX_SYNTHESIS = 60_000
_SHARE_MAX_QUERY = 2_000


@app.post("/share")
async def create_share(req: ShareRequest):
    """Persist a synthesis result and return a UUID token for a read-only link.

    Stores the full result (query, papers, synthesis, output_mode) with the
    service-role client. The token is the public handle used by GET /share/{token}
    and the frontend /share/[token] page — no auth required to create or view, so
    anyone can share a result they're looking at.
    """
    query = (req.query or "").strip()
    if not query:
        return JSONResponse(
            status_code=400,
            content={"error": "empty_query", "message": "Nothing to share — run a search first."},
        )
    if not sb:
        return JSONResponse(
            status_code=503,
            content={"error": "unavailable", "message": "Sharing is temporarily unavailable."},
        )

    output_mode = req.output_mode if req.output_mode in ("synthesis", "matrix") else "synthesis"
    papers = req.papers[:_SHARE_MAX_PAPERS] if isinstance(req.papers, list) else []
    synthesis = (req.synthesis or "")[:_SHARE_MAX_SYNTHESIS]
    token = str(uuid.uuid4())

    try:
        await asyncio.to_thread(
            lambda: sb.table("shared_results").insert({
                "token": token,
                "query": query[:_SHARE_MAX_QUERY],
                "papers": papers,
                "synthesis": synthesis,
                "output_mode": output_mode,
            }).execute()
        )
    except Exception as e:
        print(f"[share] insert failed: {type(e).__name__}: {e}", flush=True)
        return JSONResponse(
            status_code=500,
            content={"error": "save_failed", "message": "Couldn't create a share link. Please try again."},
        )
    print(f"[share] created token={token}", flush=True)
    return {"token": token}


@app.get("/share/{token}")
async def get_share(token: str):
    """Return a stored shared result by token (public, read-only). 404 if unknown."""
    # Reject anything that isn't a UUID before touching the DB.
    try:
        uuid.UUID(token)
    except (ValueError, AttributeError):
        return JSONResponse(status_code=404, content={"error": "not_found"})
    if not sb:
        return JSONResponse(
            status_code=503,
            content={"error": "unavailable", "message": "Sharing is temporarily unavailable."},
        )
    try:
        result = await asyncio.to_thread(
            lambda: sb.table("shared_results")
            .select("query, papers, synthesis, output_mode, created_at")
            .eq("token", token)
            .limit(1)
            .execute()
        )
    except Exception as e:
        print(f"[share] read failed token={token}: {type(e).__name__}: {e}", flush=True)
        return JSONResponse(status_code=500, content={"error": "read_failed"})
    if not result.data:
        return JSONResponse(status_code=404, content={"error": "not_found"})
    return result.data[0]


@app.get("/")
async def root():
    return {"status": "Researca Backend Engine is active and live"}


@app.get("/health")
async def health():
    return {"status": "ok"}
