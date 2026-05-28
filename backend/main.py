from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fetcher import fetch_papers
from synthesizer import synthesize

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods =["*"],
    allow_headers = ["*"]
)


class SearchRequest(BaseModel):
    query: str
    level: str

@app.post("/search")    
async def search(request: SearchRequest):
    papers = fetch_papers(request.query)
    result = synthesize(request.query, request.level, papers)
    return {"synthesis": result, "papers":papers}


@app.get("/")
async def root():
    return {"status": "Researca API is live"}