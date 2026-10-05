"""audit_utils.py — helpers shared by every module that writes to audit.json."""
import re

_AUDIT_ID = re.compile(r'^AUD-(\d+)$')


def next_audit_id(audit) -> str:
    """Return the next unused audit ID (AUD-0001, AUD-0002, ...).

    Derived from the highest existing numeric ID instead of len(audit)+1, which
    produced duplicate IDs whenever entries had been removed (e.g. after a
    bidder deletion) and mixed 3- and 4-digit formats."""
    highest = 0
    for entry in audit or []:
        m = _AUDIT_ID.match(str((entry or {}).get('id', '')))
        if m:
            highest = max(highest, int(m.group(1)))
    return f'AUD-{highest + 1:04d}'
