"""End-to-end full-text test against PROD (plan.md Part B step 2).

Creates a disposable test user, uploads a real arXiv paper PDF to
/library/upload, then runs an authenticated /search and checks that the
uploaded paper (a) comes back as a "Your library" source and (b) is cited
with an [n] marker in the synthesis. Cleans up the user's documents after.

Needs: backend/.env (SUPABASE_URL + SERVICE_ROLE_KEY), frontend/.env.local
(anon key), and the prod API reachable. Run from repo root:
    ./.venv/Scripts/python.exe evals/e2e_pdf_test.py
"""

from __future__ import annotations

import json
import os
import re
import sys
import uuid

import requests
from dotenv import dotenv_values

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)

BACKEND_ENV = dotenv_values(os.path.join(_ROOT, "backend", ".env"))
FRONTEND_ENV = dotenv_values(os.path.join(_ROOT, "frontend", ".env.local"))

SUPABASE_URL = (BACKEND_ENV.get("SUPABASE_URL") or "").rstrip("/")
SERVICE_KEY = BACKEND_ENV["SUPABASE_SERVICE_ROLE_KEY"]
ANON_KEY = FRONTEND_ENV["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
API = (FRONTEND_ENV.get("NEXT_PUBLIC_API_URL") or "").rstrip("/")

# The LoRA paper — full text mentions things its abstract doesn't.
PDF_URL = "https://arxiv.org/pdf/2106.09685"
SEARCH_QUERY = "LoRA low rank adaptation rank choice for attention weight matrices"


def main() -> int:
    email = f"e2e-{uuid.uuid4().hex[:10]}@researca-test.dev"
    password = uuid.uuid4().hex + "Aa1!"
    admin_h = {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}

    print(f"1. creating test user {email}")
    r = requests.post(f"{SUPABASE_URL}/auth/v1/admin/users", headers=admin_h, json={
        "email": email, "password": password, "email_confirm": True,
    }, timeout=30)
    r.raise_for_status()
    user_id = r.json()["id"]

    try:
        print("2. signing in for a JWT")
        r = requests.post(
            f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
            headers={"apikey": ANON_KEY},
            json={"email": email, "password": password}, timeout=30,
        )
        r.raise_for_status()
        jwt = r.json()["access_token"]
        auth_h = {"Authorization": f"Bearer {jwt}"}

        print(f"3. downloading test paper {PDF_URL}")
        pdf = requests.get(PDF_URL, timeout=60).content
        print(f"   {len(pdf) // 1024} KB")

        print("4. uploading to /library/upload (embeds on prod — may take a minute)")
        r = requests.post(
            f"{API}/library/upload", headers=auth_h,
            files={"file": ("lora.pdf", pdf, "application/pdf")}, timeout=300,
        )
        print(f"   status={r.status_code} body={r.text[:300]}")
        if r.status_code != 200:
            return 1
        doc = r.json()
        if not doc.get("chunk_count"):
            print("   FAIL: 0 chunks stored")
            return 1
        print(f"   stored: {doc['chunk_count']} chunks, {doc['pages']} pages")

        print(f"5. authenticated /search: {SEARCH_QUERY!r}")
        r = requests.post(
            f"{API}/search", headers=auth_h | {"Accept": "text/event-stream"},
            json={"query": SEARCH_QUERY}, stream=True, timeout=300,
        )
        print(f"   status={r.status_code}")
        if r.status_code != 200:
            print(f"   body={r.text[:300]}")
            return 1

        papers, text = [], []
        for line in r.iter_lines(decode_unicode=True):
            if not line or not line.startswith("data:"):
                continue
            try:
                evt = json.loads(line[5:].strip())
            except ValueError:
                continue
            if evt.get("type") == "papers":
                papers = evt.get("papers", [])
            elif evt.get("type") == "text":
                text.append(evt.get("text", ""))
            elif evt.get("type") == "error":
                print(f"   FAIL: pipeline error: {evt.get('detail')}")
                return 1

        synthesis = "".join(text)
        lib_idx = [i + 1 for i, p in enumerate(papers) if p.get("source") == "library"]
        print(f"   {len(papers)} sources, library entries at positions {lib_idx}")
        markers = {int(n) for m in re.findall(r"\[(\d+(?:,\s*\d+)*)\]", synthesis)
                   for n in m.split(",")}
        print(f"   cited markers in synthesis: {sorted(markers)}")
        bad = [n for n in markers if n < 1 or n > len(papers)]

        ok = True
        if not lib_idx:
            print("   FAIL: uploaded paper not merged into results")
            ok = False
        elif any(i in markers for i in lib_idx):
            print(f"   PASS: library paper cited inline as {[i for i in lib_idx if i in markers]}")
        else:
            print("   WARN: library paper returned as a source but not cited inline")
        if bad:
            print(f"   FAIL: hallucinated citation markers {bad} (only 1..{len(papers)} exist)")
            ok = False
        else:
            print("   PASS: every [n] marker maps to a real source")
        print(f"\n--- synthesis head ---\n{synthesis[:600]}")
        return 0 if ok else 1
    finally:
        print("\n6. cleanup: deleting test user + data")
        requests.delete(f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
                        headers=admin_h, timeout=30)
        for table, col in (("doc_chunks", "owner_id"), ("library_documents", "owner_id")):
            requests.delete(f"{SUPABASE_URL}/rest/v1/{table}?{col}=eq.{user_id}",
                            headers=admin_h, timeout=30)


if __name__ == "__main__":
    sys.exit(main())
