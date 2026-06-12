import json
import anthropic

import cost_tracker

# Supporting step — always Haiku regardless of tier. Query cleanup and angle
# generation are cheap, mechanical transforms that don't benefit from Sonnet;
# only the user-facing synthesis uses tier-based model selection.
MODEL_HAIKU = "claude-haiku-4-5-20251001"

_client = anthropic.Anthropic(timeout=15.0)

_SYSTEM = (
    "You are a research query optimizer. "
    "Your only job is to output valid JSON — no prose, no markdown fences."
)

_USER_TMPL = """\
Research query: "{query}"

1. Correct any typos and clean the phrasing into a canonical form.
2. Generate 3 distinct search angles for a keyword-matching academic search \
engine (every term must match, so long strings return nothing). Each angle: \
2–5 keywords, no hyphens, no filler words, NOT a repeat of the cleaned query. \
Approach different facets — the core method/term, the broader family or \
problem it belongs to, and key alternatives/extensions. \
Example for "LoRA low-rank adaptation for parameter-efficient fine-tuning": \
["low rank adaptation language models", "parameter efficient fine tuning", \
"adapter tuning quantized LLM"].

Respond with ONLY this JSON shape (no other text):
{{
  "cleaned_query": "...",
  "search_angles": ["angle 1", "angle 2", "angle 3"]
}}"""


_VALIDATE_SYSTEM = (
    "You are a query classifier for an academic research search engine. "
    "Decide whether the user's input is a genuine research topic or question "
    "that academic papers could answer. Greetings, small talk, gibberish, "
    "random characters, profanity, and navigational commands are NOT research. "
    "A short topic phrase (e.g. 'CRISPR gene editing') counts as research. "
    "When genuinely unsure, lean towards research. "
    'Reply with ONLY this JSON, nothing else: {"is_research": true} or {"is_research": false}.'
)


def validate_query(raw_query: str) -> bool:
    """Return True if the query looks like a genuine research question.

    Uses Haiku for a fast, cheap classification. Fails OPEN (returns True) on any
    error so a model/parse hiccup never blocks a legitimate search.
    """
    try:
        msg = _client.messages.create(
            model=MODEL_HAIKU,
            max_tokens=16,
            temperature=0,
            system=_VALIDATE_SYSTEM,
            messages=[{"role": "user", "content": f'Input: "{raw_query}"'}],
        )
        cost_tracker.record_usage("query_validate", MODEL_HAIKU, msg.usage)
        text = msg.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        return bool(json.loads(text).get("is_research", True))
    except Exception:
        return True


def process_query(raw_query: str, tier: str = "free") -> dict:
    """Return {cleaned_query, search_angles}.

    Falls back to the original query on any failure so the pipeline never
    breaks because of this step.
    """
    try:
        msg = _client.messages.create(
            model=MODEL_HAIKU,
            max_tokens=256,
            temperature=0.3,
            system=_SYSTEM,
            messages=[{"role": "user", "content": _USER_TMPL.format(query=raw_query)}],
        )
        cost_tracker.record_usage("query_process", MODEL_HAIKU, msg.usage)
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
