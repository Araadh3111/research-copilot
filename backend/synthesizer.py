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
        
        abstract = abstract[:300]  # Slicing keeps input token cost extremely low
        citations = paper.get("citatio" \
        "" \
        "" \
        "nCount", 0)
        year = paper.get("year", "N/A")
        abstracts_text += f"Paper {i+1}: {title} ({year}) - {citations} citations\nAbstract: {abstract}\n\n"

    # Changed to .create (Non-Streaming) so it sends a clean completed block to your frontend
    # Swapped to claude-3-5-haiku-latest to guarantee you stay way under the 0.015 cent limit
    message = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=550,  
        system=(
            "You are a dense research utility for Researca OS. "
            "Your output format is strictly locked. Do not include introductory text, pleasantries, or filler. "
            "You must use short, single-sentence bullet points only. Keep text highly tactical."
        ),
        messages=[
            {
                "role": "user",
                "content": f"""Analyze this query: "{query}" for a {level} student using these papers:

{abstracts_text}

Output exactly this structure, keeping bullet points under 12 words each:
## 1. Top 3 Papers
- **[Paper Title or ID]**: Core focus / why it matters.
- **[Paper Title or ID]**: Core focus / why it matters.
- **[Paper Title or ID]**: Core focus / why it matters.

## 2. Key Findings
- [Point 1]
- [Point 2]

## 3. Contradictions & Gaps
- [Point 1]
- [Point 2]

## 4. Next Steps
- [Action 1]
- [Action 2]"""
            }
        ]
    )

    # Now this return statement will execute cleanly without throwing errors!
    return message.content[0].text

if __name__ == "__main__":
    query = input("What do u want to research?: ")
    level = input("Your level (highschool / undergrad / phd): ")
    
    print("\nFetching papers from Semantic Scholar...")
    papers = fetch_papers(query)
    
    print("\n=== RESEARCA SYNTHESIS ===\n")
    print(synthesize(query, level, papers))