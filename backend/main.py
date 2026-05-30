from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fetcher import fetch_papers
from synthesizer import synthesize

app = FastAPI(title="Researca Core OS Engine API")

# Setup CORS policies so your local browser tab at port 3000 can ingest the API data
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SearchRequest(BaseModel):
    query: str
    level: str

@app.post("/search")
async def search(request: SearchRequest):
    # 1. Pull related paper arrays from Semantic Scholar
    papers = fetch_papers(request.query)
    
    # 2. Process our non-streaming budget synthesis block
    synthesis_result = synthesize(request.query, request.level, papers)
    
    # 3. Return standard structured payload that maps directly to your frontend state hooks
    return {
        "synthesis": synthesis_result,
        "papers": papers
    }

@app.get("/")
async def root():
    return {"status": "Researca Backend Engine is active and live"}