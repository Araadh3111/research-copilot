import os
import anthropic
from dotenv import load_dotenv
from fetcher import fetch_papers

load_dotenv()

def synthesize(query, level, papers):
    client = anthropic.Anthropic()

    abstracts_text = ""
    for i, paper in enumerate(papers):
        title = paper.get("title", "No title")
        abstract = paper.get("abstract")
        if not abstract:
            abstract = "No abstract available"
        abstract = abstract[:300]
        citations = paper.get("citationCount", 0)
        year = paper.get("year", "N/A")
        abstracts_text += f"Paper {i+1}: {title} ({year}) - {citations} citations\nAbstract: {abstract}\n\n"

    message = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=600,
        system="You are a concise research mentor. Maximum 500 words. Bullet points only. No filler.",
        messages=[
            {
                "role": "user",
                "content": f"""A {level} student is researching: "{query}"

Here are the top papers:

{abstracts_text}

Your job:
1. Identify the 3 most important papers and explain why
2. Synthesize key findings in plain English
3. Find contradictions
4. Identify research gaps
5. Give 3 actionable next steps

Be direct. No jargon."""
            }
        ]
    )

    return message.content[0].text

if __name__ == "__main__":
    query = input("What do u want to research?: ")
    level = input("Your level (highschool / undergrad / phd): ")
    papers = fetch_papers(query)
    print("\n=== RESEARCA SYNTHESIS ===\n")
    print(synthesize(query, level, papers))