import logging
import os
from collections import defaultdict
from datetime import date, datetime, timedelta, time as dt_time, timezone

import jwt

from supabase_client import sb

logger = logging.getLogger(__name__)

# ── JWT verification via Supabase's public JWKS (asymmetric ES256/RS256) ──────
# Supabase signs access tokens with rotating asymmetric keys exposed at the
# project's public JWKS endpoint. Verifying locally (a) needs no service-role
# key, (b) is independent of the installed supabase-py version, and (c) avoids a
# network round-trip to /auth/v1/user on every search. PyJWKClient caches the
# fetched keys, so only the first verification hits the network.
_SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
_jwks_client: jwt.PyJWKClient | None = (
    jwt.PyJWKClient(f"{_SUPABASE_URL}/auth/v1/.well-known/jwks.json")
    if _SUPABASE_URL
    else None
)

# ── Tier limits — tune these constants, never hardcode elsewhere ─────────────
# anonymous.daily = lifetime total (in-memory, clears on restart, no monthly).
# cost_monthly = hard USD ceiling per calendar month (None = no cost cap).
LIMITS: dict[str, dict] = {
    "anonymous": {"daily": 2,  "monthly": None, "cost_monthly": None},
    "free":      {"daily": 10, "monthly": 20,   "cost_monthly": 0.50},
    "pro":       {"daily": 30, "monthly": 150,  "cost_monthly": 8.00},
    "lab":       {"daily": 60, "monthly": 300,  "cost_monthly": 20.00},
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

    Primary path: verify the signature locally against the project's public JWKS
    (ES256/RS256). This is the path that fixes the production bug where logged-in
    users were silently downgraded to the anonymous quota — the old code depended
    on a network ``get_user`` call that failed when the service-role key / library
    version on Railway couldn't validate the new asymmetric tokens.

    Fallback: if no JWKS signing key matches (e.g. a legacy HS256-signed token, or
    the JWKS endpoint is unreachable), fall back to the GoTrue network call.
    """
    if not token:
        return None

    if _jwks_client is not None:
        signing_key = None
        try:
            signing_key = _jwks_client.get_signing_key_from_jwt(token)
        except Exception as e:
            # kid not in JWKS / endpoint unreachable → try the network fallback.
            logger.warning("verify_jwt: no JWKS key (%s: %s); trying network", type(e).__name__, e)

        if signing_key is not None:
            try:
                payload = jwt.decode(
                    token,
                    signing_key.key,
                    algorithms=["ES256", "RS256"],
                    audience="authenticated",
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

        if daily_count >= limits["daily"]:
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
    return {
        "allowed": True,
        "tier": tier,
        "remaining_daily": limits["daily"] - used_daily,
        "limit_daily": limits["daily"],
        "remaining_monthly": remaining_monthly,
        "limit_monthly": limits["monthly"],
    }
