"""One-off deep-dive: where exactly does the LoRA gold set die in the pipeline?"""

from __future__ import annotations

import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
sys.path.insert(0, os.path.join(_ROOT, "backend"))
sys.path.insert(0, _HERE)
os.chdir(os.path.join(_ROOT, "backend"))

from run_eval import _is_hit  # noqa: E402

QUERY = "LoRA low-rank adaptation for parameter-efficient fine-tuning of large language models"
GOLD = [
    {"arxiv": "2106.09685", "title": "LoRA: Low-Rank Adaptation of Large Language Models"},
    {"arxiv": "2305.14314", "title": "QLoRA: Efficient Finetuning of Quantized LLMs"},
    {"arxiv": "2303.10512", "title": "AdaLoRA: Adaptive Budget Allocation for Parameter-Efficient Fine-Tuning"},
    {"arxiv": "2101.00190", "title": "Prefix-Tuning: Optimizing Continuous Prompts for Generation"},
]


def main() -> None:
    from query_processor import process_query
    from fetcher import fetch_pool
    import ranker

    processed = process_query(QUERY)
    print("cleaned:", processed["cleaned_query"])
    print("angles :", processed["search_angles"])

    pool = fetch_pool(processed["cleaned_query"], processed["search_angles"])
    print(f"\npool = {len(pool)}")

    prefiltered = ranker._prefilter(QUERY, pool, ranker.LLM_RANK_LIMIT)
    pre_ids = {p.get("paperId") for p in prefiltered}

    ranked = ranker.rank(QUERY, pool, result_count=25)

    for g in gold_iter():
        in_pool = next((p for p in pool if _is_hit(p, [g])), None)
        if in_pool is None:
            print(f"NOT IN POOL            | {g['title'][:60]}")
            continue
        in_pre = in_pool.get("paperId") in pre_ids
        pos = next((i + 1 for i, p in enumerate(ranked) if _is_hit(p, [g])), None)
        print(
            f"pool=Y src={in_pool.get('source', 's2'):<6} cites={in_pool.get('citationCount')} "
            f"prefilter={'Y' if in_pre else 'CUT'} rank={pos} | {g['title'][:55]}"
        )


def gold_iter():
    return GOLD


if __name__ == "__main__":
    main()
