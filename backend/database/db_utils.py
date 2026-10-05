"""
db_utils.py — the ONE persistence layer for Veritas AI.

The original code base stored everything in JSON files and used two calls::

    data = load_cached('bids.json')      # -> list[dict]  (or dict for compliance.json)
    save_cached('bids.json', data)       # write the whole list back

This module keeps that exact API but stores the data in a SQL database
(PostgreSQL in production, SQLite for zero-config local development), so every
route and service can keep its read-modify-write style while the data survives
restarts and redeploys.

Design notes
------------
* Fidelity   - each row stores the complete record in ``doc`` (JSON), so fields
               that have no typed column are never lost.  Typed columns are a
               projection for SQL / reporting.
* Ordering   - ``pos`` stores the list index; reads are ordered by it.
* Efficiency - a request loads each file at most once (per-request memo) and a
               save only writes rows that actually changed.
* Safety     - a save only deletes rows that were present when THIS request
               loaded the list, so two concurrent requests that each append a
               record can no longer wipe out each other's rows.
* Portable   - upserts use the dialect-specific ``ON CONFLICT`` insert, no raw
               PostgreSQL-only SQL.
"""
from __future__ import annotations

import copy
import hashlib
import importlib
import json
import os
from typing import Any

from flask import g, has_app_context
from sqlalchemy import delete, func, select
from sqlalchemy.types import Boolean, Float, Integer, JSON, String

# filename -> (model class name, primary-key column)
TABLES: dict[str, tuple[str, str]] = {
    'users.json':                 ('User',                'id'),
    'tenders.json':               ('Tender',              'id'),
    'requirements.json':          ('Requirement',         'id'),
    'bidders.json':               ('Bidder',              'id'),
    'documents.json':             ('Document',            'id'),
    'bids.json':                  ('Bid',                 'id'),
    'contracts.json':             ('Contract',            'id'),
    'audit.json':                 ('AuditEntry',          'id'),
    'notifications.json':         ('Notification',        'id'),
    'feedback.json':              ('Feedback',            'id'),
    'grievances.json':            ('Grievance',           'id'),
    'clarifications.json':        ('Clarification',       'id'),
    'evaluation_tasks.json':      ('EvaluationTask',      'id'),
    'eval_committees.json':       ('EvalCommittee',       'id'),
    'inspections.json':           ('Inspection',          'id'),
    'corrective_actions.json':    ('CorrectiveAction',    'id'),
    'vendor_profiles.json':       ('VendorProfile',       'id'),
    'conflict_declarations.json': ('ConflictDeclaration', 'id'),
    'ai_overrides.json':          ('AIOverride',          'id'),
    'rejection_feedback.json':    ('RejectionFeedback',   'id'),
}

# Non-list JSON documents stored in the generic key/value table.
KV_DEFAULTS: dict[str, Any] = {'compliance.json': {}}

DATA_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data'
)

_CHUNK = 200            # rows per executemany batch
_ORDER_FALLBACK = 10 ** 9


# ── helpers ──────────────────────────────────────────────────────────────────

def _models():
    # Explicit import of the *module*. (The old code did ``import database.db``
    # while database/__init__.py re-exported the SQLAlchemy instance ``db``,
    # which shadowed the module and made every model lookup raise
    # ``AttributeError: User`` -> HTTP 500 on login.)
    return importlib.import_module('database.db')


def _db():
    return _models().db


def _canon(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, ensure_ascii=False, default=str)


def seed_file(filename: str, default: Any = None) -> Any:
    """Read a bundled JSON file from data/.  ``utf-8-sig`` tolerates the BOM
    that Windows editors add (translations.json had one and silently failed)."""
    try:
        with open(os.path.join(DATA_DIR, filename), 'r', encoding='utf-8-sig') as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


class _Spec:
    """Resolved table metadata for one data file."""

    def __init__(self, filename: str):
        model_name, pk = TABLES[filename]
        self.filename = filename
        self.model = getattr(_models(), model_name)
        self.table = self.model.__table__
        self.pk = pk
        self.columns = [c for c in self.table.columns if c.name not in ('doc', 'pos')]


_specs: dict[str, _Spec] = {}


def _spec(filename: str) -> _Spec:
    sp = _specs.get(filename)
    if sp is None:
        sp = _specs[filename] = _Spec(filename)
    return sp


def _coerce(col, value):
    """Best-effort conversion of a JSON value to a column's type.
    The typed columns are only a projection of ``doc``, so a value that does
    not fit becomes NULL instead of failing the whole save."""
    if value is None:
        return None
    t = col.type
    if isinstance(t, JSON):
        return value
    if isinstance(t, Boolean):
        if isinstance(value, str):
            return value.strip().lower() in ('1', 'true', 'yes', 'y')
        return bool(value)
    if isinstance(t, Integer):          # includes BigInteger
        try:
            if isinstance(value, bool):
                return int(value)
            n = int(float(value))
            return n if abs(n) < 9 * 10 ** 18 else None
        except (TypeError, ValueError, OverflowError):
            return None
    if isinstance(t, Float):
        try:
            f = float(value)
            return f if f == f and f not in (float('inf'), float('-inf')) else None
        except (TypeError, ValueError):
            return None
    if isinstance(t, String):           # includes Text
        if isinstance(value, str):
            return value
        if isinstance(value, (dict, list)):
            return json.dumps(value, ensure_ascii=False, default=str)
        return str(value)
    return value


def _pk_value(item: dict, pk: str) -> str:
    v = item.get(pk)
    if v is not None and str(v) != '':
        return str(v)
    # Record without an id (the JSON files allowed that): derive a stable one
    # from the content so it can still be stored and found again.
    return 'auto-' + hashlib.sha1(_canon(item).encode('utf-8')).hexdigest()[:16]


# ── per-request memo ─────────────────────────────────────────────────────────

def _memo() -> dict | None:
    if not has_app_context():
        return None
    m = getattr(g, '_veritas_store', None)
    if m is None:
        m = g._veritas_store = {}
    return m


def invalidate(filename: str | None = None) -> None:
    """Forget what this request has loaded (next load re-reads the database)."""
    m = _memo()
    if m is None:
        return
    if filename is None:
        m.clear()
    else:
        m.pop(filename, None)


def invalidate_all() -> None:
    invalidate(None)


# ── LOAD ─────────────────────────────────────────────────────────────────────

def _fetch_table(sp: _Spec):
    """Return (list_of_docs, snapshot) straight from the database."""
    t = sp.table
    stmt = select(t).order_by(func.coalesce(t.c.pos, _ORDER_FALLBACK), t.c[sp.pk])
    docs, snap = [], {}
    for row in _db().session.execute(stmt).mappings():
        doc = row['doc']
        if not isinstance(doc, dict):
            # Legacy row written by the old schema (no ``doc`` yet).
            doc = {c.name: row[c.name] for c in sp.columns}
        docs.append(doc)
        snap[str(row[sp.pk])] = (row['pos'], _canon(doc))
    return docs, snap


def load_cached(filename: str) -> Any:
    """Return the data for ``filename`` (a fresh copy the caller may mutate)."""
    if filename in TABLES:
        memo = _memo()
        if memo is not None and filename in memo:
            return copy.deepcopy(memo[filename]['docs'])
        docs, snap = _fetch_table(_spec(filename))
        if memo is not None:
            memo[filename] = {'docs': docs, 'snap': snap}
            return copy.deepcopy(docs)
        return docs

    # Key/value documents (compliance.json …)
    KVStore = _models().KVStore
    row = _db().session.get(KVStore, filename)
    if row is not None and row.value is not None:
        return copy.deepcopy(row.value)
    return seed_file(filename, copy.deepcopy(KV_DEFAULTS.get(filename, [])))


# ── SAVE ─────────────────────────────────────────────────────────────────────

def _upsert_stmt(sp: _Spec):
    name = _db().session.get_bind().dialect.name
    if name == 'postgresql':
        from sqlalchemy.dialects.postgresql import insert
    elif name == 'sqlite':
        from sqlalchemy.dialects.sqlite import insert
    else:                                   # pragma: no cover
        raise RuntimeError(f'Unsupported database dialect: {name}')
    stmt = insert(sp.table)
    update_cols = {c.name: stmt.excluded[c.name]
                   for c in sp.table.columns if c.name != sp.pk}
    return stmt.on_conflict_do_update(index_elements=[sp.table.c[sp.pk]], set_=update_cols)


def save_cached(filename: str, data: Any) -> None:
    """Persist ``data`` (the full list / dict) for ``filename``."""
    if filename not in TABLES or not isinstance(data, list):
        return _save_kv(filename, data)

    sp = _spec(filename)
    session = _db().session
    memo = _memo()

    # De-duplicate by primary key (last one wins) while keeping order.
    ordered: dict[str, dict] = {}
    for item in data:
        if isinstance(item, dict):
            ordered[_pk_value(item, sp.pk)] = item
    items = list(ordered.items())

    # The rows this request saw when it loaded the list. Only those can be
    # deleted by this save — rows inserted meanwhile by another request are
    # not in the snapshot, so they survive.
    if memo is not None and filename in memo:
        snap = memo[filename]['snap']
    else:
        _, snap = _fetch_table(sp)

    new_snap, upserts = {}, []
    for pos, (pk_val, item) in enumerate(items):
        canon = _canon(item)
        new_snap[pk_val] = (pos, canon)
        if snap.get(pk_val) == (pos, canon):
            continue                                  # unchanged -> skip
        row = {c.name: _coerce(c, item.get(c.name)) for c in sp.columns}
        row[sp.pk] = pk_val
        row['doc'] = item
        row['pos'] = pos
        upserts.append(row)

    removed = [pk for pk in snap if pk not in new_snap]

    try:
        if upserts:
            stmt = _upsert_stmt(sp)
            for i in range(0, len(upserts), _CHUNK):
                session.execute(stmt, upserts[i:i + _CHUNK])
        for i in range(0, len(removed), _CHUNK):
            session.execute(delete(sp.table).where(sp.table.c[sp.pk].in_(removed[i:i + _CHUNK])))
        session.commit()
    except Exception:
        session.rollback()
        if memo is not None:
            memo.pop(filename, None)
        raise

    if memo is not None:
        memo[filename] = {'docs': copy.deepcopy([it for _, it in items]), 'snap': new_snap}


def _save_kv(filename: str, data: Any) -> None:
    KVStore = _models().KVStore
    session = _db().session
    try:
        row = session.get(KVStore, filename)
        if row is None:
            session.add(KVStore(key=filename, value=data))
        else:
            row.value = data
        session.commit()
    except Exception:
        session.rollback()
        raise


# ── Startup helpers (used by app.py / seed_db.py) ────────────────────────────

def ensure_columns(engine) -> list[str]:
    """Add columns that exist in the models but not yet in the database.

    ``db.create_all()`` creates missing TABLES but never alters existing ones.
    Databases created by the previous version of the app lack ``doc`` / ``pos``,
    so they are added here (idempotent, safe to run on every boot).
    """
    from sqlalchemy import inspect, text
    added = []
    insp = inspect(engine)
    existing_tables = set(insp.get_table_names())
    with engine.begin() as conn:
        for table in _models().db.metadata.sorted_tables:
            if table.name not in existing_tables:
                continue
            have = {c['name'] for c in insp.get_columns(table.name)}
            for col in table.columns:
                if col.name in have:
                    continue
                ddl_type = col.type.compile(dialect=engine.dialect)
                conn.execute(text(f'ALTER TABLE {table.name} ADD COLUMN {col.name} {ddl_type}'))
                added.append(f'{table.name}.{col.name}')
    return added
