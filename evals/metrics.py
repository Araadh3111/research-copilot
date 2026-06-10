"""Retrieval quality metrics for the eval harness (Task 3.2).

Pure functions over a ranked list of retrieved papers and a gold set of
known-relevant papers. Kept dependency-free so they can be unit-tested without
touching the network or any model.
"""

from __future__ import annotations

import math


def recall_at_k(retrieved_hits: list[bool], total_relevant: int, k: int) -> float:
    """Fraction of gold papers found in the top-k retrieved results.

    ``retrieved_hits[i]`` is True if the i-th retrieved paper is in the gold set.
    """
    if total_relevant <= 0:
        return 0.0
    found = sum(1 for hit in retrieved_hits[:k] if hit)
    return found / total_relevant


def ndcg_at_k(retrieved_hits: list[bool], total_relevant: int, k: int) -> float:
    """Binary nDCG@k — rewards placing gold papers higher in the ranking.

    DCG uses gain 1 for a gold hit, 0 otherwise; IDCG is the best achievable
    given how many gold papers exist (capped at k).
    """
    dcg = 0.0
    for i, hit in enumerate(retrieved_hits[:k]):
        if hit:
            dcg += 1.0 / math.log2(i + 2)  # position i (0-based) → rank i+1
    ideal_hits = min(total_relevant, k)
    idcg = sum(1.0 / math.log2(i + 2) for i in range(ideal_hits))
    return (dcg / idcg) if idcg > 0 else 0.0
