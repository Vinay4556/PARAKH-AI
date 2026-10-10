"""
connection.py — decide which database the app uses, and verify it works.

Resolution order
----------------
1. DATABASE_URL set and reachable  -> PostgreSQL (production / Railway / Supabase)
2. DATABASE_URL unset              -> SQLite file  (zero-config local development)
3. DATABASE_URL set but unreachable-> SQLite file, flagged in /api/health as
                                      'sqlite-fallback' with the reason, so the
                                      site stays usable and the problem is
                                      visible instead of every request 500-ing.
                                      Set DB_STRICT=1 to crash on startup
                                      instead (recommended once things work).
"""
import os
import re
import tempfile
import time
from contextlib import contextmanager

from sqlalchemy import create_engine, text


# ── URL handling ─────────────────────────────────────────────────────────────

def normalize_url(url: str) -> str:
    """Accept any of postgres:// , postgresql:// , postgresql+psycopg2:// and
    return the explicit psycopg2 form SQLAlchemy needs."""
    url = (url or '').strip().strip('"').strip("'")
    if url.startswith('postgres://'):
        url = 'postgresql+psycopg2://' + url[len('postgres://'):]
    elif url.startswith('postgresql://'):
        url = 'postgresql+psycopg2://' + url[len('postgresql://'):]
    return url


def redact(message: str) -> str:
    """Remove credentials from any URL that appears in an error message."""
    return re.sub(r'(://[^:/\s@]+):[^@\s]+@', r'\1:***@', str(message))


def sqlite_url() -> str:
    path = os.environ.get('SQLITE_PATH')
    if not path:
        from config import DATA_DIR
        path = os.path.join(DATA_DIR, 'veritas_ai.db')
        if not os.access(os.path.dirname(path), os.W_OK):
            path = os.path.join(tempfile.gettempdir(), 'veritas_ai.db')
    return 'sqlite:///' + path.replace('\\', '/')


def engine_options(url: str) -> dict:
    import json

    def _dumps(obj):
        return json.dumps(obj, ensure_ascii=False, default=str)

    opts = {'pool_pre_ping': True, 'json_serializer': _dumps}
    if url.startswith('postgresql'):
        opts.update(
            pool_recycle=280,            # below typical 300 s idle limits
            pool_size=3,                 # Reduced for free tier
            max_overflow=2,              # Reduced for free tier
            pool_timeout=30,             # Wait up to 30s for connection from pool
            connect_args={
                'connect_timeout': 10,
                'keepalives': 1,
                'keepalives_idle': 30,
                'keepalives_interval': 10,
                'keepalives_count': 5,
            },
        )
    elif url.startswith('sqlite'):
        opts['connect_args'] = {'check_same_thread': False}
    return opts


# ── Resolution ───────────────────────────────────────────────────────────────

def _try_connect(url: str, attempts: int = 3):
    """Return (ok, error_message). Retries briefly: a database that is still
    waking up (Railway/Supabase cold start) should not trigger the fallback."""
    last = None
    for i in range(attempts):
        engine = None
        try:
            engine = create_engine(url, **engine_options(url))
            with engine.connect() as conn:
                conn.execute(text('SELECT 1'))
            return True, None
        except Exception as exc:                       # noqa: BLE001
            last = redact(exc)
            time.sleep(1.5 * (i + 1))
        finally:
            if engine is not None:
                engine.dispose()
    return False, last


def resolve_database():
    """Return a dict: {url, mode, error}. ``mode`` is one of
    'postgresql', 'sqlite', 'sqlite-fallback'."""
    raw = os.environ.get('DATABASE_URL', '').strip()
    if not raw:
        return {'url': sqlite_url(), 'mode': 'sqlite', 'error': None}

    url = normalize_url(raw)
    ok, err = _try_connect(url)
    if ok:
        return {'url': url, 'mode': 'postgresql' if url.startswith('postgresql') else 'external', 'error': None}

    print(f'[db] ERROR: cannot connect to DATABASE_URL: {err}')
    if os.environ.get('DB_STRICT') == '1':
        raise RuntimeError(f'Database unreachable (DB_STRICT=1): {err}')
    print('[db] Falling back to a local SQLite file so the app stays usable. '
          'Data written now will NOT persist across redeploys. Fix DATABASE_URL.')
    return {'url': sqlite_url(), 'mode': 'sqlite-fallback', 'error': err}


@contextmanager
def init_lock(engine):
    """Serialise start-up (create_all + seed) across gunicorn workers.

    Without this, two workers booting together can both try to CREATE the same
    tables and one crashes with 'duplicate key ... pg_type_typname_nsp_index'.
    """
    if engine.dialect.name != 'postgresql':
        yield
        return
    conn = engine.connect()
    try:
        conn.execute(text('SELECT pg_advisory_lock(727274)'))
        yield
    finally:
        try:
            conn.execute(text('SELECT pg_advisory_unlock(727274)'))
        except Exception:                                # noqa: BLE001
            pass
        conn.close()
