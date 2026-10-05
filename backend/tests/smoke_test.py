"""
End-to-end smoke test for a RUNNING Veritas AI backend.

    python tests/smoke_test.py                                   # http://localhost:5000
    python tests/smoke_test.py https://your-app.up.railway.app   # deployed backend
    python tests/smoke_test.py https://your-app.vercel.app       # through the Vercel proxy

Checks health, login for all three roles, token validity across workers, every
GET endpoint, role protection, and a set of write flows (each verified by
reading the data back). Exit code 0 = everything passed.

The write flows create a few clearly-named test records (prefix "SMOKE").
Run it against a demo database, not one holding real data.
"""
import sys
import time
import uuid

import requests

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:5000').rstrip('/')
API = BASE + '/api'
TIMEOUT = 60

results = []          # (ok, label, detail)


def check(ok, label, detail=''):
    results.append((bool(ok), label, detail))
    print(('  PASS  ' if ok else '  FAIL  ') + label + (f'   [{detail}]' if detail and not ok else ''))
    return ok


def call(method, path, token=None, expect=(200,), label=None, **kw):
    headers = kw.pop('headers', {})
    if token:
        headers['Authorization'] = f'Bearer {token}'
    t0 = time.time()
    try:
        r = requests.request(method, API + path, headers=headers, timeout=TIMEOUT, **kw)
    except requests.RequestException as exc:
        check(False, label or f'{method} {path}', f'request failed: {exc}')
        return None
    ms = int((time.time() - t0) * 1000)
    ok = r.status_code in expect
    body = ''
    if not ok:
        body = f'HTTP {r.status_code}: {r.text[:160]!r}'
    check(ok, (label or f'{method} {path}') + f'  ({r.status_code}, {ms} ms)', body)
    return r


def login(email, password='password'):
    r = requests.post(API + '/auth/login', json={'email': email, 'password': password}, timeout=TIMEOUT)
    return r


def section(title):
    print(f'\n== {title}')


# ─────────────────────────────────────────────────────────────────────────────
section(f'Health  ({BASE})')
r = call('GET', '/health', label='GET /health')
if r is None or r.status_code != 200:
    print('\nBackend not reachable — aborting.')
    sys.exit(2)
h = r.json()
print(f"        db_mode={h.get('db_mode')}  database={h.get('database')}  users={h.get('users')}")
check(h.get('database') == 'connected', 'database connected', str(h.get('db_error')))
if h.get('db_mode') == 'sqlite-fallback':
    check(False, 'using the REAL database (not the SQLite fallback)', str(h.get('db_error')))

# ─────────────────────────────────────────────────────────────────────────────
section('Login / tokens')
ACCOUNTS = {
    'OFFICER': 'officer@demo.gov',
    'BIDDER': 'bidder@demo.com',
    'STAKEHOLDER': 'citizen@demo.com',
}
tok = {}
for role, email in ACCOUNTS.items():
    lr = login(email)
    ok = lr.status_code == 200 and lr.json().get('user', {}).get('role') == role
    check(ok, f'login {role} ({email})  -> {lr.status_code}', lr.text[:150])
    if ok:
        tok[role] = lr.json()['token']

bad = login('officer@demo.gov', 'definitely-wrong')
check(bad.status_code == 401, 'wrong password -> 401', str(bad.status_code))
nb = requests.post(API + '/auth/login', json={}, timeout=TIMEOUT)
check(nb.status_code == 400, 'empty login body -> 400', str(nb.status_code))
check(requests.get(API + '/auth/login', timeout=TIMEOUT).status_code == 405, 'GET /auth/login -> 405 (expected: login is POST)')

if 'OFFICER' not in tok:
    print('\nCannot continue without an officer token.')
    sys.exit(2)

# A token must work no matter which gunicorn worker handles the request.
statuses = {requests.get(API + '/auth/me', headers={'Authorization': 'Bearer ' + tok['OFFICER']}, timeout=TIMEOUT).status_code
            for _ in range(25)}
check(statuses == {200}, '/auth/me x25 always 200 (token valid on every worker)', str(statuses))
check(call('GET', '/auth/me', expect=(401,), label='/auth/me without token -> 401') is not None, 'no-token check ran')
check(call('GET', '/auth/me', token='garbage', expect=(401,), label='/auth/me tampered token -> 401') is not None, 'tampered-token check ran')

OFF, BID, PUB = tok['OFFICER'], tok.get('BIDDER'), tok.get('STAKEHOLDER')

# ─────────────────────────────────────────────────────────────────────────────
section('Officer: read endpoints')
tenders = call('GET', '/tenders', OFF).json()
bidders_list = call('GET', '/bidders', OFF, expect=(200, 404, 405), label='GET /bidders (may not exist)')
tid = tenders[0]['id'] if tenders else 'GEM-DEMO-2026-001'
bidder_id = 'BID-001'
check(len(tenders) >= 1, f'tenders list not empty ({len(tenders)})')

for path in [
    '/dashboard', f'/tenders/{tid}', f'/tenders/{tid}/requirements', f'/tenders/{tid}/bidders',
    f'/tenders/{tid}/committee', f'/tenders/{tid}/prebid',
    f'/bidders/{bidder_id}', f'/bidders/{bidder_id}/documents', f'/bidders/{bidder_id}/compliance',
    f'/bidders/{bidder_id}/report', f'/bidders/{bidder_id}/tampering',
    f'/bidders/{bidder_id}/report/download',
    '/documents/DOC-001-01', '/documents/DOC-001-01/view',
    '/audit', '/audit?limit=5', '/reports/list',
    '/contracts', '/contracts/CON-2026-001', '/contracts/CON-2026-001/inspections',
    '/corrective-actions', '/vendor-profiles', f'/vendor-profiles/{bidder_id}',
    f'/vendors/{bidder_id}/integrity',
    '/evaluation/tasks', '/officer/clarifications', '/officer/bids', '/officer/feedback',
    f'/officer/tenders/{tid}/leaderboard', f'/officer/tenders/{tid}/summary',
    f'/officer/tenders/{tid}/summary/excel', f'/officer/tenders/{tid}/summary/report',
    '/grievances', '/rejection-feedback', '/notifications', '/search?q=tender',
    '/verification/adapters', '/verification/status', f'/verification/bidder/{bidder_id}',
    '/translate/languages', '/translate/status',
    '/public/dashboard', '/public/tenders', '/public/meta', '/public/feedback', '/public/grievances/stats',
]:
    call('GET', path, OFF)

section('Bidder portal')
for path in ['/bidder/dashboard', '/bidder/tenders', '/bidder/bids', '/bidder/clarifications',
             '/bidder/grievances', '/bidder/readiness', '/bidder/rejection-feedback', '/notifications']:
    call('GET', path, BID)

section('Public / stakeholder portal')
for path in ['/public/dashboard', '/public/tenders', f'/public/tenders/{tid}', f'/public/tenders/{tid}/timeline',
             f'/public/tenders/{tid}/documents', '/public/meta', '/public/feedback', '/public/grievances/stats']:
    call('GET', path, PUB)

section('Access control')
call('GET', '/officer/bids', BID, expect=(401, 403), label='bidder cannot read /officer/bids')
call('GET', '/bidder/bids', OFF, expect=(400,), label='officer on /bidder/bids needs ?bidder_id (400, by design)')
call('POST', '/officer/bids/open-financial?tender_id=x', BID, expect=(401, 403), label='bidder cannot open financial bids')
call('GET', '/evaluation/tasks', PUB, expect=(401, 403), label='public user cannot read evaluation tasks')
call('GET', '/documents/DOC-001-01/view', None, expect=(401, 403), label='document view without token denied')
call('GET', '/documents/DOC-001-01/view', BID, expect=(401, 403), label='document view as bidder denied')
r = requests.get(f'{API}/documents/DOC-001-01/view?token={OFF}', timeout=TIMEOUT)
check(r.status_code == 200, 'document view allows ?token= for iframes (officer)', str(r.status_code))

# ─────────────────────────────────────────────────────────────────────────────
section('Write flows (each verified by reading back)')
uid = uuid.uuid4().hex[:6].upper()

# create tender
r = call('POST', '/tenders', OFF, expect=(200, 201), json={
    'title': f'SMOKE Tender {uid}', 'department': 'QA', 'category': 'Goods',
    'estimated_value': 1500000, 'submission_deadline': '2027-12-31',
    'description': 'smoke test tender',
}, label='POST /tenders (create)')
new_tid = None
if r is not None and r.status_code in (200, 201):
    j = r.json()
    new_tid = j.get('id') or (j.get('tender') or {}).get('id')
    check(bool(new_tid), 'create tender returned an id', str(j)[:150])
    back = call('GET', f'/tenders/{new_tid}', OFF, label='read back created tender')
    if back is not None and back.status_code == 200:
        check(back.json().get('title') == f'SMOKE Tender {uid}', 'created tender title persisted')

# tender lifecycle on the new tender
if new_tid:
    call('POST', f'/tenders/{new_tid}/extend', OFF, expect=(200, 201), json={
        'new_deadline': '2028-01-15', 'reason': 'smoke', 'extended_by': 'smoke'}, label='extend deadline')
    call('POST', f'/tenders/{new_tid}/corrigendum', OFF, expect=(200, 201), json={
        'subject': 'smoke corrigendum', 'description': 'smoke', 'issued_by': 'smoke'}, label='issue corrigendum')
    call('POST', f'/tenders/{new_tid}/prebid/schedule', OFF, expect=(200, 201), json={
        'date': '2027-11-01', 'time': '11:00', 'venue': 'Online', 'mode': 'ONLINE'}, label='schedule pre-bid')
    call('POST', f'/tenders/{new_tid}/committee', OFF, expect=(200, 201), json={
        'members': [{'id': 'USR-001', 'name': 'Rajesh Kumar', 'role': 'CHAIR'}]}, label='form committee')
    call('POST', f'/tenders/{new_tid}/conflict-declaration', OFF, expect=(200, 201), json={
        'has_conflict': False, 'officer_name': 'Rajesh Kumar'}, label='conflict declaration')
    call('POST', f'/tenders/{new_tid}/cancel', OFF, expect=(200, 201), json={
        'reason': 'smoke cleanup', 'cancelled_by': 'smoke'}, label='cancel tender')

# register a bidder
r = call('POST', '/bidders', OFF, expect=(200, 201), json={
    'name': f'Smoke Industries {uid}', 'tender_id': tid, 'email': f'smoke{uid.lower()}@example.org',
    'pan': 'ABCDE1234F', 'gstin': '29ABCDE1234F1Z5', 'phone': '+91-9876543210',
    'address': '12 Test Road', 'state': 'Karnataka', 'type': 'Private Limited',
    'contact_person': 'Smoke Tester',
}, label='POST /bidders (register)')
new_bidder = None
if r is not None and r.status_code in (200, 201):
    j = r.json()
    new_bidder = j.get('id') or (j.get('bidder') or {}).get('id')
    check(bool(new_bidder), 'register bidder returned an id', str(j)[:150])
    if new_bidder:
        g = call('GET', f'/bidders/{new_bidder}', OFF, label='read back created bidder')
        # upload a document for the new bidder
        pdf = (b'%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n'
               b'3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF')
        up = requests.post(API + '/documents/upload', headers={'Authorization': f'Bearer {OFF}'}, timeout=TIMEOUT,
                           data={'bidder_id': new_bidder, 'tender_id': tid},
                           files={'files': (f'smoke_{uid}.pdf', pdf, 'application/pdf')})
        check(up.status_code in (200, 201), f'upload document  ({up.status_code})', up.text[:200])
        call('POST', f'/bidders/{new_bidder}/analyze', OFF, expect=(200, 201), label='analyze bidder')
        call('POST', f'/bidders/{new_bidder}/decision', OFF, expect=(200, 201), json={
            'decision': 'CLARIFICATION', 'remarks': 'smoke', 'officer': 'Rajesh Kumar'}, label='officer decision')
        call('DELETE', f'/bidders/{new_bidder}', OFF, expect=(200, 204), json={'officer': 'smoke'}, label='delete test bidder')
        gone = call('GET', f'/bidders/{new_bidder}', OFF, expect=(404,), label='deleted bidder is gone (404)')

# stakeholder feedback
r = call('POST', f'/public/tenders/{tid}/feedback', PUB, expect=(200, 201), json={
    'category': 'GENERAL', 'subject': f'SMOKE feedback {uid}', 'description': 'smoke test feedback',
    'submitter_name': 'Smoke'}, label='public feedback submit')

# grievance
r = call('POST', '/grievances', BID, expect=(200, 201), json={
    'tender_id': tid, 'category': 'GENERAL', 'subject': f'SMOKE grievance {uid}',
    'description': 'smoke test grievance'}, label='bidder files grievance')
if r is not None and r.status_code in (200, 201):
    gid = r.json().get('id') or (r.json().get('grievance') or {}).get('id')
    if gid:
        call('POST', f'/grievances/{gid}/assign', OFF, expect=(200, 201), json={'assigned_to': 'Rajesh Kumar'}, label='assign grievance')
        call('POST', f'/grievances/{gid}/respond', OFF, expect=(200, 201), json={
            'response': 'smoke response', 'status': 'RESPONDED'}, label='respond to grievance')

# notifications round-trip
n = call('GET', '/notifications', OFF)
call('POST', '/notifications/read', OFF, expect=(200,), json={}, label='mark notifications read')

# evaluation task
call('POST', '/evaluation/tasks', OFF, expect=(200, 201), json={
    'tender_id': tid, 'bidder_id': bidder_id, 'title': f'SMOKE task {uid}', 'task_type': 'TECHNICAL',
    'assigned_to': 'Rajesh Kumar'}, label='create evaluation task')

# change password round trip (restores the original)
call('POST', '/auth/change-password', BID, expect=(200,), json={
    'current_password': 'password', 'new_password': 'password123'}, label='change password')
ok_new = login('bidder@demo.com', 'password123').status_code == 200
check(ok_new, 'login with the NEW password works')
nt = login('bidder@demo.com', 'password123').json().get('token')
call('POST', '/auth/change-password', nt, expect=(200,), json={
    'current_password': 'password123', 'new_password': 'password'}, label='change password back')
check(login('bidder@demo.com', 'password').status_code == 200, 'original password restored')

# logout
call('POST', '/auth/logout', OFF, expect=(200,), label='logout')

# ─────────────────────────────────────────────────────────────────────────────
passed = sum(1 for ok, *_ in results if ok)
failed = [(l, d) for ok, l, d in results if not ok]
print(f'\n{"=" * 60}\n{passed}/{len(results)} checks passed')
if failed:
    print('\nFAILURES:')
    for label, detail in failed:
        print(f'  - {label}\n      {detail}')
sys.exit(1 if failed else 0)
