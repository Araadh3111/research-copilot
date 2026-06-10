"""Account + data deletion (GDPR/CCPA-style right to erasure).

Wipes every row of user-identifiable data across all tables, and optionally the
auth account itself. Best-effort per table so one failure doesn't abort the rest;
returns a per-table report.
"""

from __future__ import annotations

import logging

from supabase_client import sb

logger = logging.getLogger("account")

# Every table that stores user-identifiable data, and the column keying it to a
# user. (shared_results is token-only with no user column, so it's not listed.)
_USER_TABLES: list[tuple[str, str]] = [
    ("doc_chunks", "owner_id"),         # library chunk embeddings
    ("library_documents", "owner_id"),  # uploaded PDF records
    ("search_history", "user_id"),      # past searches
    ("user_usage", "user_id"),          # quota counters + cost
    ("search_costs", "user_id"),        # per-search cost logs
    ("user_profiles", "id"),            # tier / profile
]


def purge_user_data(user_id: str, *, delete_account: bool = False) -> dict:
    """Delete all of a user's data. With delete_account, also removes the auth user.

    Returns {"ok": bool, "cleared": {table: status, ...}}.
    """
    if not sb:
        return {"ok": False, "error": "storage_unavailable"}

    cleared: dict[str, str] = {}
    for table, col in _USER_TABLES:
        try:
            sb.table(table).delete().eq(col, user_id).execute()
            cleared[table] = "cleared"
        except Exception as e:
            cleared[table] = f"error:{type(e).__name__}"
            logger.warning("purge %s failed (%s: %s)", table, type(e).__name__, e)

    if delete_account:
        try:
            # Service-role admin API removes the auth.users row (cascades FKs).
            sb.auth.admin.delete_user(user_id)
            cleared["auth_user"] = "deleted"
        except Exception as e:
            cleared["auth_user"] = f"error:{type(e).__name__}"
            logger.warning("auth delete_user failed (%s: %s)", type(e).__name__, e)

    return {"ok": True, "cleared": cleared}
