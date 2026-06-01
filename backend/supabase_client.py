import os
import re

from supabase import create_client, Client


def normalize_base_url(raw: str) -> str:
    """Normalize SUPABASE_URL to the bare project origin.

    Railway's env had the REST path appended (…supabase.co/rest/v1), which broke
    every supabase-py call — both auth and table queries doubled the path and
    failed (the auth failures silently downgraded logged-in users to the anon
    quota; the table failures made quota tracking fail open). Strip any
    /rest/v1, /auth/v1, /storage/v1, /realtime/v1 suffix and trailing slashes so
    the client builds correct URLs no matter how the env var is set.
    """
    url = raw.strip().rstrip("/")
    return re.sub(r"/(rest|auth|storage|realtime)/v\d+/?$", "", url)


# Bare project origin (e.g. https://xxxx.supabase.co), safe to reuse elsewhere.
SUPABASE_BASE_URL = normalize_base_url(os.getenv("SUPABASE_URL", ""))
_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

# Module-level singleton. None when env vars aren't set (local dev without Supabase).
# All callers guard with `if not sb: return <safe default>`.
sb: Client | None = create_client(SUPABASE_BASE_URL, _KEY) if SUPABASE_BASE_URL and _KEY else None
