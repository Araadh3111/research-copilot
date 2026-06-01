import logging
from collections import defaultdict
from datetime import date, datetime, timedelta, time as dt_time, timezone

from supabase_client import sb

logger = logging.getLogger(__name__)

# ── Tier limits — tune these constants, never hardcode elsewhere ─────────────
# anonymous.daily = lifetime total (in-memory, clears on restart, no monthly).
LIMITS: dict[str, dict] = {
    "anonymous": {"daily": 2,  "monthly": None},
    "free":      {"daily": 10, "monthly": 20},
    "pro":       {"daily": 30, "monthly": 150},
    "lab":       {"daily": 60, "monthly": 300},
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
    """Return user_id if the Supabase JWT is valid, else None."""
    if not sb:
        logger.error("verify_jwt: Supabase client is None — SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set")
        return None
    try:
        resp = sb.auth.get_user(token)
        user_id = resp.user.id if resp.user else None
        if not user_id:
            logger.warning("verify_jwt: get_user returned no user for token")
        return user_id
    except Exception as e:
        logger.error("verify_jwt: exception validating token: %s", e)
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


def check_user(user_id: str, tier: str) -> dict:
    """Check and increment usage for an authenticated user.

    Reads today's row + sums this month to check both caps.
    Upserts the daily row on success.
    On any Supabase error: allows through (fail open) rather than blocking users.
    """
    print(f"DEBUG user_id={user_id} ip=N/A tier={tier}", flush=True)
    limits = LIMITS.get(tier, LIMITS["free"])

    if not sb:
        return _allow(tier, limits, limits["daily"], limits["monthly"] or 0)

    today = date.today()

    try:
        # ── Daily count ──────────────────────────────────────────────────────
        row = (
            sb.table("user_usage")
            .select("daily_count")
            .eq("user_id", user_id)
            .eq("date", today.isoformat())
            .execute()
        )
        daily_count: int = row.data[0]["daily_count"] if row.data else 0

        if daily_count >= limits["daily"]:
            tomorrow = today + timedelta(days=1)
            resets = datetime.combine(tomorrow, dt_time.min, timezone.utc).isoformat()
            return {"allowed": False, "limit_type": "daily", "tier": tier, "resets_at": resets}

        # ── Monthly count ────────────────────────────────────────────────────
        monthly_count = 0
        if limits["monthly"]:
            month_start = today.replace(day=1).isoformat()
            m_rows = (
                sb.table("user_usage")
                .select("daily_count")
                .eq("user_id", user_id)
                .gte("date", month_start)
                .execute()
            )
            monthly_count = sum(r["daily_count"] for r in (m_rows.data or []))

            if monthly_count >= limits["monthly"]:
                next_month = (today.replace(day=1) + timedelta(days=32)).replace(day=1)
                resets = datetime.combine(next_month, dt_time.min, timezone.utc).isoformat()
                return {"allowed": False, "limit_type": "monthly", "tier": tier, "resets_at": resets}

        # ── Increment ────────────────────────────────────────────────────────
        sb.table("user_usage").upsert(
            {
                "user_id": user_id,
                "date": today.isoformat(),
                "daily_count": daily_count + 1,
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
