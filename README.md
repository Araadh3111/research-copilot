# Researca

> Literature review, done in 30 seconds.

Built by **Araadh Singh**, age 15 — Chandigarh, India.

**Live:** https://research-copilot-sigma.vercel.app

---

## What it does

- 📚 **Fetches 20+ papers** from Semantic Scholar
- 🎯 **Ranks by actual relevance** using LLM scoring
- ✍️ **Synthesizes findings** with real citations
- 📊 **Comparison Matrix** for side-by-side analysis
- ✅ **Zero hallucinations** — every claim traces back to a source

## Stack

| Layer | Tech |
|-------|------|
| Backend | FastAPI |
| Frontend | Next.js |
| Auth & DB | Supabase |
| LLM | Claude API |
| Hosting | Railway (API) · Vercel (web) |

## How it works

```
Query ──▶ Semantic Scholar ──▶ LLM relevance scoring ──▶ Synthesis + citations ──▶ Comparison Matrix
```

1. **Search** — your question hits Semantic Scholar and pulls a broad set of candidate papers.
2. **Rank** — Claude scores each paper for genuine relevance, not just keyword overlap.
3. **Synthesize** — the top papers are distilled into a cited literature review.
4. **Compare** — the Comparison Matrix lays out methods and findings side by side.

## Local development

### Backend (FastAPI)

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend (Next.js)

```bash
cd frontend
npm install
npm run dev
```

### Environment

Both apps read from `.env` files. You'll need:

- `ANTHROPIC_API_KEY` — Claude API access
- `SUPABASE_URL` / `SUPABASE_KEY` — auth and storage
- `SEMANTIC_SCHOLAR_API_KEY` — optional, raises rate limits

## License

© 2026 Araadh Singh. All rights reserved.
