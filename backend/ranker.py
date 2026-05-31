import json
import anthropic
from fetcher import RESULT_COUNT

MODEL = "claude-haiku-4-5-20251001"
ABSTRACT_WORD_LIMIT = 120

_client = anthropic.Anthropic(timeout=20.0)

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

    # Build the compact paper list sent to the model.
    paper_items = [
        {
            "id": p["paperId"],
            "title": (p.get("title") or "").strip(),
            "abstract": _truncate((p.get("abstract") or "").strip()),
        }
        for p in pool
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
