"""Retrieval eval harness (Task 3.2) — the quality compass.

Runs the real retrieval pipeline (query processing → fetch → rank) over the
benchmark queries, scores the top-25 against each query's gold set, and writes
recall@10 / recall@25 / nDCG@10 to evals/runs/. Prints a diff against the most
recent previous run so any pipeline change can be checked for regressions.

Usage (from repo root, with the backend venv):
    ./.venv/Scripts/python.exe evals/run_eval.py

Costs a few cents per run (it calls the live pipeline), so run it deliberately,
not on every save. Needs ANTHROPIC + Semantic Scholar access like a real search.
"""

from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timezone

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
sys.path.insert(0, os.path.join(_ROOT, "backend"))
sys.path.insert(0, _HERE)

from metrics import recall_at_k, ndcg_at_k  # noqa: E402

TOP_K = 25
RECALL_KS = (10, 25)
NDCG_K = 10


def _normalize_title(t: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (t or "").lower()).strip()


def _normalize_arxiv(a: str) -> str:
    """Strip 'arXiv:' prefix and any version suffix → bare id like 2106.09685."""
    s = re.sub(r"(?i)^arxiv:", "", str(a or "").strip())
    return re.sub(r"v\d+$", "", s)


def _paper_keys(paper: dict) -> tuple[str, str, str]:
    ids = paper.get("externalIds") or {}
    arxiv = _normalize_arxiv(ids.get("ArXiv", ""))
    doi = str(ids.get("DOI", "") or "").lower().strip()
    title = _normalize_title(paper.get("title", ""))
    return arxiv, doi, title


def _is_hit(paper: dict, gold: list[dict]) -> bool:
    p_arxiv, p_doi, p_title = _paper_keys(paper)
    for g in gold:
        g_arxiv = _normalize_arxiv(g.get("arxiv", ""))
        if g_arxiv and p_arxiv and g_arxiv == p_arxiv:
            return True
        g_doi = str(g.get("doi", "") or "").lower().strip()
        if g_doi and p_doi and g_doi == p_doi:
            return True
        g_title = _normalize_title(g.get("title", ""))
        if g_title and p_title and (g_title == p_title or g_title in p_title or p_title in g_title):
            return True
    return False


def _retrieve(query: str) -> list[dict]:
    """Run the real pipeline and return the top-TOP_K ranked papers."""
    from query_processor import process_query
    from fetcher import fetch_pool
    from ranker import rank

    processed = process_query(query)
    pool = fetch_pool(processed["cleaned_query"], processed["search_angles"])
    return rank(query, pool, result_count=TOP_K)


def _score_query(entry: dict) -> dict:
    gold = entry.get("gold", [])
    total_relevant = len(gold)
    try:
        retrieved = _retrieve(entry["query"])
    except Exception as e:
        return {"id": entry["id"], "error": f"{type(e).__name__}: {e}",
                "recall@10": 0.0, "recall@25": 0.0, "nDCG@10": 0.0, "gold": total_relevant}

    hits = [_is_hit(p, gold) for p in retrieved]
    return {
        "id": entry["id"],
        "gold": total_relevant,
        "retrieved": len(retrieved),
        "found": sum(hits),
        "recall@10": round(recall_at_k(hits, total_relevant, 10), 4),
        "recall@25": round(recall_at_k(hits, total_relevant, 25), 4),
        "nDCG@10": round(ndcg_at_k(hits, total_relevant, NDCG_K), 4),
    }


def _mean(rows: list[dict], key: str) -> float:
    vals = [r[key] for r in rows if key in r]
    return round(sum(vals) / len(vals), 4) if vals else 0.0


def _previous_run(runs_dir: str, exclude: str) -> dict | None:
    if not os.path.isdir(runs_dir):
        return None
    files = sorted(f for f in os.listdir(runs_dir) if f.endswith(".json") and f != exclude)
    if not files:
        return None
    with open(os.path.join(runs_dir, files[-1]), encoding="utf-8") as fh:
        return json.load(fh)


def main() -> None:
    with open(os.path.join(_HERE, "benchmark.json"), encoding="utf-8") as fh:
        bench = json.load(fh)
    queries = bench.get("queries", [])

    print(f"Running retrieval eval on {len(queries)} queries (top-{TOP_K})…\n")
    rows = []
    for entry in queries:
        r = _score_query(entry)
        rows.append(r)
        flag = f"  ERROR: {r['error']}" if "error" in r else (
            f"  recall@10={r['recall@10']}  recall@25={r['recall@25']}  nDCG@10={r['nDCG@10']}"
            f"  ({r['found']}/{r['gold']})"
        )
        print(f"- {r['id']:<22}{flag}")

    summary = {
        "recall@10": _mean(rows, "recall@10"),
        "recall@25": _mean(rows, "recall@25"),
        "nDCG@10": _mean(rows, "nDCG@10"),
    }
    run = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "queries": len(queries),
        "summary": summary,
        "per_query": rows,
    }

    runs_dir = os.path.join(_HERE, "runs")
    os.makedirs(runs_dir, exist_ok=True)
    fname = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ.json")
    prev = _previous_run(runs_dir, exclude=fname)
    with open(os.path.join(runs_dir, fname), "w", encoding="utf-8") as fh:
        json.dump(run, fh, indent=2)

    print(f"\n== MEAN ==  recall@10={summary['recall@10']}  "
          f"recall@25={summary['recall@25']}  nDCG@10={summary['nDCG@10']}")
    if prev:
        ps = prev.get("summary", {})
        def diff(k):
            d = round(summary[k] - ps.get(k, 0.0), 4)
            return f"{'+' if d >= 0 else ''}{d}"
        print(f"   vs previous: recall@10 {diff('recall@10')}  "
              f"recall@25 {diff('recall@25')}  nDCG@10 {diff('nDCG@10')}")
    print(f"\nWrote evals/runs/{fname}")


if __name__ == "__main__":
    main()
