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
# monthly         = synthesis searches / month (the daily_count column).
# matrix_monthly  = Comparison Matrix runs / month (matrix_runs_used column).
# verify_monthly  = "Verify" claim checks / month (verifies_used column).
# 0 on a feature = not available to that tier (Matrix/Verify are Pro-only).
LIMITS: dict[str, dict] = {
    "anonymous": {"daily": 2,    "monthly": None, "cost_monthly": None,  "matrix_monthly": 0,  "verify_monthly": 0},
    # Free = 10 searches / month ONGOING, but new accounts get a front-loaded
    # trial first (see TRIAL_* below): 25 searches across their first 7 days of
    # activity, then this 10/month cap binds. daily is None so the *monthly*
    # window binds first and the 429 reports "resets next month", not a
    # misleading "resets tomorrow".
    "free":      {"daily": None, "monthly": 10,   "cost_monthly": 0.50,  "matrix_monthly": 0,  "verify_monthly": 0},
    "pro":       {"daily": None, "monthly": 120,  "cost_monthly": 8.00,  "matrix_monthly": 30, "verify_monthly": 300},
    "lab":       {"daily": None, "monthly": 300,  "cost_monthly": 20.00, "matrix_monthly": 60, "verify_monthly": 600},
}

# ── Front-loaded free trial (Task 0.2) ───────────────────────────────────────
# Lit review is bursty: a flat 10/month dies mid-evaluation before the aha
# moment. New free accounts instead get TRIAL_SEARCHES across their first
# TRIAL_DAYS of activity, then decay to the standard 10/month.
#
# The trial window is anchored to the user's FIRST search (earliest user_usage
# row), not auth signup — this keeps the logic self-contained (no dependency on
# user_profiles columns the migrations don't own) and is strictly more generous:
# the clock starts when the user actually begins, not when they registered.
TRIAL_DAYS = 7
TRIAL_SEARCHES = 25

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

# Whether the optional user_usage.estimated_cost_usd column exists. Auto-disabled
# the first time Postgres reports it missing (error 42703) so a not-yet-applied
# migration (004) can't take down COUNT enforcement. The bug this guards against:
# selecting/writing a missing column threw on every request, hitting check_user's
# fail-open except — users were never limited and the usage bar never filled.
_HAS_COST_COL = True


def _missing_cost_column(exc: Exception) -> bool:
    s = str(exc)
    return "estimated_cost_usd" in s and ("42703" in s or "does not exist" in s)

# ── Anonymous tracking (in-memory, IP-keyed) ─────────────────────────────────
_anon_counts: dict[str, int] = defaultdict(int)


def check_anon(ip: str, *, commit: bool = True) -> dict:
    """Check anonymous IP usage (lifetime total). Returns a quota info dict.

    ``commit=False`` peeks without consuming a search — used to enforce the limit
    *before* any Anthropic call. ``commit=True`` increments the count. Anonymous
    tracking is purely in-memory (no Supabase), so it never fails open: an
    over-limit anonymous caller is always blocked.
    """
    limit = LIMITS["anonymous"]["daily"]
    count = _anon_counts[ip]

    if count >= limit:
        return {
            "allowed": False,
            "limit_type": "total",
            "tier": "anonymous",
            "resets_at": None,
        }

    if commit:
        _anon_counts[ip] += 1
        count += 1

    return {
        "allowed": True,
        "tier": "anonymous",
        "remaining_daily": limit - count,
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


def _first_usage_date(user_id: str) -> "date | None":
    """Earliest user_usage.date for this user, i.e. the day they first searched.

    Returns None if the user has no usage rows yet (their very first search, where
    the row is written only after this check). Callers treat None as "starts today".
    Best-effort: any Supabase error returns None so the trial simply starts fresh.
    """
    try:
        rows = (
            sb.table("user_usage").select("date")
            .eq("user_id", user_id).order("date").limit(1).execute()
        )
        if rows.data:
            return date.fromisoformat(rows.data[0]["date"])
    except Exception:
        pass
    return None


def _free_window(user_id: str, today: "date") -> dict:
    """Resolve the active quota window for a FREE-tier user.

    Returns ``{monthly, window_start, resets_at, is_trial}`` where:
      - During the trial (first TRIAL_DAYS of activity): a TRIAL_SEARCHES cap
        counted from the first-search date, resetting when the trial ends.
      - After the trial: the standard 10/month, counted from the later of the
        calendar-month start or the trial end — so trial usage never bleeds into
        and pre-exhausts the first post-trial month.
    """
    first = _first_usage_date(user_id) or today
    trial_end = first + timedelta(days=TRIAL_DAYS)
    month_start = today.replace(day=1)

    if today < trial_end:
        resets = datetime.combine(trial_end, dt_time.min, timezone.utc).isoformat()
        return {
            "monthly": TRIAL_SEARCHES,
            "window_start": first.isoformat(),
            "resets_at": resets,
            "is_trial": True,
        }

    return {
        "monthly": LIMITS["free"]["monthly"],
        "window_start": max(month_start, trial_end).isoformat(),
        "resets_at": _month_resets_iso(),
        "is_trial": False,
    }


def check_user(user_id: str, tier: str, estimated_cost: float = 0.0, *, commit: bool = True) -> dict:
    """Check usage for an authenticated user against their tier ceilings.

    Checks daily search count, monthly search count, and monthly cost ceiling.
    With ``commit=True`` (default) it upserts the daily row (count + cost) when the
    request is allowed. With ``commit=False`` it only peeks — no increment — so the
    caller can enforce the limit *before* spending anything on Anthropic, then
    commit once the request is confirmed valid.

    Fails open on any Supabase error so authenticated users are never blocked by an
    infra hiccup (the Hybrid policy: logged-in users fail open here; anonymous
    callers are tracked in-memory in check_anon and can't fail open).
    """
    limits = LIMITS.get(tier, LIMITS["free"])

    if not sb:
        return _allow(tier, limits, limits["daily"], limits["monthly"] or 0)

    today = date.today()
    global _HAS_COST_COL

    try:
        # ── Daily row (count + today's accumulated cost) ─────────────────────
        # daily_count is the primary enforcement signal and always exists; the
        # cost column is optional (see _HAS_COST_COL). Probe it here and, if it's
        # missing, permanently fall back to count-only so the request still
        # enforces the limit instead of crashing into the fail-open path.
        cols = "daily_count, estimated_cost_usd" if _HAS_COST_COL else "daily_count"
        try:
            row = (
                sb.table("user_usage").select(cols)
                .eq("user_id", user_id).eq("date", today.isoformat()).execute()
            )
        except Exception as e:
            if not _missing_cost_column(e):
                raise
            print("[usage] estimated_cost_usd column missing - cost ceiling disabled "
                  "until migration 004 is applied; count enforcement still active", flush=True)
            _HAS_COST_COL = False
            row = (
                sb.table("user_usage").select("daily_count")
                .eq("user_id", user_id).eq("date", today.isoformat()).execute()
            )
        daily_count: int = row.data[0]["daily_count"] if row.data else 0
        today_cost: float = (row.data[0].get("estimated_cost_usd") or 0.0) if (row.data and _HAS_COST_COL) else 0.0

        # ── Effective monthly window ─────────────────────────────────────────
        # Free tier gets a front-loaded trial (25 searches over 7 days) before
        # the flat 10/month binds; other tiers use the calendar month as-is.
        eff = dict(limits)
        window_start = today.replace(day=1).isoformat()
        month_resets = _month_resets_iso()
        is_trial = False
        if tier == "free":
            win = _free_window(user_id, today)
            eff["monthly"] = win["monthly"]
            window_start = win["window_start"]
            month_resets = win["resets_at"]
            is_trial = win["is_trial"]

        # ── Monthly counts + cost ────────────────────────────────────────────
        monthly_count = 0
        monthly_cost = 0.0
        if eff["monthly"] or eff.get("cost_monthly"):
            m_cols = "daily_count, estimated_cost_usd" if _HAS_COST_COL else "daily_count"
            m_rows = (
                sb.table("user_usage").select(m_cols)
                .eq("user_id", user_id).gte("date", window_start).execute()
            )
            monthly_count = sum(r["daily_count"] for r in (m_rows.data or []))
            if _HAS_COST_COL:
                monthly_cost = sum((r.get("estimated_cost_usd") or 0.0) for r in (m_rows.data or []))

        # Diagnostic — current usage vs the tier's ceilings (visible in Railway logs).
        print(
            f"[usage] user={user_id} tier={tier}{' TRIAL' if is_trial else ''} "
            f"daily={daily_count}/{eff['daily']} "
            f"monthly={monthly_count}/{eff['monthly']} "
            f"cost=${monthly_cost:.3f}/{eff.get('cost_monthly')}",
            flush=True,
        )

        # ── Enforce ceilings — when count >= limit, RETURN allowed:False ─────
        # (the bug was the limit being logged but the request still proceeding.)
        if eff["daily"] is not None and daily_count >= eff["daily"]:
            tomorrow = today + timedelta(days=1)
            resets = datetime.combine(tomorrow, dt_time.min, timezone.utc).isoformat()
            print(f"[usage] BLOCK daily user={user_id} {daily_count}>={eff['daily']}", flush=True)
            return {"allowed": False, "limit_type": "daily", "tier": tier, "resets_at": resets}

        if eff["monthly"] and monthly_count >= eff["monthly"]:
            print(f"[usage] BLOCK monthly user={user_id} {monthly_count}>={eff['monthly']}"
                  f"{' (trial)' if is_trial else ''}", flush=True)
            return {"allowed": False, "limit_type": "monthly", "tier": tier,
                    "resets_at": month_resets, "is_trial": is_trial,
                    "limit": eff["monthly"], "used": monthly_count}

        cost_ceiling = eff.get("cost_monthly")
        if cost_ceiling and monthly_cost >= cost_ceiling:
            print(f"[usage] BLOCK cost user={user_id} ${monthly_cost:.3f}>=${cost_ceiling}", flush=True)
            return {"allowed": False, "limit_type": "monthly", "tier": tier, "resets_at": month_resets}

        # Within all ceilings. On a peek, report current usage without consuming.
        if not commit:
            return _allow(tier, eff, daily_count, monthly_count, is_trial=is_trial)

        # ── Increment count + cost ────────────────────────────────────────────
        payload = {
            "user_id": user_id,
            "date": today.isoformat(),
            "daily_count": daily_count + 1,
        }
        if _HAS_COST_COL:
            payload["estimated_cost_usd"] = today_cost + estimated_cost
        sb.table("user_usage").upsert(payload, on_conflict="user_id,date").execute()

        return _allow(tier, eff, daily_count + 1, monthly_count + 1, is_trial=is_trial)

    except Exception as e:
        # Supabase hiccup — fail open so users aren't blocked by an infra error.
        # NOTE: this path returns allowed:True even at "0 remaining", so a flaky
        # Supabase read looks like "limit not enforced". The log line below makes
        # that visible instead of silent.
        print(f"[usage] FAIL-OPEN user={user_id} tier={tier} err={type(e).__name__}: {e}", flush=True)
        return _allow(tier, limits, limits["daily"], limits["monthly"] or 0)


def _allow(tier: str, limits: dict, used_daily: int, used_monthly: int,
           *, is_trial: bool = False) -> dict:
    remaining_monthly = (
        max(limits["monthly"] - used_monthly, 0) if limits["monthly"] else None
    )
    remaining_daily = (
        max(limits["daily"] - used_daily, 0) if limits["daily"] is not None else None
    )
    return {
        "allowed": True,
        "tier": tier,
        "remaining_daily": remaining_daily,
        "limit_daily": limits["daily"],
        "remaining_monthly": remaining_monthly,
        "limit_monthly": limits["monthly"],
        "is_trial": is_trial,
    }


# ── Per-feature monthly counters (Matrix runs, Verify checks) ─────────────────
# These live in their own user_usage columns (matrix_runs_used / verifies_used),
# summed across the calendar month, so each feature has an independent budget
# tracked separately from the synthesis search count (daily_count).

def _month_start_iso() -> str:
    return date.today().replace(day=1).isoformat()


def _month_resets_iso() -> str:
    today = date.today()
    next_month = (today.replace(day=1) + timedelta(days=32)).replace(day=1)
    return datetime.combine(next_month, dt_time.min, timezone.utc).isoformat()


def _monthly_sum(user_id: str, column: str) -> int:
    """Sum one usage column across the current calendar month."""
    rows = (
        sb.table("user_usage")
        .select(column)
        .eq("user_id", user_id)
        .gte("date", _month_start_iso())
        .execute()
    )
    return sum((r.get(column) or 0) for r in (rows.data or []))


def _feature_allow(tier: str, limit_type: str, used: int, limit) -> dict:
    return {
        "allowed": True,
        "tier": tier,
        "limit_type": limit_type,
        "used": used,
        "limit": limit,
        "remaining": (None if limit is None else max(limit - used, 0)),
    }


def check_feature_monthly(
    user_id: str, tier: str, *, column: str, limit_key: str, limit_type: str, commit: bool = True
) -> dict:
    """Check (and optionally increment) a per-feature monthly counter.

    Used for Matrix and Verify. limit None = unlimited; limit 0 = unavailable to
    this tier. Fails open for authenticated users on any Supabase error (Hybrid
    policy) so an infra hiccup never blocks a paying user.
    """
    limits = LIMITS.get(tier, LIMITS["free"])
    limit = limits.get(limit_key)

    if not sb:
        return _feature_allow(tier, limit_type, 0, limit)

    try:
        used = _monthly_sum(user_id, column)

        if limit is not None and used >= limit:
            return {
                "allowed": False,
                "tier": tier,
                "limit_type": limit_type,
                "used": used,
                "limit": limit,
                "remaining": 0,
                "resets_at": _month_resets_iso(),
            }

        if commit:
            row = (
                sb.table("user_usage")
                .select(column)
                .eq("user_id", user_id)
                .eq("date", date.today().isoformat())
                .execute()
            )
            today_val = (row.data[0].get(column) or 0) if row.data else 0
            # Partial upsert: only this column is updated on conflict; daily_count,
            # cost and the other feature column are left untouched.
            sb.table("user_usage").upsert(
                {"user_id": user_id, "date": date.today().isoformat(), column: today_val + 1},
                on_conflict="user_id,date",
            ).execute()
            used += 1

        return _feature_allow(tier, limit_type, used, limit)

    except Exception as e:
        print(f"[usage] FAIL-OPEN feature={limit_type} user={user_id}: {type(e).__name__}: {e}", flush=True)
        return _feature_allow(tier, limit_type, 0, limit)


def check_matrix(user_id: str, tier: str, *, commit: bool = True) -> dict:
    return check_feature_monthly(
        user_id, tier, column="matrix_runs_used", limit_key="matrix_monthly",
        limit_type="matrix", commit=commit,
    )


def check_verify(user_id: str, tier: str, *, commit: bool = True) -> dict:
    return check_feature_monthly(
        user_id, tier, column="verifies_used", limit_key="verify_monthly",
        limit_type="verify", commit=commit,
    )


def usage_summary(user_id: str, tier: str) -> dict:
    """Read-only snapshot of all three monthly quotas for the account/usage area."""
    limits = LIMITS.get(tier, LIMITS["free"])

    # Free users may be inside the front-loaded trial; the search counter then
    # reflects the 25/7-day window (and its reset), not the calendar month. The
    # Matrix/Verify counters are Pro-only and always calendar-month.
    search_window_start = _month_start_iso()
    search_limit = limits.get("monthly")
    resets_at = _month_resets_iso()
    is_trial = False
    if tier == "free" and sb:
        win = _free_window(user_id, date.today())
        search_window_start = win["window_start"]
        search_limit = win["monthly"]
        resets_at = win["resets_at"]
        is_trial = win["is_trial"]

    def _window_sum(column: str, start_iso: str) -> int:
        try:
            rows = (
                sb.table("user_usage").select(column)
                .eq("user_id", user_id).gte("date", start_iso).execute()
            )
            return sum((r.get(column) or 0) for r in (rows.data or []))
        except Exception:
            return 0

    def feat(column: str, limit_key: str) -> dict:
        limit = limits.get(limit_key)
        used = _window_sum(column, _month_start_iso()) if sb else 0
        return {"used": used, "limit": limit, "remaining": (None if limit is None else max(limit - used, 0))}

    searches_used = _window_sum("daily_count", search_window_start) if sb else 0

    return {
        "tier": tier,
        "searches": {
            "used": searches_used,
            "limit": search_limit,
            "remaining": (None if search_limit is None else max(search_limit - searches_used, 0)),
            "is_trial": is_trial,
        },
        "matrix": feat("matrix_runs_used", "matrix_monthly"),
        "verifies": feat("verifies_used", "verify_monthly"),
        "resets_at": resets_at,
    }
