import anthropic
from dotenv import load_dotenv
import os
from fetcher import fetch_papers

load_dotenv()

def synthesize(query, level, papers):
    client = anthropic.Anthropic()
    
    abstracts_text = ""
    for i, paper in enumerate(papers):
        title = paper.get("title", "No title")
        abstract = paper.get("abstract")
        if not abstract:
            continue
        
        # Slicing the abstract to 300 chars to save tokens
        abstract = abstract[:300] 
        citations = paper.get("citationCount", 0)
        year = paper.get("year", "N/A")
        
        abstracts_text += f"Paper {i+1}: {title} ({year}) - {citations} citations\nAbstract: {abstract}\n\n"

    # Changed from .create to .stream so your FastAPI server can yield tokens live!
    with client.messages.stream(
        model="claude-sonnet-4-5",
        max_tokens=2000,
        messages=[
            {
                "role": "user",
                "content": f"""You are a world-class research mentor and part of Researca - a research OS.

A {level} student is researching: "{query}"

Here are the top papers:

{abstracts_text}

Your job:
1. Identify the 3 most important papers and explain why
2. Synthesize key findings in plain English for a {level} student
3. Find contradictions between papers
4. Identify research gaps
5. Give 3 actionable next steps

Be direct. No jargon without explanation."""
            }
        ]
    ) as stream:
        for text in stream.text_stream:
            yield text  # This feeds the text tokens directly to your FastAPI event_generator!


if __name__ == "__main__":
    query = input("What do u want to research?: ")
    level = input("Your level (highschool / undergrad / phd): ")
    
    print("\nFetching papers from Semantic Scholar...")
    papers = fetch_papers(query)
    
    print("\n=== RESEARCA SYNTHESIS ===\n")
    # For local terminal execution, we loop through the generator to print it out live
    for token in synthesize(query, level, papers):
        print(token, end="", flush=True)
    print("\n")