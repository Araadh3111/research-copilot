import logging
import os
from collections import defaultdict
from datetime import date, datetime, timedelta, time as dt_time, timezone
from urllib.parse import urlparse

import jwt

from supabase_client import sb, SUPABASE_BASE_URL

logger = logging.getLogger(__name__)

# ── JWT verification via Supabase's public JWKS (asymmetric ES256/RS256) ──────
# Supabase signs access tokens with rotating asymmetric keys exposed at the
# issuer's public JWKS endpoint. Verifying locally needs no service-role key,
# is independent of the supabase-py version, and avoids a /auth/v1/user round
# trip per search.
#
# The JWKS URL is derived from the token's own ``iss`` claim — NOT from the
# SUPABASE_URL env var — after allow-listing the issuer host. This is what fixes
# the production bug: building the URL from a misconfigured Railway SUPABASE_URL
# produced a 404, so verify_jwt returned None and logged-in users fell through to
# the anonymous quota. Using the issuer guarantees we fetch the right project's
# keys regardless of env drift. Supabase's /auth/v1 routes also sit behind Kong,
# which 401s without an ``apikey`` header, so we send one.
_SUPABASE_URL = SUPABASE_BASE_URL
_SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY", "")

# One cached PyJWKClient per issuer (keys are fetched once then cached).
_jwks_clients: dict[str, jwt.PyJWKClient] = {}


def _issuer_allowed(iss: str) -> bool:
    """Only trust Supabase-issued tokens (exact configured match, or *.supabase.co)."""
    if not iss:
        return False
    if _SUPABASE_URL and iss == f"{_SUPABASE_URL}/auth/v1":
        return True
    host = (urlparse(iss).hostname or "").lower()
    return host == "localhost" or host.endswith(".supabase.co")


def _jwks_client_for(issuer: str) -> jwt.PyJWKClient | None:
    if issuer not in _jwks_clients:
        _jwks_clients[issuer] = jwt.PyJWKClient(
            f"{issuer}/.well-known/jwks.json",
            headers={"apikey": _SUPABASE_KEY} if _SUPABASE_KEY else {},
        )
    return _jwks_clients[issuer]

# ── Tier limits — tune these constants, never hardcode elsewhere ─────────────
# anonymous.daily = lifetime total (in-memory, clears on restart, no monthly).
# cost_monthly = hard USD ceiling per calendar month (None = no cost cap).
# daily = None means no daily cap (only the monthly limit binds).
LIMITS: dict[str, dict] = {
    "anonymous": {"daily": 2,    "monthly": None, "cost_monthly": None},
    "free":      {"daily": 10,   "monthly": 20,   "cost_monthly": 0.50},
    "pro":       {"daily": None, "monthly": 200,  "cost_monthly": 8.00},
    "lab":       {"daily": None, "monthly": 300,  "cost_monthly": 20.00},
}

# ── Per-search cost estimates (USD) ──────────────────────────────────────────
# Used to increment estimated_cost_usd in user_usage and check cost ceilings.
# MIGRATION (run once in Supabase SQL editor before deploying):
#   ALTER TABLE user_usage
#     ADD COLUMN IF NOT EXISTS estimated_cost_usd FLOAT DEFAULT 0;
SEARCH_COST = {
    "haiku":            0.007,
    "sonnet":           0.040,
    "matrix_surcharge": 0.005,
}

# ── Anonymous tracking (in-memory, IP-keyed) ─────────────────────────────────
_anon_counts: dict[str, int] = defaultdict(int)


def check_anon(ip: str) -> dict:
    """Check and increment anonymous IP usage. Returns quota info dict."""
    limit = LIMITS["anonymous"]["daily"]
    count = _anon_counts[ip]

    if count >= limit:
        return {
            "allowed": False,
            "limit_type": "total",
            "tier": "anonymous",
            "resets_at": None,
        }

    _anon_counts[ip] += 1
    return {
        "allowed": True,
        "tier": "anonymous",
        "remaining_daily": limit - count - 1,
        "limit_daily": limit,
        "remaining_monthly": None,
        "limit_monthly": None,
    }


# ── Authenticated usage ───────────────────────────────────────────────────────

def verify_jwt(token: str) -> str | None:
    """Return the user_id (JWT ``sub``) for a valid Supabase access token, else None.

    Verifies the signature locally against the issuer's public JWKS (ES256/RS256).
    The issuer is read from the token's ``iss`` claim and allow-listed before any
    network call, so a misconfigured SUPABASE_URL on the server can't break auth
    (the production bug) or be used to point verification at an attacker's keys.

    Falls back to the GoTrue network call only for legacy tokens or if JWKS is
    unreachable.
    """
    if not token:
        return None

    try:
        unverified = jwt.decode(token, options={"verify_signature": False})
    except Exception:
        return None

    iss = unverified.get("iss", "")
    if not _issuer_allowed(iss):
        logger.warning("verify_jwt: untrusted issuer %r", iss)
        return None

    try:
        signing_key = _jwks_client_for(iss).get_signing_key_from_jwt(token)
    except Exception as e:
        # kid not in JWKS / endpoint unreachable → try the network fallback.
        logger.warning("verify_jwt: no JWKS key (%s: %s); trying network", type(e).__name__, e)
        signing_key = None

    if signing_key is not None:
        try:
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=["ES256", "RS256"],
                audience="authenticated",
                issuer=iss,
                options={"verify_exp": True},
            )
            return payload.get("sub")
        except jwt.PyJWTError as e:
            # Signed token but invalid/expired/wrong-audience → definitive reject.
            logger.info("verify_jwt: rejected token (%s)", type(e).__name__)
            return None

    # Fallback: GoTrue network validation (legacy tokens or JWKS unavailable).
    if sb:
        try:
            resp = sb.auth.get_user(token)
            return resp.user.id if resp.user else None
        except Exception as e:
            logger.warning("verify_jwt: get_user fallback failed (%s: %s)", type(e).__name__, e)
    return None


def record_search(user_id: str, query: str, output_mode: str) -> None:
    """Append one row to search_history for a logged-in user (best-effort).

    Inserts with the service-role client (bypasses RLS); reads happen on the
    frontend under the user's JWT, where RLS restricts rows to their own. Never
    raises — a history write must never break or slow the search response.
    """
    if not sb or not user_id:
        return
    try:
        sb.table("search_history").insert(
            {"user_id": user_id, "query": query, "output_mode": output_mode}
        ).execute()
    except Exception as e:
        logger.warning("record_search failed (%s: %s)", type(e).__name__, e)


def get_tier(user_id: str) -> str:
    """Return the user's tier from user_profiles; defaults to 'free'."""
    if not sb:
        return "free"
    try:
        row = (
            sb.table("user_profiles")
            .select("tier")
            .eq("id", user_id)
            .single()
            .execute()
        )
        return (row.data or {}).get("tier", "free")
    except Exception:
        return "free"


def check_user(user_id: str, tier: str, estimated_cost: float = 0.0) -> dict:
    """Check and increment usage for an authenticated user.

    Checks daily search count, monthly search count, and monthly cost ceiling.
    Upserts the daily row (count + cost) on success.
    Fails open on any Supabase error so users are never blocked by infra issues.
    """
    limits = LIMITS.get(tier, LIMITS["free"])

    if not sb:
        return _allow(tier, limits, limits["daily"], limits["monthly"] or 0)

    today = date.today()

    try:
        # ── Daily row (count + today's accumulated cost) ─────────────────────
        row = (
            sb.table("user_usage")
            .select("daily_count, estimated_cost_usd")
            .eq("user_id", user_id)
            .eq("date", today.isoformat())
            .execute()
        )
        daily_count: int = row.data[0]["daily_count"] if row.data else 0
        today_cost: float = (row.data[0].get("estimated_cost_usd") or 0.0) if row.data else 0.0

        if limits["daily"] is not None and daily_count >= limits["daily"]:
            tomorrow = today + timedelta(days=1)
            resets = datetime.combine(tomorrow, dt_time.min, timezone.utc).isoformat()
            return {"allowed": False, "limit_type": "daily", "tier": tier, "resets_at": resets}

        # ── Monthly counts + cost ────────────────────────────────────────────
        monthly_count = 0
        monthly_cost = 0.0
        if limits["monthly"] or limits.get("cost_monthly"):
            month_start = today.replace(day=1).isoformat()
            m_rows = (
                sb.table("user_usage")
                .select("daily_count, estimated_cost_usd")
                .eq("user_id", user_id)
                .gte("date", month_start)
                .execute()
            )
            monthly_count = sum(r["daily_count"] for r in (m_rows.data or []))
            monthly_cost = sum((r.get("estimated_cost_usd") or 0.0) for r in (m_rows.data or []))

            if limits["monthly"] and monthly_count >= limits["monthly"]:
                next_month = (today.replace(day=1) + timedelta(days=32)).replace(day=1)
                resets = datetime.combine(next_month, dt_time.min, timezone.utc).isoformat()
                return {"allowed": False, "limit_type": "monthly", "tier": tier, "resets_at": resets}

            cost_ceiling = limits.get("cost_monthly")
            if cost_ceiling and monthly_cost >= cost_ceiling:
                next_month = (today.replace(day=1) + timedelta(days=32)).replace(day=1)
                resets = datetime.combine(next_month, dt_time.min, timezone.utc).isoformat()
                return {"allowed": False, "limit_type": "monthly", "tier": tier, "resets_at": resets}

        # ── Increment count + cost ────────────────────────────────────────────
        sb.table("user_usage").upsert(
            {
                "user_id": user_id,
                "date": today.isoformat(),
                "daily_count": daily_count + 1,
                "estimated_cost_usd": today_cost + estimated_cost,
            },
            on_conflict="user_id,date",
        ).execute()

        return _allow(tier, limits, daily_count + 1, monthly_count + 1)

    except Exception:
        # Supabase hiccup — fail open so users aren't blocked by an infra error.
        return _allow(tier, limits, limits["daily"], limits["monthly"] or 0)


def _allow(tier: str, limits: dict, used_daily: int, used_monthly: int) -> dict:
    remaining_monthly = (
        limits["monthly"] - used_monthly if limits["monthly"] else None
    )
    remaining_daily = (
        limits["daily"] - used_daily if limits["daily"] is not None else None
    )
    return {
        "allowed": True,
        "tier": tier,
        "remaining_daily": remaining_daily,
        "limit_daily": limits["daily"],
        "remaining_monthly": remaining_monthly,
        "limit_monthly": limits["monthly"],
    }
