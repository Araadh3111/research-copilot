import requests
from dotenv import load_dotenv
import os


load_dotenv()

API_KEY = os.getenv("SEMANTIC_SCHOLAR_API_KEY")

def fetch_papers(query, limit=10):
    url = "https://api.semanticscholar.org/graph/v1/paper/search"
    params = {
        "query": query,
        "limit": limit,
        "fields": "title,abstract,year,citationCount",
    }
    
    headers = {}
    if API_KEY:
        headers["x-api-key"] = API_KEY
    
    response = requests.get(url, params=params, headers=headers)
    result = response.json()
    
    # FIX: These lines must be indented inside the function!
    if "data" not in result:
        print(f"API Error: {result}")
        return []
    
    data = result["data"]

    def score_paper(paper):
        citations = paper.get("citationCount") or 0
        year = paper.get("year") or 2000
        recency = (year - 2000) * 10
        return citations + recency

    ranked = sorted(data, key=score_paper, reverse=True)
    return ranked

if __name__ == "__main__":
    query = input("Enter what do u wna explore today: ")
    papers = fetch_papers(query)
    for i, paper in enumerate(papers):
        print(f"{i+1}. {paper['title']} ({paper.get('year', 'N/A')}) — {paper.get('citationCount', 0)} citations")