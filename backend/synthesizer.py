import os
from typing import AsyncGenerator
import anthropic
from dotenv import load_dotenv
from fetcher import fetch_papers

load_dotenv()

# Sonnet, not Haiku: at current (free-tier) volume the quality gain is worth
# more than the marginal cost. Valid current model ID.
MODEL = "claude-sonnet-4-5"


class SynthesisError(Exception):
    """The Anthropic call failed (auth, rate limit, timeout, connection, etc.).

    Raised so the API layer returns a clean JSON error with the underlying
    reason instead of a raw 500.
    """


def _paper_link(paper):
    """Best available link for a paper: open-access PDF > S2 page > DOI."""
    pdf = (paper.get("openAccessPdf") or {}).get("url")
    if pdf:
        return pdf
    if paper.get("url"):
        return paper["url"]
    doi = (paper.get("externalIds") or {}).get("DOI")
    if doi:
        return f"https://doi.org/{doi}"
    paper_id = paper.get("paperId")
    if paper_id:
        return f"https://www.semanticscholar.org/paper/{paper_id}"
    return ""


def _build_sources(papers, top=5):
    """Deterministic, correctly-linked sources list.

    Built in code (not by the model) so titles and URLs are always accurate.
    """
    lines = []
    for paper in papers[:top]:
        title = paper.get("title", "Untitled")
        year = paper.get("year", "N/A")
        citations = paper.get("citationCount", 0)
        link = _paper_link(paper)
        if link:
            lines.append(f"- [{title}]({link}) — {year}, {citations} citations")
        else:
            lines.append(f"- {title} — {year}, {citations} citations")
    return "\n".join(lines)


def _build_prompt(query: str, level: str, papers: list) -> tuple[str, str]:
    """Return (system_prompt, user_prompt) shared by both sync and stream paths."""
    abstracts_text = ""
    for i, paper in enumerate(papers):
        title = paper.get("title", "No title")
        abstract = (paper.get("abstract") or "No abstract available")[:1500]
        citations = paper.get("citationCount", 0)
        year = paper.get("year", "N/A")
        abstracts_text += (
            f"Paper {i+1}: {title} ({year}) - {citations} citations\n"
            f"Abstract: {abstract}\n\n"
        )

    system = (
        "You are a research synthesis engine for Researca OS. "
        "You analyze academic paper abstracts and produce a tight, useful "
        "literature briefing. Be specific and tactical: cite papers by their "
        "title when making a claim. No pleasantries, no filler, no preamble. "
        "Adapt depth and vocabulary to the reader's level."
    )

    user = f"""Level guide:
- beginner (High School): define all terms, lead with the big idea before details, use analogies
- intermediate (Undergrad): assume basic domain familiarity, focus on methodology and findings
- advanced (Grad): balance theory and application, surface trade-offs and limitations
- expert (PhD): assume full domain knowledge, focus on gaps, tensions, and open implications

Reader level: {level}
Research question: "{query}"

Synthesize the following papers. Reference papers by title when you make a claim.

{abstracts_text}

Produce exactly this Markdown structure (omit the Sources section — it is appended separately):

## Key Findings
- 4-6 bullets capturing the most important, concrete findings across the papers. Each bullet should name the paper(s) it draws from.

## Where the Papers Agree
- 2-4 bullets on points of consensus across multiple papers.

## Where They Disagree / Open Gaps
- 2-4 bullets on contradictions, methodological disagreements, or unanswered questions.

## Recommended Next Steps
- 2-3 concrete, actionable next steps for a {level} reader (which papers to read first and why).

Keep bullets concise but specific — 20-35 words. Never sacrifice a concrete finding for brevity."""

    return system, user


async def synthesize_stream(
    query: str, level: str, papers: list
) -> AsyncGenerator[str, None]:
    """Async generator yielding synthesis text chunks as they arrive from the model.

    Appends the sources block after the stream completes so it appears at the end.
    Raises SynthesisError on API failure so the caller can emit an SSE error event.
    """
    if not papers:
        yield f'No papers were found for "{query}". Try a broader or differently-worded query.'
        return

    system, user = _build_prompt(query, level, papers)
    client = anthropic.AsyncAnthropic(timeout=30.0)

    try:
        async with client.messages.stream(
            model=MODEL,
            max_tokens=1500,
            system=system,
            messages=[{"role": "user", "content": user}],
        ) as stream:
            async for text in stream.text_stream:
                yield text
    except anthropic.APIError as e:
        raise SynthesisError(f"Anthropic API error: {type(e).__name__}: {e}") from e
    except Exception as e:
        raise SynthesisError(f"Synthesis failed: {type(e).__name__}: {e}") from e

    sources = _build_sources(papers)
    yield f"\n\n## Sources\n{sources}"


def synthesize(query: str, level: str, papers: list) -> str:
    """Blocking synthesis used by the __main__ runner only."""
    if not papers:
        return (
            f'No papers were found for "{query}". '
            "Try a broader or differently-worded query."
        )

    system, user = _build_prompt(query, level, papers)
    client = anthropic.Anthropic(timeout=30.0)

    try:
        message = client.messages.create(
            model=MODEL,
            max_tokens=1500,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
    except anthropic.APIError as e:
        raise SynthesisError(f"Anthropic API error: {type(e).__name__}: {e}") from e
    except Exception as e:
        raise SynthesisError(f"Synthesis failed: {type(e).__name__}: {e}") from e

    body = message.content[0].text
    sources = _build_sources(papers)
    return f"{body}\n\n## Sources\n{sources}"


if __name__ == "__main__":
    query = input("What do u want to research?: ")
    level = input("Your level (highschool / undergrad / phd): ")

    print("\nFetching papers from Semantic Scholar...")
    papers = fetch_papers(query)

    print("\n=== RESEARCA SYNTHESIS ===\n")
    print(synthesize(query, level, papers))
