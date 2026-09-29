"""
json_cache.py — Thread-safe in-memory cache for JSON data files.

Each JSON file is parsed once and kept in memory, but the cache is validated
against the file's (mtime, size) signature on every read.  That matters
because several route modules (bidder_portal, officer_portal, tenders,
contracts, grievance, public_portal) read/write the JSON files directly
instead of going through this cache.  Without validation the cache could serve
stale data and — worse — a cached read-modify-write (e.g. appending to
audit.json) would silently overwrite entries written by those other modules.

Usage
-----
    from services.json_cache import load_cached, save_cached

    data = load_cached('documents.json')   # re-reads disk only if the file changed
    save_cached('documents.json', data)    # atomic write + cache refresh

Callers always receive a deep copy, so mutating the returned structure
(including nested dicts) can never corrupt the cache.
"""
import copy
import json
import os
import tempfile
import threading
from config import DATA_DIR

# { filename: (signature, parsed_data) }
_cache: dict = {}
_lock = threading.RLock()


def _path(filename: str) -> str:
    return os.path.join(DATA_DIR, filename)


def _signature(path: str):
    try:
        st = os.stat(path)
        return (st.st_mtime_ns, st.st_size)
    except OSError:
        return None


def load_cached(filename: str):
    """Return a deep copy of the parsed JSON for `filename`.

    The file is re-read from disk only when it is not cached yet or when its
    modification signature changed since it was cached (i.e. another module or
    process wrote to it)."""
    path = _path(filename)
    with _lock:
        sig = _signature(path)
        entry = _cache.get(filename)
        if entry is None or entry[0] != sig or sig is None:
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            _cache[filename] = (sig, data)
            entry = _cache[filename]
        return copy.deepcopy(entry[1])


def save_cached(filename: str, data, indent: int = 2):
    """Atomically write `data` to `filename` and refresh the cache entry."""
    path = _path(filename)
    with _lock:
        fd, tmp = tempfile.mkstemp(dir=DATA_DIR, prefix=f'.{filename}.', suffix='.tmp')
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=indent, ensure_ascii=False)
            os.replace(tmp, path)
        except Exception:
            try:
                os.remove(tmp)
            except OSError:
                pass
            raise
        _cache[filename] = (_signature(path), copy.deepcopy(data))


def invalidate(filename: str):
    """Evict a single file from the cache — next read will reload from disk."""
    with _lock:
        _cache.pop(filename, None)


def invalidate_all():
    """Clear the entire cache — used during testing or forced reload."""
    with _lock:
        _cache.clear()
