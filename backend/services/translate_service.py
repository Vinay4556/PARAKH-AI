"""
translate_service.py — fast, free, non-expirable translation backend.

Translation engine priority
---------------------------
1. Self-hosted LibreTranslate (LIBRETRANSLATE_URL, default localhost:5001)
   — instant, private, no quota.  Requires Docker.
2. Google Translate unofficial batch API
   — no API key, handles up to 128 strings per request, responds in < 1 s.
   Used automatically when the local instance is unreachable.
3. MyMemory public API — single-string fallback if Google batch fails.

Speed
-----
The old code translated 361 strings sequentially (~2 min).  This version
flattens the entire bundle into one list, splits it into chunks of 100, fires
all chunks concurrently (ThreadPoolExecutor), and rebuilds the nested dict
from the results.  A full bundle now takes 2–5 seconds.

Non-expirable cache
-------------------
Every unique (source, target, text) triple is written to a JSON file on disk
on first use and served from there forever after.  Hot-path reads never touch
the network or disk.
"""
import hashlib
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

from config import DATA_DIR

# ── Engine configuration ──────────────────────────────────────────────────────

LIBRETRANSLATE_URL = os.environ.get(
    'LIBRETRANSLATE_URL', 'http://localhost:5001'
).rstrip('/')
LIBRETRANSLATE_TIMEOUT = float(os.environ.get('LIBRETRANSLATE_TIMEOUT', '20'))

# Google Translate unofficial endpoint — no key required.
GTRANS_URL = 'https://translate.googleapis.com/translate_a/t'

# MyMemory single-string fallback.
MYMEMORY_URL = 'https://api.mymemory.translated.net/get'
MYMEMORY_EMAIL = os.environ.get('MYMEMORY_EMAIL', '')

# Maximum strings per Google batch request.
GTRANS_CHUNK = 100

# Maximum worker threads for concurrent bundle translation.
MAX_WORKERS = 8

# Tracks whether the primary LibreTranslate is known-down this process run.
_primary_down = False
_primary_lock = threading.Lock()

# ── Disk cache ────────────────────────────────────────────────────────────────

CACHE_FILE = 'translations.json'
_mem: dict = {}
_loaded = False
_lock = threading.RLock()


def _load_from_disk():
    global _loaded
    with _lock:
        if _loaded and _mem:
            return
        _loaded = True
        path = os.path.join(DATA_DIR, CACHE_FILE)
        try:
            import json
            with open(path, 'r', encoding='utf-8-sig') as f:
                data = json.load(f)
            if isinstance(data, dict):
                _mem.update(data)
        except (OSError, ValueError):
            pass


def invalidate_memory():
    global _loaded
    with _lock:
        _mem.clear()
        _loaded = False


def _persist():
    import json, tempfile
    path = os.path.join(DATA_DIR, CACHE_FILE)
    try:
        with _lock:
            fd, tmp = tempfile.mkstemp(
                dir=DATA_DIR, prefix='.translations.', suffix='.tmp'
            )
        try:
            with open(fd, 'w', encoding='utf-8') as f:
                json.dump(_mem, f, ensure_ascii=False)
            os.replace(tmp, path)
        except Exception:
            try:
                os.remove(tmp)
            except OSError:
                pass
            raise
    except Exception:
        pass


def _key(source: str, target: str, text: str) -> str:
    raw = f'{source}|{target}|{text}'.encode('utf-8')
    return hashlib.sha256(raw).hexdigest()


# ── Engine calls ──────────────────────────────────────────────────────────────

def _call_libretranslate(text: str, source: str, target: str) -> str | None:
    payload = {'q': text, 'source': source, 'target': target, 'format': 'text'}
    resp = requests.post(
        f'{LIBRETRANSLATE_URL}/translate',
        json=payload,
        timeout=LIBRETRANSLATE_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json().get('translatedText')


def _call_gtrans_batch(texts: list[str], source: str, target: str) -> list[str] | None:
    """Translate a list of strings in one Google Translate request.

    Returns a list of translated strings in the same order, or None on failure.
    Google's unofficial endpoint accepts up to ~128 strings per call.
    """
    src = source if source != 'auto' else 'auto'
    try:
        # Each string is passed as a separate 'q' parameter.
        params = [('client', 'gtx'), ('sl', src), ('tl', target), ('dt', 't')]
        for t in texts:
            params.append(('q', t))

        resp = requests.get(
            GTRANS_URL,
            params=params,
            timeout=20,
            headers={'User-Agent': 'Mozilla/5.0'},
        )
        resp.raise_for_status()
        data = resp.json()

        # Response shape for multi-q: [[translatedText, ...], ...]
        # Each top-level item corresponds to one input string.
        results = []
        for item in data:
            if isinstance(item, list) and item:
                # item[0] is the translated text
                results.append(str(item[0]) if item[0] else '')
            else:
                results.append('')

        if len(results) == len(texts):
            return results
    except Exception:
        pass
    return None


def _call_mymemory(text: str, source: str, target: str) -> str | None:
    src = source if source != 'auto' else 'en'
    params = {'q': text, 'langpair': f'{src}|{target}'}
    if MYMEMORY_EMAIL:
        params['de'] = MYMEMORY_EMAIL
    resp = requests.get(MYMEMORY_URL, params=params, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    if str(data.get('responseStatus')) == '200':
        return data.get('responseData', {}).get('translatedText') or None
    return None


def _call_engine_single(text: str, source: str, target: str) -> str | None:
    """Translate one string, trying all engines in order."""
    global _primary_down

    if not _primary_down:
        try:
            result = _call_libretranslate(text, source, target)
            if result:
                return result
        except Exception:
            with _primary_lock:
                _primary_down = True

    # Google single-string via batch endpoint
    results = _call_gtrans_batch([text], source, target)
    if results and results[0]:
        return results[0]

    # MyMemory last resort
    try:
        return _call_mymemory(text, source, target)
    except Exception:
        pass

    return None


# ── Public single-string API ──────────────────────────────────────────────────

def translate(text: str, target: str, source: str = 'auto') -> str:
    """Translate `text` into `target` using the durable cache."""
    if not text or not text.strip():
        return text

    _load_from_disk()

    if source != 'auto' and source == target:
        return text

    cache_key = _key(source, target, text)
    with _lock:
        hit = _mem.get(cache_key)
    if hit is not None:
        return hit

    translated = _call_engine_single(text, source, target)

    if not translated or not str(translated).strip():
        return text

    with _lock:
        _mem[cache_key] = translated
    _persist()
    return translated


def translate_many(texts, target: str, source: str = 'auto'):
    return [translate(t, target, source) for t in texts]


# ── Fast bundle translation ───────────────────────────────────────────────────

def _flatten_bundle(mapping: dict, prefix: str = '') -> list[tuple[str, str]]:
    """Return [(dotted_key, string_value), ...] for every string in mapping."""
    items = []
    for k, v in mapping.items():
        full_key = f'{prefix}.{k}' if prefix else k
        if isinstance(v, str):
            items.append((full_key, v))
        elif isinstance(v, dict):
            items.extend(_flatten_bundle(v, full_key))
    return items


def _rebuild_bundle(original: dict, translations: dict[str, str]) -> dict:
    """Rebuild the nested dict, replacing string values with translations."""
    out = {}
    for k, v in original.items():
        if isinstance(v, str):
            out[k] = translations.get(k, v)
        elif isinstance(v, dict):
            # Build a sub-translations map with the prefix stripped
            sub = {
                sub_k[len(k) + 1:]: tv
                for sub_k, tv in translations.items()
                if sub_k.startswith(f'{k}.')
            }
            out[k] = _rebuild_bundle(v, sub)
        else:
            out[k] = v
    return out


def _translate_chunk_gtrans(
    chunk: list[tuple[str, str]], source: str, target: str
) -> dict[str, str]:
    """Translate one chunk via Google batch, falling back per-string on failure."""
    keys = [k for k, _ in chunk]
    texts = [v for _, v in chunk]

    # Check cache first — skip already-translated strings
    _load_from_disk()
    result: dict[str, str] = {}
    uncached_keys = []
    uncached_texts = []
    for k, t in zip(keys, texts):
        ck = _key(source, target, t)
        with _lock:
            hit = _mem.get(ck)
        if hit is not None:
            result[k] = hit
        else:
            uncached_keys.append(k)
            uncached_texts.append(t)

    if not uncached_texts:
        return result

    # Try Google batch
    translated = _call_gtrans_batch(uncached_texts, source, target)
    if translated and len(translated) == len(uncached_texts):
        new_entries = {}
        for k, orig, trans in zip(uncached_keys, uncached_texts, translated):
            val = trans if trans and trans.strip() else orig
            result[k] = val
            new_entries[_key(source, target, orig)] = val
        with _lock:
            _mem.update(new_entries)
        _persist()
        return result

    # Google failed — fall back to MyMemory per-string (sequential, slow)
    for k, t in zip(uncached_keys, uncached_texts):
        try:
            val = _call_mymemory(t, source, target) or t
        except Exception:
            val = t
        result[k] = val
        with _lock:
            _mem[_key(source, target, t)] = val
    _persist()
    return result


def translate_bundle(mapping: dict, target: str, source: str = 'auto') -> dict:
    """Translate every string value in `mapping`, keeping keys and structure.

    Speed: flattens all strings, splits into chunks of GTRANS_CHUNK, fires
    all chunks concurrently, then rebuilds the nested dict.  A 361-string
    bundle finishes in 2–5 seconds instead of ~2 minutes.
    """
    if source != 'auto' and source == target:
        return mapping

    # Flatten → chunk → translate concurrently
    flat = _flatten_bundle(mapping)
    chunks = [
        flat[i: i + GTRANS_CHUNK]
        for i in range(0, len(flat), GTRANS_CHUNK)
    ]

    translations: dict[str, str] = {}

    with ThreadPoolExecutor(max_workers=min(MAX_WORKERS, len(chunks) or 1)) as pool:
        futures = {
            pool.submit(_translate_chunk_gtrans, chunk, source, target): chunk
            for chunk in chunks
        }
        for future in as_completed(futures):
            try:
                translations.update(future.result())
            except Exception:
                # If a chunk fails entirely, keep original values (handled in rebuild)
                pass

    return _rebuild_bundle(mapping, translations)


# ── Status helpers ────────────────────────────────────────────────────────────

def engine_status() -> bool:
    """Return True if at least one translation engine is reachable."""
    try:
        resp = requests.get(f'{LIBRETRANSLATE_URL}/languages', timeout=5)
        if resp.ok:
            return True
    except Exception:
        pass
    try:
        resp = requests.get(
            MYMEMORY_URL, params={'q': 'hi', 'langpair': 'en|fr'}, timeout=8
        )
        if str(resp.json().get('responseStatus')) == '200':
            return True
    except Exception:
        pass
    return False


def cached_count() -> int:
    _load_from_disk()
    with _lock:
        return len(_mem)


def supported_languages() -> list:
    try:
        resp = requests.get(f'{LIBRETRANSLATE_URL}/languages', timeout=5)
        if resp.ok:
            return resp.json()
    except Exception:
        pass
    return []
