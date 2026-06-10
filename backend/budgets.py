"""Per-stage token budgets for the two-stage pipeline (Task 2.3).

The pipeline is already two-stage by model:
  Stage A (Haiku, cheap/fast): query validation, query expansion, re-ranking.
  Stage B (Sonnet, capable):   final cross-paper synthesis ONLY.

This module makes Stage B's input cost bounded and configurable. Synthesis is
the single most expensive call, so we cap how much paper text it sees: include
top papers until the estimated input-token budget is hit, then stop (graceful
degradation = fewer papers, never a failure). All knobs are env-overridable so
budgets can be tuned from cost data (see /admin/costs) without a code change.
"""

import os

# Rough chars-per-token for English prose — good enough for budgeting (real
# accounting uses the measured token counts in cost_tracker).
CHARS_PER_TOKEN = 4

# Hard input-token budgets for the Stage-B (Sonnet) call, per output mode.
SYNTHESIS_MAX_INPUT_TOKENS = int(os.getenv("SYNTHESIS_MAX_INPUT_TOKENS", "6000"))
MATRIX_MAX_INPUT_TOKENS = int(os.getenv("MATRIX_MAX_INPUT_TOKENS", "5000"))

# Per-paper abstract cap (characters) before budgeting trims the paper set.
ABSTRACT_CHAR_CAP = int(os.getenv("ABSTRACT_CHAR_CAP", "1500"))

# Never synthesize from fewer than this many papers, even if over budget — one
# strong paper still beats failing the request.
MIN_PAPERS = int(os.getenv("SYNTHESIS_MIN_PAPERS", "1"))


def estimate_tokens(text: str) -> int:
    return max(0, len(text) // CHARS_PER_TOKEN)


def select_within_budget(papers: list, base_text: str, max_input_tokens: int) -> tuple[list, int]:
    """Return (papers_to_send, estimated_input_tokens) fitting the input budget.

    ``base_text`` is the fixed prompt scaffolding (system + instructions) whose
    tokens count against the budget. Papers are added in rank order until the
    next paper would blow the budget; at least MIN_PAPERS are always included.
    """
    used = estimate_tokens(base_text)
    chosen: list = []
    for paper in papers:
        abstract = (paper.get("abstract") or "")[:ABSTRACT_CHAR_CAP]
        title = paper.get("title") or ""
        cost = estimate_tokens(title) + estimate_tokens(abstract) + 24  # +scaffolding per paper
        if chosen and used + cost > max_input_tokens:
            break
        chosen.append(paper)
        used += cost
    if not chosen and papers:
        chosen = papers[:MIN_PAPERS]
        used = estimate_tokens(base_text) + sum(
            estimate_tokens((p.get("abstract") or "")[:ABSTRACT_CHAR_CAP]) for p in chosen
        )
    return chosen, used
