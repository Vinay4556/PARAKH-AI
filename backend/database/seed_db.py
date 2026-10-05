"""
seed_db.py — first-boot data seeding and migration of older databases.

* Empty tables are filled from the bundled JSON files in backend/data/.
* Databases created by the previous version of the app (rows without the full
  ``doc`` record) are upgraded in place: the bundled JSON supplies the fields
  the old schema had no column for, and the current column values win, so any
  edits made since the first seed are kept.

Idempotent — safe to run on every boot, or manually::

    python -m database.seed_db
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import func, select  # noqa: E402

from database import db_utils as store  # noqa: E402


def _migrate_legacy_rows(sp, session) -> int:
    """Fill ``doc``/``pos`` for rows created before those columns existed."""
    t = sp.table
    legacy = session.execute(select(t).where(t.c.doc.is_(None))).mappings().all()
    if not legacy:
        return 0

    bundled = store.seed_file(sp.filename, []) or []
    by_pk = {str(r.get(sp.pk)): (i, r) for i, r in enumerate(bundled) if isinstance(r, dict)}

    for n, row in enumerate(legacy):
        pk_val = str(row[sp.pk])
        idx, base = by_pk.get(pk_val, (len(bundled) + n, {}))
        current = {c.name: row[c.name] for c in sp.columns if row[c.name] is not None}
        session.execute(
            t.update().where(t.c[sp.pk] == pk_val).values(doc={**base, **current}, pos=idx)
        )
    session.commit()
    return len(legacy)


def seed(app, db):
    """Seed / upgrade every table. Returns a list of human-readable actions."""
    actions = []
    with app.app_context():
        session = db.session
        for filename in store.TABLES:
            sp = store._spec(filename)
            count = session.execute(select(func.count()).select_from(sp.table)).scalar() or 0

            if count == 0:
                data = store.seed_file(filename, [])
                if isinstance(data, list) and data:
                    store.save_cached(filename, data)
                    actions.append(f'{filename}: seeded {len(data)}')
            else:
                fixed = _migrate_legacy_rows(sp, session)
                if fixed:
                    actions.append(f'{filename}: upgraded {fixed} legacy rows')

        # Key/value documents
        from database.db import KVStore
        for filename, default in store.KV_DEFAULTS.items():
            if session.get(KVStore, filename) is None:
                value = store.seed_file(filename, default)
                store.save_cached(filename, value)
                actions.append(f'{filename}: seeded')

        store.invalidate_all()
    return actions


if __name__ == '__main__':
    from dotenv import load_dotenv
    load_dotenv()
    from app import app
    from database.db import db as _db
    with app.app_context():
        _db.create_all()
        print('\n'.join(seed(app, _db)) or 'nothing to do (already seeded)')
    print('Done.')
