import asyncio
import hashlib
import json
import os
import re
import time
import uuid

from fastapi import FastAPI, Request, UploadFile, File
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded

from query_processor import process_query, validate_query
from fetcher import fetch_pool, FetchError, RESULT_COUNT
from arxiv_fetcher import recency_to_year
from ranker import rank
from synthesizer import synthesize_stream, verify_claim, SynthesisError
from cache import normalize, get_cached, store_cache, stream_chunks
from usage import (
    check_anon, verify_jwt, get_tier, check_user, SEARCH_COST, record_search,
    check_matrix, check_verify, usage_summary,
)
from synthesizer import FORCE_SONNET
from supabase_client import sb
import embeddings
import cost_tracker
from costs import log_search_cost, cost_dashboard
from sources import coverage_dict, coverage_note
from library import (
    add_document, list_documents, delete_document, delete_all_documents,
    count_documents, search_library, storage_cap, LibraryError,
)
from account import purge_user_data


# Custom matrix columns per tier (Task 3.3): column count is the Pro gate.
MATRIX_COLUMN_CAP = {"anonymous": 2, "free": 2, "pro": 6, "lab": 6}


def _sanitize_columns(columns, tier: str) -> list[str] | None:
    """Trim, de-dupe, length-limit, and cap custom matrix columns by tier."""
    if not columns:
        return None
    cap = MATRIX_COLUMN_CAP.get(tier, 2)
    seen, out = set(), []
    for c in columns:
        if not isinstance(c, str):
            continue
        name = c.strip()[:40]
        key = name.lower()
        if name and key not in seen:
            seen.add(key)
            out.append(name)
        if len(out) >= cap:
            break
    return out or None


def _with_coverage(papers: list) -> list:
    """Attach an honest open-access coverage badge to each paper (Task 1.2).

    Library papers already carry a 'Your library' badge — leave it untouched.
    """
    for p in papers:
        if p.get("source") == "library":
            continue
        p["coverage"] = coverage_dict(p)
    return papers

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
    # arXiv filters (Task 3.1). categories = arXiv categories e.g. ["cs.LG","cs.CL"];
    # recency = one of "6m" | "1y" | "2y" | "all" (a since-year cutoff).
    categories: list[str] | None = None
    recency: str | None = None
    # Custom comparison-matrix extraction columns (Task 3.3). Capped by tier.
    columns: list[str] | None = None


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
    used = quota.get("used")
    is_trial = quota.get("is_trial", False)
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
    elif is_trial and limit:
        # Personalized free-trial paywall — speak to what the user just did, not
        # a generic wall. ($12/mo lives in the frontend CTA; copy stays neutral.)
        message = (
            f"You've synthesized {used or limit} searches in your first week — "
            "that's the heart of a literature review done. Upgrade to Pro to keep going."
        )
    elif limit_type == "monthly" and tier == "free" and limit:
        message = (
            f"You've used all {limit} of this month's free searches. "
            "Upgrade to Pro for 120 a month, or wait for next month's reset."
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
            "used": used,
            "remaining": quota.get("remaining"),
            "is_trial": is_trial,
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

    # arXiv filters (Task 3.1): sanitize categories and resolve the recency cutoff.
    categories = [c for c in (payload.categories or []) if isinstance(c, str)][:8] or None
    since_year = recency_to_year(payload.recency)

    # ── Cost instrumentation (Task 2.1) ──────────────────────────────────────
    # Start a fresh per-request token accumulator and stopwatch. Every Anthropic
    # call below reports its real usage into cost_tracker; we write one
    # search_costs row when the request finishes (cache hit or full pipeline).
    cost_tracker.start()
    query_id = str(uuid.uuid4())
    t_start = time.monotonic()

    # Resolve the caller's identity up front so both cache hits and full
    # searches can be appended to their search history.
    jwt_token = _extract_jwt(request)
    user_id = await asyncio.to_thread(verify_jwt, jwt_token) if jwt_token else None

    # ── 0. Pro gate (Comparison Matrix) — FIRST, before cache or any Anthropic ─
    # Matrix is a Pro-only feature. We resolve the tier from the verified JWT and
    # reject free/anonymous callers here, at the very top of the endpoint, before
    # the cache lookup and before any Anthropic call. Frontend gating is UX only;
    # this is the real enforcement. tier is resolved here only for matrix so the
    # common synthesis path keeps its cheap cache hits (no extra DB read).
    tier: str | None = None
    if output_mode == "matrix":
        tier = await asyncio.to_thread(get_tier, user_id) if user_id else "anonymous"
        if tier not in ("pro", "lab"):
            print(
                f"[search] matrix BLOCK ip={ip} user_id={user_id!r} tier={tier!r}",
                flush=True,
            )
            return JSONResponse(
                status_code=403,
                content={
                    "error": "matrix_gated",
                    "message": "Comparison Matrix is a Pro feature. Upgrade to unlock it.",
                },
            )

    # ── 1. Cache check (before quota — cache hits are instant and free) ───────
    # Cache hits replay stored text and never call Anthropic, so they don't
    # consume a search. Matrix results are not cached — always fresh. The query
    # cache is keyed on (query, level) only, so a filtered search (arXiv
    # categories / recency) must bypass it — otherwise it could replay an
    # unfiltered result for a filtered request.
    filters_active = bool(categories or since_year)
    cached = (
        await asyncio.to_thread(get_cached, query_norm, level)
        if output_mode == "synthesis" and not filters_active
        else None
    )
    if cached:
        async def stream_from_cache():
            cached_papers = _with_coverage(cached["papers"])
            yield _sse({"type": "papers", "papers": cached_papers,
                        "coverage_note": coverage_note(cached_papers)})
            for chunk in stream_chunks(cached["synthesis"]):
                yield _sse({"type": "text", "text": chunk})
            yield _sse({"type": "done"})
            if user_id:
                await asyncio.to_thread(record_search, user_id, raw_query, output_mode)
            # A cache hit makes no model calls — record it as a free, instant search
            # so cache-hit rate and "process once, ever" savings are measurable.
            await asyncio.to_thread(
                log_search_cost,
                query_id=query_id, user_id=user_id, tier=tier, output_mode=output_mode,
                summary=cost_tracker.summary(),
                latency_ms=int((time.monotonic() - t_start) * 1000),
                papers_processed=len(cached.get("papers") or []),
                cache_hit=True,
            )

        return StreamingResponse(
            stream_from_cache(), media_type="text/event-stream", headers=_SSE_HEADERS
        )

    # ── 2. Resolve tier (synthesis path; matrix already resolved + gated above) ─
    if tier is None:
        tier = await asyncio.to_thread(get_tier, user_id) if user_id else "anonymous"

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
        papers_count = 0

        try:
            processed = await asyncio.to_thread(process_query, raw_query, tier)
            cleaned_query = processed["cleaned_query"]
            search_angles = processed["search_angles"]

            try:
                pool = await asyncio.to_thread(
                    fetch_pool, cleaned_query, search_angles,
                    categories=categories, since_year=since_year,
                )

                # Merge the user's private library (Task 1.3) when they have one,
                # so their own papers can be cited alongside public results. Guarded
                # by a doc count so users without a library skip the embedding call.
                if user_id:
                    try:
                        if await asyncio.to_thread(count_documents, user_id):
                            lib = await asyncio.to_thread(search_library, user_id, cleaned_query)
                            pool = lib + pool
                    except Exception as e:
                        print(f"[library] merge skipped: {type(e).__name__}: {e}", flush=True)
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
            papers_count = len(top_papers)

            # Papers arrive immediately — sources visible while synthesis streams.
            top_papers = _with_coverage(top_papers)
            yield _sse({"type": "papers", "papers": top_papers,
                        "coverage_note": coverage_note(top_papers)})

            matrix_columns = _sanitize_columns(payload.columns, tier) if output_mode == "matrix" else None
            try:
                async for chunk in synthesize_stream(
                    cleaned_query, level, top_papers, output_mode, tier, columns=matrix_columns
                ):
                    synthesis_parts.append(chunk)
                    yield _sse({"type": "text", "text": chunk})
            except SynthesisError as e:
                yield _sse({"type": "error", "detail": str(e)})
                return

            # Store in cache after successful synthesis (synthesis mode only).
            # Skip when filters are active — the cache key doesn't capture them.
            if output_mode == "synthesis" and not filters_active:
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
        finally:
            # One cost record per search, on every terminal path (success, no
            # papers, fetch/synthesis error). fallback_cost covers the rare case
            # where token capture didn't propagate, so burn is never under-counted.
            await asyncio.to_thread(
                log_search_cost,
                query_id=query_id, user_id=user_id, tier=tier, output_mode=output_mode,
                summary=cost_tracker.summary(),
                latency_ms=int((time.monotonic() - t_start) * 1000),
                papers_processed=papers_count,
                cache_hit=False,
                fallback_cost=estimated_cost,
            )

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
            "is_trial": quota.get("is_trial", False),
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


# ── BYO-PDF library (Task 1.3) ────────────────────────────────────────────────

async def _require_user(request: Request) -> str | None:
    jwt_token = _extract_jwt(request)
    return await asyncio.to_thread(verify_jwt, jwt_token) if jwt_token else None


@app.get("/library")
async def library_list(request: Request):
    """List the caller's uploaded papers + their storage quota."""
    user_id = await _require_user(request)
    if not user_id:
        return JSONResponse(status_code=401, content={"error": "unauthorized"})
    tier = await asyncio.to_thread(get_tier, user_id)
    docs = await asyncio.to_thread(list_documents, user_id)
    return {"documents": docs, "count": len(docs), "cap": storage_cap(tier), "tier": tier}


@app.post("/library/upload")
async def library_upload(request: Request, file: UploadFile = File(...)):
    """Upload a PDF → extract, chunk, embed, store privately in the user's library."""
    user_id = await _require_user(request)
    if not user_id:
        return JSONResponse(status_code=401, content={"error": "unauthorized"})
    tier = await asyncio.to_thread(get_tier, user_id)
    data = await file.read()
    try:
        doc = await asyncio.to_thread(
            add_document, user_id, tier, data=data, filename=file.filename, title=None
        )
    except LibraryError as e:
        return JSONResponse(status_code=400, content={"error": "library_error", "message": str(e)})
    except embeddings.EmbeddingQuotaError:
        # The embedding provider's DAILY free-tier quota is spent (resets midnight
        # Pacific). Retrying can't help today, so surface a calm, human 503 with a
        # `message` the frontend already renders — not a scary raw stack-trace detail.
        return JSONResponse(status_code=503, content={
            "error": "embeddings_at_capacity",
            "message": "Indexing is temporarily at capacity for today. Please try "
                       "this upload again in a few hours.",
        })
    except Exception as e:
        # Anything else (provider API error, dimension/DB mismatch, etc.) would
        # otherwise escape as an unhandled 500 — and a 500 generated outside the
        # CORS middleware ships WITHOUT Access-Control-Allow-Origin, so the browser
        # blocks it and the user only sees "Failed to fetch", hiding the real cause.
        # Return a CORS-wrapped JSON error and log the detail for Railway logs.
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": "upload_failed", "detail": f"{type(e).__name__}: {e}"},
        )
    return doc


@app.delete("/library/{doc_id}")
async def library_delete(doc_id: str, request: Request):
    """Delete a library document and its embedded chunks (owner-scoped)."""
    user_id = await _require_user(request)
    if not user_id:
        return JSONResponse(status_code=401, content={"error": "unauthorized"})
    ok = await asyncio.to_thread(delete_document, user_id, doc_id)
    return {"deleted": ok}


@app.delete("/library")
async def library_delete_all(request: Request):
    """Delete ALL of the caller's library documents (data deletion)."""
    user_id = await _require_user(request)
    if not user_id:
        return JSONResponse(status_code=401, content={"error": "unauthorized"})
    ok = await asyncio.to_thread(delete_all_documents, user_id)
    return {"deleted": ok}


@app.delete("/account")
async def account_delete(request: Request):
    """Right to erasure: wipe all of the caller's data and their account.

    Removes library docs/chunks, search history, usage/cost rows, profile, and the
    auth account itself. Irreversible.
    """
    user_id = await _require_user(request)
    if not user_id:
        return JSONResponse(status_code=401, content={"error": "unauthorized"})
    result = await asyncio.to_thread(purge_user_data, user_id, delete_account=True)
    return result


# Bump this when you want to confirm a deploy actually shipped. If /admin/key-status
# returns an older marker (or 404), Railway is still serving stale code — likely a
# failed build (e.g. torch too large), which is the real cause of a "stuck" 401.
BUILD_MARKER = "gemini-tpm-pacing-2026-06-12"


@app.get("/admin/key-status")
async def admin_key_status():
    """UNAUTHENTICATED, value-free check: does the server actually see ADMIN_KEY?

    Reveals only whether the var is set, its length, and an 8-char SHA-256
    fingerprint (never the value) — enough to confirm Railway is injecting it and
    to compare against the key you set, without leaking the secret. The build
    marker confirms which code is live. Remove this endpoint once debugged.
    """
    raw = os.getenv("ADMIN_KEY")
    key = (raw or "").strip()
    fp = hashlib.sha256(key.encode()).hexdigest()[:8] if key else None
    return {
        "build": BUILD_MARKER,
        "admin_key_set": bool(raw),
        "admin_key_len": len(key),
        "admin_key_len_before_strip": len(raw) if raw else 0,
        "admin_key_fingerprint": fp,
    }


def _admin_guard(request: Request):
    """Return None if the caller is an authorized admin, else a JSONResponse.

    Auth = the ADMIN_KEY env var, supplied via the X-Admin-Key header or ?key=.
    Surrounding whitespace is stripped on BOTH sides so a trailing newline pasted
    into the Railway value (or the shell) doesn't cause a spurious 401. Unset key
    → 503 (endpoint disabled). Add ?debug=1 to a failing request to get a SAFE
    comparison (lengths + short SHA-256 fingerprints) that never reveals the key.
    """
    admin_key = (os.getenv("ADMIN_KEY") or "").strip()
    if not admin_key:
        return JSONResponse(status_code=503, content={"error": "admin_disabled",
            "message": "Set ADMIN_KEY in the backend env to enable /admin endpoints."})
    raw = request.headers.get("x-admin-key") or request.query_params.get("key") or ""
    supplied = raw.strip()
    if supplied == admin_key:
        return None
    if request.query_params.get("debug") == "1":
        def fp(s: str) -> str:
            return hashlib.sha256(s.encode()).hexdigest()[:8]
        return JSONResponse(status_code=401, content={"error": "unauthorized", "debug": {
            "env_admin_key_len": len(admin_key),
            "supplied_len": len(supplied),
            "supplied_len_before_strip": len(raw),
            "env_fingerprint": fp(admin_key),
            "supplied_fingerprint": fp(supplied),
            "supplied_via": "header" if request.headers.get("x-admin-key") else "query",
            "hint": "equal len + equal fingerprint ⇒ a match; differing len ⇒ whitespace or "
                    "URL-encoding mangled the key (prefer the X-Admin-Key header for keys with +,&,#,%).",
        }})
    return JSONResponse(status_code=401, content={"error": "unauthorized"})


@app.get("/admin/costs")
async def admin_costs(request: Request):
    """Internal cost dashboard (Task 2.1): cost/search p50/p95, daily burn, by stage."""
    guard = _admin_guard(request)
    if guard is not None:
        return guard
    try:
        days = int(request.query_params.get("days", "14"))
    except ValueError:
        days = 14
    days = max(1, min(days, 90))
    return await asyncio.to_thread(cost_dashboard, days)


@app.get("/admin/embed-check")
async def admin_embed_check(request: Request):
    """Verify embeddings work on Railway by making a REAL provider API call.

    Embeds a probe string via the active provider (Voyage or Gemini — see
    embeddings.py) and reports the provider, model name and vector dimension, so
    a correct deploy shows the expected provider and dim 512. Guarded by
    ADMIN_KEY (X-Admin-Key header or ?key=). Returns 500 if the provider's API
    key is unset or the call fails (bad key, network, rate limit).
    """
    guard = _admin_guard(request)
    if guard is not None:
        return guard

    import embeddings
    if not embeddings.is_available():
        key = "GEMINI_API_KEY" if embeddings.PROVIDER == "gemini" else "VOYAGE_API_KEY"
        return JSONResponse(status_code=500, content={
            "available": False,
            "provider": embeddings.PROVIDER,
            "error": f"{key} is not set — add it in the Railway environment.",
        })
    t = time.monotonic()
    try:
        vec = await asyncio.to_thread(embeddings.embed_query, "researca embedding deploy check")
        return {
            "available": True,
            "provider": embeddings.PROVIDER,
            "model": embeddings.MODEL_NAME,
            "dim": len(vec),
            "expected_dim": embeddings.EMBED_DIM,
            "load_and_embed_ms": int((time.monotonic() - t) * 1000),
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={
            "available": False, "provider": embeddings.PROVIDER,
            "error": f"{type(e).__name__}: {e}",
        })


@app.post("/admin/reembed")
async def admin_reembed(request: Request):
    """Re-embed every stored doc_chunks row with the ACTIVE embedding provider.

    Run this once after switching providers (Voyage ↔ Gemini): their vectors
    live in different spaces, so chunks embedded by the old provider would
    silently stop matching queries embedded by the new one. Chunk text is kept
    in doc_chunks.content, so no PDF re-upload is needed. Guarded by ADMIN_KEY.
    """
    guard = _admin_guard(request)
    if guard is not None:
        return guard

    import embeddings
    import vector_store
    if not embeddings.is_available():
        return JSONResponse(status_code=500, content={
            "error": "embeddings_unavailable", "provider": embeddings.PROVIDER,
        })
    try:
        result = await asyncio.to_thread(vector_store.reembed_all)
        return {"provider": embeddings.PROVIDER, "model": embeddings.MODEL_NAME, **result}
    except Exception as e:
        return JSONResponse(status_code=500, content={
            "error": f"{type(e).__name__}: {e}", "provider": embeddings.PROVIDER,
        })


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
