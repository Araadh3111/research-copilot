import json
import os
import anthropic

FORCE_SONNET = os.getenv("FORCE_SONNET", "true").lower() == "true"
MODEL_HAIKU = "claude-haiku-4-5-20251001"
MODEL_SONNET = "claude-sonnet-4-5"


def _select_model(tier: str) -> str:
    if FORCE_SONNET:
        return MODEL_SONNET
    return MODEL_SONNET if tier in ("pro", "lab") else MODEL_HAIKU


_client = anthropic.Anthropic(timeout=15.0)

_SYSTEM = (
    "You are a research query optimizer. "
    "Your only job is to output valid JSON — no prose, no markdown fences."
)

_USER_TMPL = """\
Research query: "{query}"

1. Correct any typos and clean the phrasing into a canonical form.
2. Generate 2–3 distinct search angles that approach the same research topic \
from different facets (e.g. mechanisms, applications, comparisons, clinical \
outcomes, historical development). Each angle should be a short search string, \
not a sentence.

Respond with ONLY this JSON shape (no other text):
{{
  "cleaned_query": "...",
  "search_angles": ["angle 1", "angle 2", "angle 3"]
}}"""


def process_query(raw_query: str, tier: str = "free") -> dict:
    """Return {cleaned_query, search_angles}.

    Falls back to the original query on any failure so the pipeline never
    breaks because of this step.
    """
    try:
        msg = _client.messages.create(
            model=_select_model(tier),
            max_tokens=256,
            temperature=0.3,
            system=_SYSTEM,
            messages=[{"role": "user", "content": _USER_TMPL.format(query=raw_query)}],
        )
        text = msg.content[0].text.strip()
        # Strip accidental markdown fences if the model adds them.
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        result = json.loads(text)
        cleaned = str(result.get("cleaned_query") or raw_query).strip() or raw_query
        angles = [str(a).strip() for a in result.get("search_angles", []) if str(a).strip()]
        return {
            "cleaned_query": cleaned,
            "search_angles": angles or [cleaned],
        }
    except Exception:
        return {"cleaned_query": raw_query, "search_angles": [raw_query]}


if __name__ == "__main__":
    q = input("Raw query: ")
    print(process_query(q))
