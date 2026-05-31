import os
from supabase import create_client, Client

_URL = os.getenv("SUPABASE_URL", "")
_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

# Module-level singleton. None when env vars aren't set (local dev without Supabase).
# All callers guard with `if not sb: return <safe default>`.
sb: Client | None = create_client(_URL, _KEY) if _URL and _KEY else None
