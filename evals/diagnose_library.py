"""Trace why an uploaded library PDF does not surface in /search results.

Creates a disposable user, uploads the LoRA PDF to prod, then probes each stage:
  A. Are chunks stored with the right owner_id / source_type / dim?
  B. Does match_doc_chunks (owner-filtered) return those rows for a self-match
     query embedding (a stored chunk's OWN vector) — i.e. is the RPC + owner
     filter correct, independent of any query-embedding step?
  C. What does prod /search actually return (titles + sources), and does the
     library paper appear at all?

Service-key probes run locally (no Gemini key needed). Run from repo root:
    ./.venv/Scripts/python.exe evals/diagnose_library.py
"""

from __future__ import annotations

import json
import os
import sys
import uuid

import requests
from dotenv import dotenv_values

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
sys.path.insert(0, os.path.join(_ROOT, "backend"))

BACKEND_ENV = dotenv_values(os.path.join(_ROOT, "backend", ".env"))
FRONTEND_ENV = dotenv_values(os.path.join(_ROOT, "frontend", ".env.local"))

SUPABASE_URL = (BACKEND_ENV.get("SUPABASE_URL") or "").rstrip("/")
SERVICE_KEY = BACKEND_ENV["SUPABASE_SERVICE_ROLE_KEY"]
ANON_KEY = FRONTEND_ENV["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
API = (FRONTEND_ENV.get("NEXT_PUBLIC_API_URL") or "").rstrip("/")

# Point the local supabase client at the same project for the RPC probes.
os.environ["SUPABASE_URL"] = SUPABASE_URL
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = SERVICE_KEY
from supabase_client import sb  # noqa: E402

PDF_URL = "https://arxiv.org/pdf/2106.09685"
SEARCH_QUERY = "LoRA low rank adaptation rank choice for attention weight matrices"


def main() -> int:
    email = f"diag-{uuid.uuid4().hex[:10]}@researca-test.dev"
    password = uuid.uuid4().hex + "Aa1!"
    admin_h = {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}

    print(f"1. creating test user {email}")
    r = requests.post(f"{SUPABASE_URL}/auth/v1/admin/users", headers=admin_h, json={
        "email": email, "password": password, "email_confirm": True,
    }, timeout=30)
    r.raise_for_status()
    user_id = r.json()["id"]

    try:
        r = requests.post(
            f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
            headers={"apikey": ANON_KEY},
            json={"email": email, "password": password}, timeout=30,
        )
        r.raise_for_status()
        jwt = r.json()["access_token"]
        auth_h = {"Authorization": f"Bearer {jwt}"}

        print("2. uploading PDF to prod /library/upload")
        pdf = requests.get(PDF_URL, timeout=60).content
        r = requests.post(
            f"{API}/library/upload", headers=auth_h,
            files={"file": ("lora.pdf", pdf, "application/pdf")}, timeout=300,
        )
        print(f"   status={r.status_code} body={r.text[:200]}")
        if r.status_code != 200 or not r.json().get("chunk_count"):
            return 1

        # ── A. inspect stored chunks ──────────────────────────────────────────
        print("\nA. stored doc_chunks for this owner:")
        rows = (
            sb.table("doc_chunks")
            .select("id, owner_id, source_type, doc_id, chunk_index, metadata, embedding")
            .eq("owner_id", user_id).limit(3).execute().data
        )
        total = (
            sb.table("doc_chunks").select("id", count="exact")
            .eq("owner_id", user_id).execute().count
        )
        print(f"   total rows: {total}")
        if not rows:
            print("   FAIL: no chunks stored under this owner_id")
            return 1
        sample = rows[0]
        emb = sample["embedding"]
        if isinstance(emb, str):
            emb_list = json.loads(emb)
        else:
            emb_list = emb
        print(f"   sample: source_type={sample['source_type']!r} "
              f"dim={len(emb_list)} metadata={sample['metadata']}")

        # ── B. RPC self-match (owner-filtered) ────────────────────────────────
        print("\nB. match_doc_chunks self-match (RPC + owner filter):")
        qv = "[" + ",".join(repr(float(x)) for x in emb_list) + "]"
        for label, fo, fs, mc in [
            ("owner+src mc=5", user_id, "library", 5),
            ("owner mc=15", user_id, None, 15),
            ("no filt mc=50", None, None, 50),
        ]:
            res = sb.rpc("match_doc_chunks", {
                "query_embedding": qv, "match_count": mc,
                "filter_source": fs, "filter_owner": fo,
            }).execute()
            hits = res.data or []
            mine = [h for h in hits if h.get("owner_id") == user_id]
            top_sim = round(hits[0]["similarity"], 4) if hits else None
            print(f"   {label:<15} -> {len(hits)} hits (want up to {mc}), "
                  f"{len(mine)} mine, top_sim={top_sim}")
        print("   (87 rows stored; if a big match_count still returns ~1, the "
              "ivfflat index / probes=1 is the culprit, not the filter)")

        # ── C. what prod /search returns ──────────────────────────────────────
        print(f"\nC. prod /search {SEARCH_QUERY!r}")
        r = requests.post(
            f"{API}/search", headers=auth_h | {"Accept": "text/event-stream"},
            json={"query": SEARCH_QUERY}, stream=True, timeout=300,
        )
        papers = []
        for line in r.iter_lines(decode_unicode=True):
            if line and line.startswith("data:"):
                try:
                    evt = json.loads(line[5:].strip())
                except ValueError:
                    continue
                if evt.get("type") == "papers":
                    papers = evt.get("papers", [])
                elif evt.get("type") == "error":
                    print(f"   pipeline error: {evt.get('detail')}")
        print(f"   {len(papers)} final sources:")
        for i, p in enumerate(papers, 1):
            print(f"     {i}. [{p.get('source','public')}] {(p.get('title') or '')[:70]}")
        lib = [i for i, p in enumerate(papers, 1) if p.get("source") == "library"]
        print(f"   library positions: {lib or 'NONE — dropped before/at rank'}")
        return 0
    finally:
        print("\ncleanup: deleting test user + data")
        requests.delete(f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
                        headers=admin_h, timeout=30)
        for table, col in (("doc_chunks", "owner_id"), ("library_documents", "owner_id")):
            requests.delete(f"{SUPABASE_URL}/rest/v1/{table}?{col}=eq.{user_id}",
                            headers=admin_h, timeout=30)


if __name__ == "__main__":
    sys.exit(main())
