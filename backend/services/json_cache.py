"""
json_cache.py — compatibility shim.

Historically this module cached JSON files on disk.  All persistence now goes
through ``database.db_utils`` (PostgreSQL / SQLite), and this module simply
re-exports that API so existing ``from services.json_cache import load_cached``
imports keep working and — unlike the old runtime "patching" approach — can
never end up bound to a different (file based) implementation.

    data = load_cached('documents.json')
    save_cached('documents.json', data)
"""
from database.db_utils import (   # noqa: F401  (re-exported API)
    load_cached,
    save_cached,
    invalidate,
    invalidate_all,
)
