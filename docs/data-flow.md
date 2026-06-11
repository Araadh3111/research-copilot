# Where user data flows (for the privacy policy)

_Last updated: 2026-06-11._

A complete inventory of every place user data travels, what is sent, and why.
Use this to write the privacy policy.

## Sub-processors & destinations

| Destination | What is sent | Why | Notes |
|---|---|---|---|
| **Anthropic (Claude API)** | The user's query; candidate paper **abstracts** and (for library hits) **chunk text**; drafted **claims** + synthesis for the Verify feature | Query cleaning, relevance ranking, synthesis, claim-checking | Sent over the API. Per Anthropic's API terms, inputs/outputs are **not used to train models**. |
| **Semantic Scholar API** | The user's cleaned **query** + generated search angles | Fetch candidate papers (metadata + abstracts) | Only the query text leaves; no account data. |
| **arXiv API** | The user's cleaned **query** (+ category/recency filters) | Fetch recent open-access papers | Only the query text leaves. |
| **Voyage AI (embeddings API)** | Paper **chunk text** and **uploaded PDF text** (as chunks), plus search **query** text | Produce the vector embeddings used for semantic search (`voyage-3.5-lite`) | Text is sent over the API. Per Voyage's terms, inputs are **not used to train models**. |
| **Supabase (Postgres + Auth + Storage)** | Account (email/auth), tier, usage counters, search history, per-search cost logs, **uploaded PDF text → chunks + embeddings** | Auth, quota, history, the BYO-PDF library | Our database of record. Tables listed below. |
| **Railway** | Hosts the backend that processes everything above (parses PDFs, calls the Voyage embeddings API, proxies Anthropic) | Compute | Operational logs may transiently contain a user_id and query string. |
| **Vercel** | Serves the frontend; standard request logs | Web hosting | No application data stored. |

## Embeddings (via Voyage AI)

PDF and paper text is chunked on our Railway backend, then the chunk text is sent to
the **Voyage AI embeddings API** (`voyage-3.5-lite`, 512-dim) to produce vectors.
(Previously embeddings ran locally via `all-MiniLM-L6-v2`, but the torch runtime
OOM'd on Railway, so embedding moved to Voyage's API.) Search query text is likewise
sent to Voyage to embed the query. Per Voyage's terms, API inputs are not used to
train models. The resulting vectors are stored in Supabase (pgvector).

## What we store in Supabase, per user

| Table | Contents | Keyed by |
|---|---|---|
| `auth.users` | Account (email, auth) | `id` |
| `user_profiles` | Plan tier | `id` |
| `user_usage` | Daily search/feature counts, estimated cost | `user_id` |
| `search_history` | Past search queries | `user_id` |
| `search_costs` | Per-search cost/latency logs | `user_id` |
| `library_documents` | Uploaded PDF records (title, filename, pages) | `owner_id` |
| `doc_chunks` | Library text chunks + embeddings (private; `owner_id`) and global paper chunks (`owner_id` NULL) | `owner_id` |
| `shared_results` | Results a user chose to make public via a share link | token only (no user id) |

## BYO-PDF specifics

- Uploads are processed **server-side** (text extracted, chunked, embedded) and
  stored **privately per user** (`doc_chunks.owner_id = the user`).
- Library content is **never shared** with other users and **never used to train
  models** (ours or anyone's). At upload the user confirms they have the right to
  use the document.

## Deletion / right to erasure

- `DELETE /library/{id}` — remove one uploaded document + its chunks.
- `DELETE /library` — remove **all** of the user's uploaded documents + chunks.
- `DELETE /account` — full erasure: library docs/chunks, search history, usage and
  cost rows, profile, **and the auth account**. Irreversible.

(See `backend/account.py` `_USER_TABLES` for the authoritative table list.)
