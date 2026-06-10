"""Per-search cost records + the /admin/costs dashboard aggregation (Task 2.1).

``log_search_cost`` writes one row per search to the ``search_costs`` table.
``cost_dashboard`` reads recent rows and computes cost-per-search (p50/p95),
daily burn, and cost broken down by pipeline stage.

All writes are best-effort: a logging failure must never break or slow a search,
so every Supabase call is wrapped and swallowed with a warning.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from supabase_client import sb

logger = logging.getLogger("costs")


def log_search_cost(
    *,
    query_id: str,
    user_id: str | None,
    tier: str | None,
    output_mode: str,
    summary: dict | None,
    latency_ms: int | None,
    papers_processed: int | None,
    cache_hit: bool,
    fallback_cost: float = 0.0,
) -> None:
    """Insert one cost record for a completed search. Best-effort; never raises."""
    if not sb:
        return

    summary = summary or {}
    cost = summary.get("total_cost_usd", 0.0) or 0.0
    # A cache hit makes no model calls (cost 0). For a miss where token capture
    # didn't propagate, fall back to the flat per-search estimate so burn is never
    # silently under-counted.
    if not cache_hit and cost <= 0 and fallback_cost:
        cost = fallback_cost

    row = {
        "query_id": query_id,
        "user_id": user_id,
        "tier": tier,
        "output_mode": output_mode,
        "models": summary.get("models", []),
        "input_tokens": summary.get("input_tokens", 0),
        "output_tokens": summary.get("output_tokens", 0),
        "cost_usd": round(cost, 6),
        "latency_ms": latency_ms,
        "papers_processed": papers_processed,
        "cache_hit": cache_hit,
        "by_stage": summary.get("by_stage", {}),
    }
    try:
        sb.table("search_costs").insert(row).execute()
    except Exception as e:  # pragma: no cover - logging only
        logger.warning("log_search_cost failed (%s: %s)", type(e).__name__, e)


def _percentile(values: list[float], pct: float) -> float:
    """Nearest-rank percentile of a list (pct in 0..100). Returns 0 if empty."""
    if not values:
        return 0.0
    ordered = sorted(values)
    k = max(0, min(len(ordered) - 1, round(pct / 100 * (len(ordered) - 1))))
    return ordered[k]


def cost_dashboard(days: int = 14) -> dict:
    """Aggregate the last ``days`` of search_costs into the /admin/costs payload."""
    empty = {
        "window_days": days,
        "total_searches": 0,
        "cache_hits": 0,
        "cache_hit_rate": 0.0,
        "cost_per_search": {"p50": 0.0, "p95": 0.0, "mean": 0.0},
        "total_cost_usd": 0.0,
        "daily_burn": [],
        "by_stage": [],
    }
    if not sb:
        return empty

    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    try:
        rows = (
            sb.table("search_costs")
            .select("cost_usd, cache_hit, created_at, by_stage")
            .gte("created_at", since)
            .order("created_at", desc=True)
            .limit(10000)
            .execute()
        ).data or []
    except Exception as e:
        logger.warning("cost_dashboard read failed (%s: %s)", type(e).__name__, e)
        return empty

    if not rows:
        return empty

    costs = [float(r.get("cost_usd") or 0.0) for r in rows]
    # Cost-per-search percentiles reflect billable (cache-miss) searches; cache
    # hits are free and would otherwise drag the median to ~0 and hide real cost.
    billable = [float(r.get("cost_usd") or 0.0) for r in rows if not r.get("cache_hit")]
    cache_hits = sum(1 for r in rows if r.get("cache_hit"))
    total_cost = sum(costs)

    # Daily burn (UTC date → summed cost).
    burn: dict[str, float] = defaultdict(float)
    for r in rows:
        ts = r.get("created_at") or ""
        day = ts[:10]
        burn[day] += float(r.get("cost_usd") or 0.0)
    daily_burn = [{"date": d, "cost_usd": round(c, 4)} for d, c in sorted(burn.items())]

    # Cost by pipeline stage, summed across all rows.
    stage_cost: dict[str, float] = defaultdict(float)
    stage_calls: dict[str, int] = defaultdict(int)
    for r in rows:
        for stage, s in (r.get("by_stage") or {}).items():
            stage_cost[stage] += float(s.get("cost_usd") or 0.0)
            stage_calls[stage] += int(s.get("calls") or 0)
    by_stage = [
        {"stage": st, "cost_usd": round(stage_cost[st], 5), "calls": stage_calls[st]}
        for st in sorted(stage_cost, key=lambda s: -stage_cost[s])
    ]

    n = len(billable)
    return {
        "window_days": days,
        "total_searches": len(rows),
        "cache_hits": cache_hits,
        "cache_hit_rate": round(cache_hits / len(rows), 3),
        "cost_per_search": {
            "p50": round(_percentile(billable, 50), 5),
            "p95": round(_percentile(billable, 95), 5),
            "mean": round(sum(billable) / n, 5) if n else 0.0,
        },
        "total_cost_usd": round(total_cost, 4),
        "daily_burn": daily_burn,
        "by_stage": by_stage,
    }
