import json
import os
import re
import anthropic
from fetcher import RESULT_COUNT

import cost_tracker

MODEL = "claude-haiku-4-5-20251001"

# Ranking is the cheap stage by design, but it was scoring the WHOLE deduplicated
# pool (cleaned query + every angle, ~100-200 abstracts) in one call — so its
# input dwarfed synthesis and it became the most expensive stage. We now do a
# free lexical pre-filter to the top LLM_RANK_LIMIT candidates and send only short
# abstracts to Haiku. Both are env-tunable.
LLM_RANK_LIMIT = int(os.getenv("LLM_RANK_LIMIT", "15"))
ABSTRACT_WORD_LIMIT = int(os.getenv("RANK_ABSTRACT_WORD_LIMIT", "50"))

# Use the cached paper-embedding semantic pre-filter (Task 2.2) instead of the
# lexical one. OFF by default — turn on only after validating no regression with
# evals/run_eval.py, since it changes which candidates reach the LLM ranker.
SEMANTIC_PREFILTER = os.getenv("SEMANTIC_PREFILTER", "false").lower() == "true"

_client = anthropic.Anthropic(timeout=20.0)

_STOPWORDS = {
    "the", "a", "an", "and", "or", "of", "for", "to", "in", "on", "with", "by",
    "is", "are", "be", "how", "what", "study", "using", "based", "via",
}


def _tokenize(text: str) -> set:
    return {w for w in re.findall(r"[a-z0-9]+", text.lower()) if w not in _STOPWORDS and len(w) > 2}


def _prefilter(query: str, pool: list, limit: int) -> list:
    """Cheaply trim the pool to the `limit` most query-relevant papers (no LLM).

    Scores each paper by query-term overlap in title+abstract, with citation
    count as a tiebreaker. Keeps the LLM ranker's input small without dropping
    likely-relevant papers. Returns the whole pool unchanged when it already fits.
    """
    if len(pool) <= limit:
        return pool

    # Semantic pre-filter (cached embeddings) when enabled; lexical fallback below.
    if SEMANTIC_PREFILTER:
        try:
            import paper_cache
            chosen = paper_cache.semantic_prefilter(query, pool, limit)
            if chosen:
                return chosen
        except Exception as e:
            print(f"[rank] semantic prefilter fell back to lexical: {type(e).__name__}: {e}", flush=True)

    qterms = _tokenize(query)
    if not qterms:
        return sorted(pool, key=lambda p: p.get("citationCount") or 0, reverse=True)[:limit]

    def score(paper):
        terms = _tokenize((paper.get("title") or "") + " " + (paper.get("abstract") or ""))
        return (len(qterms & terms), paper.get("citationCount") or 0)

    return sorted(pool, key=score, reverse=True)[:limit]

_SYSTEM = "You are a relevance scorer. Output only JSON — no prose, no explanation."

_USER_TMPL = """\
Research query: "{query}"

Score each paper 0–10 on how directly its abstract addresses this exact query.
Base the score solely on abstract content — ignore citation count and year entirely.

  10 = abstract is precisely about this query
   7 = substantially covers it
   4 = loosely related
   0 = off-topic

Papers:
{papers_json}

Respond with ONLY this JSON (no other text):
{{"scores": {{"<id>": <score>, ...}}}}"""


def _truncate(text: str, word_limit: int = ABSTRACT_WORD_LIMIT) -> str:
    words = text.split()
    return " ".join(words[:word_limit]) if len(words) > word_limit else text


def rank(original_query: str, pool: list, result_count: int = RESULT_COUNT) -> list:
    """Score all papers in `pool` with a single Haiku call; return top `result_count`.

    Falls back to citation-count order if the LLM call fails, so the pipeline
    never returns an empty result because of this step.
    """
    if not pool:
        return []

    # Only LLM-score the most query-relevant candidates — keeps Haiku input small.
    candidates = _prefilter(original_query, pool, LLM_RANK_LIMIT)

    # Build the compact paper list sent to the model.
    paper_items = [
        {
            "id": p["paperId"],
            "title": (p.get("title") or "").strip(),
            "abstract": _truncate((p.get("abstract") or "").strip()),
        }
        for p in candidates
        if p.get("paperId")
    ]

    try:
        msg = _client.messages.create(
            model=MODEL,
            max_tokens=512,
            temperature=0.4,
            system=_SYSTEM,
            messages=[
                {
                    "role": "user",
                    "content": _USER_TMPL.format(
                        query=original_query,
                        papers_json=json.dumps(paper_items, ensure_ascii=False),
                    ),
                }
            ],
        )
        cost_tracker.record_usage("rank", MODEL, msg.usage)
        text = msg.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        scores: dict = json.loads(text).get("scores", {})
    except Exception:
        scores = {}

    # Map paperId -> paper for fast lookup.
    by_id = {p["paperId"]: p for p in pool if p.get("paperId")}

    def sort_key(paper):
        pid = paper.get("paperId", "")
        relevance = float(scores.get(pid, -1))
        # Use citationCount only as a tiebreaker when scores are equal.
        citations = paper.get("citationCount") or 0
        return (relevance, citations)

    ranked = sorted(by_id.values(), key=sort_key, reverse=True)
    return ranked[:result_count]
