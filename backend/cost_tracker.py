"""Per-request LLM cost tracking (Task 2.1).

Every Anthropic call in the pipeline reports its real token usage here via
``record_usage``. main.py calls ``start()`` at the top of a search request and
``summary()`` at the end to get the true USD cost broken down by pipeline stage,
which it writes to the ``search_costs`` table.

The accumulator lives in a ``ContextVar`` holding a mutable list. ``asyncio.to_thread``
copies the context, so the list reference is shared into worker threads — appends
made by ``process_query`` / ``rank`` (run via to_thread) are visible back in the
request task. Each request task gets its own list (set by ``start()``), so
concurrent requests never cross-contaminate.

If tracking was never started (e.g. a call path outside a request), every record
call is a silent no-op, so importing this module can never break a code path.
"""

from __future__ import annotations

import contextvars
from dataclasses import dataclass

# ── Anthropic pricing, USD per 1,000,000 tokens ──────────────────────────────
# Keep in sync with current Anthropic pricing. Used to convert real token counts
# into a dollar cost per call. Unknown models fall back to Sonnet-tier pricing so
# cost is over- rather than under-estimated.
MODEL_PRICING: dict[str, dict[str, float]] = {
    "claude-haiku-4-5-20251001": {"input": 1.00, "output": 5.00},
    "claude-sonnet-4-5":         {"input": 3.00, "output": 15.00},
    "claude-opus-4-8":           {"input": 5.00, "output": 25.00},
}
_DEFAULT_PRICING = {"input": 3.00, "output": 15.00}


@dataclass
class CallRecord:
    stage: str
    model: str
    input_tokens: int
    output_tokens: int
    cost_usd: float


_calls: contextvars.ContextVar[list | None] = contextvars.ContextVar("cost_calls", default=None)


def start() -> None:
    """Begin tracking for the current request. Resets the per-request accumulator."""
    _calls.set([])


def _price(model: str) -> dict[str, float]:
    return MODEL_PRICING.get(model, _DEFAULT_PRICING)


def call_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    p = _price(model)
    return (input_tokens / 1_000_000) * p["input"] + (output_tokens / 1_000_000) * p["output"]


def record(stage: str, model: str, input_tokens: int, output_tokens: int) -> float:
    """Record one model call's token usage. No-op (returns 0.0) if not tracking."""
    calls = _calls.get()
    cost = call_cost(model, int(input_tokens or 0), int(output_tokens or 0))
    if calls is None:
        return cost
    calls.append(CallRecord(stage, model, int(input_tokens or 0), int(output_tokens or 0), cost))
    return cost


def record_usage(stage: str, model: str, usage) -> float:
    """Record from an Anthropic ``message.usage`` object (has input/output_tokens)."""
    if usage is None:
        return 0.0
    return record(
        stage, model,
        getattr(usage, "input_tokens", 0) or 0,
        getattr(usage, "output_tokens", 0) or 0,
    )


def collect() -> list[CallRecord]:
    return list(_calls.get() or [])


def summary() -> dict:
    """Aggregate the request's calls: total cost, tokens, models, and per-stage breakdown."""
    calls = collect()
    by_stage: dict[str, dict] = {}
    for c in calls:
        s = by_stage.setdefault(
            c.stage, {"cost_usd": 0.0, "input_tokens": 0, "output_tokens": 0, "calls": 0}
        )
        s["cost_usd"] += c.cost_usd
        s["input_tokens"] += c.input_tokens
        s["output_tokens"] += c.output_tokens
        s["calls"] += 1
    return {
        "total_cost_usd": round(sum(c.cost_usd for c in calls), 6),
        "input_tokens": sum(c.input_tokens for c in calls),
        "output_tokens": sum(c.output_tokens for c in calls),
        "models": sorted({c.model for c in calls}),
        "by_stage": by_stage,
        "call_count": len(calls),
    }
