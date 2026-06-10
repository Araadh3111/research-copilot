# Data sources & full-text policy

_Last audited: 2026-06-10 (Phase 1, Task 1.1)._

This document is the written inventory of every place Researca acquires paper
data, and the policy that keeps full-text acquisition legal.

## Current ingestion (audit result)

The live pipeline fetches **abstracts + metadata only**, via one provider:

| Source | What we fetch | Where | Notes |
|--------|---------------|-------|-------|
| Semantic Scholar Graph API | title, abstract, year, citationCount, authors, `openAccessPdf` URL, `url`, `externalIds`, venue | `backend/fetcher.py` (`S2_FIELDS`) | Metadata + abstracts only. We do **not** download or process the `openAccessPdf` — it is surfaced to the user as a link. |

**Key finding:** synthesis, ranking, and the comparison matrix are built entirely
from **abstracts**. No full-text PDF is ever downloaded or sent to the model, so
there is currently **no paywalled-content exposure**.

## Full-text policy (enforced by `backend/sources.py`)

The moment we ingest full text, it may come **only** from a legal open-access
source. `sources.py` is the single, enforced entry point:

- `classify(paper)` → open-access status from metadata (drives the coverage badge).
- `fetch_full_text(paper)` → the **only** function permitted to download a paper
  body. It refuses any URL whose host is not on the OA whitelist, so a paywalled
  paper can never have its full text fetched, **by construction**. Returns `None`
  on any refusal → caller falls back to abstract + metadata.

### Open-access whitelist

- **arXiv** (OA by default)
- **PubMed Central** — OA subset only
- **bioRxiv / medRxiv**
- **Unpaywall**-resolved OA copies of paywalled DOIs
- **DOAJ** journals
- Any `openAccessPdf` URL surfaced by Semantic Scholar / OpenAlex (already OA)

Anything not resolvable to one of these → **abstract + metadata only**.

## Honest coverage labeling (Task 1.2)

Every paper in results carries a coverage badge derived from `classify()`:

- **Open access** (`full_text`) — an OA full-text copy exists; the user can open
  it in one click. (Today, synthesis still reads the abstract — the badge means
  "full text is available", not "we ingested it".)
- **Abstract only** (`abstract`) — no OA full text located.

The results panel also shows an honest one-line coverage note from
`coverage_note()`, e.g. _"Synthesized from 5 papers (abstracts + metadata) · 3
with open-access full text available."_

## Bring-your-own-PDF (Task 1.3 — planned)

Users will be able to upload PDFs they have legitimate access to. Those are
processed under the user's own access rights, stored privately per-user
(pgvector on Supabase), never shared or used for training, and merged into
retrieval with a "Your library" badge. This is the legal route to covering
paywalled work without Researca ever fetching it.
