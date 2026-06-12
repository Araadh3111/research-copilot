"""Diagnose WHERE retrieval loses gold papers: the fetch pool or the rank step.

For each benchmark query, fetches the raw pool (no LLM rank) and reports which
gold papers are present in the pool at all, then which survive ranking into the
top-25. Pool-misses are a fetch/source problem; pool-hits that vanish from the
top-25 are a ranking problem. Costs a few cents (rank step calls the LLM).

Usage (from repo root): ./.venv/Scripts/python.exe evals/diagnose_pool.py
"""

from __future__ import annotations

import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
sys.path.insert(0, os.path.join(_ROOT, "backend"))
sys.path.insert(0, _HERE)

os.chdir(os.path.join(_ROOT, "backend"))  # so load_dotenv() finds backend/.env

from run_eval import _is_hit, _normalize_arxiv, _normalize_title, _paper_keys  # noqa: E402


def main() -> None:
    from query_processor import process_query
    from fetcher import fetch_pool
    from ranker import rank

    with open(os.path.join(_HERE, "benchmark.json"), encoding="utf-8") as fh:
        bench = json.load(fh)

    for entry in bench["queries"]:
        query, gold = entry["query"], entry["gold"]
        processed = process_query(query)
        pool = fetch_pool(processed["cleaned_query"], processed["search_angles"])
        ranked = rank(query, pool, result_count=25)

        print(f"\n=== {entry['id']}  (pool={len(pool)}, ranked={len(ranked)}) ===")
        for g in gold:
            in_pool = any(_is_hit(p, [g]) for p in pool)
            rank_pos = next((i + 1 for i, p in enumerate(ranked) if _is_hit(p, [g])), None)
            status = (
                f"rank #{rank_pos}" if rank_pos
                else ("IN POOL, lost at rank" if in_pool else "NOT IN POOL")
            )
            print(f"  [{status:>22}]  {g['title'][:70]}")


if __name__ == "__main__":
    main()
