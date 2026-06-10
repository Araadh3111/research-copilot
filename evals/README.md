# Retrieval eval harness (Task 3.2)

The quality compass: an objective answer to "did this change make retrieval
better or worse?" Run it before and after any pipeline change (query processing,
ranking, fetching, a new source) to guard against regressions.

## Run

```bash
# from repo root, using the backend venv
./.venv/Scripts/python.exe evals/run_eval.py
```

It runs the **real** pipeline (query processing → fetch → rank) for each
benchmark query, so it costs a few cents and needs Anthropic + Semantic Scholar
access. Run it deliberately, not on every save.

## What it reports

For each query and as a mean across all of them:

- **recall@10 / recall@25** — fraction of gold (known-relevant) papers found in
  the top 10 / 25 retrieved.
- **nDCG@10** — rewards ranking gold papers higher.

Each run is saved to `evals/runs/<timestamp>.json`, and the script prints a diff
against the previous run.

## The benchmark

`benchmark.json` maps each query to a gold set of known-relevant papers
(identified by arXiv id, with title as a fallback match key). It ships with **6
seed ML queries** using landmark papers; expand toward 30–50 by mining the
reference lists of survey papers in your target subfields.

## CI

Wire `evals/run_eval.py` into CI on a schedule (not every commit, to control
cost) and fail the job if mean recall@10 drops more than a small threshold vs the
committed baseline in `evals/runs/`.
