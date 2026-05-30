from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fetcher import fetch_papers, FetchError
from synthesizer import synthesize, SynthesisError

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
    level: str = "undergrad"


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # Safety net: /search must never return a raw 500. Anything that slips past
    # the explicit handling below comes out as clean JSON with the real reason
    # (which also makes production failures self-diagnosing).
    return JSONResponse(
        status_code=500,
        content={"error": "internal_error", "detail": f"{type(exc).__name__}: {exc}"},
    )


@app.post("/search")
async def search(request: SearchRequest):
    query = (request.query or "").strip()

    # Input validation: reject empty/whitespace queries with a 400, not a crash.
    if not query:
        return JSONResponse(
            status_code=400,
            content={"error": "empty_query", "detail": "Query must not be empty."},
        )

    # 1. Pull related papers from Semantic Scholar.
    try:
        papers = fetch_papers(query)
    except FetchError as e:
        return JSONResponse(
            status_code=502,
            content={"error": "semantic_scholar_unavailable", "detail": str(e)},
        )

    # No results is a valid, non-error outcome.
    if not papers:
        return {
            "synthesis": f'No papers found for "{query}". Try a broader or differently-worded query.',
            "papers": [],
        }

    # 2. Synthesize.
    try:
        synthesis_result = synthesize(query, request.level, papers)
    except SynthesisError as e:
        # Still hand back the papers so the frontend has something to show.
        return JSONResponse(
            status_code=502,
            content={"error": "synthesis_failed", "detail": str(e), "papers": papers},
        )

    # 3. Standard structured payload that maps to the frontend state hooks.
    return {"synthesis": synthesis_result, "papers": papers}


@app.get("/")
async def root():
    return {"status": "Researca Backend Engine is active and live"}


@app.get("/health")
async def health():
    return {"status": "ok"}
