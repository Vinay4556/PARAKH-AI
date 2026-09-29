"""
Bidder Portal Routes - PARAKH AI
APIs for the bidder/seller-side experience.
Includes: bid submission, draft, withdrawal, modification, versioning, readiness, pre-bid Q&A.
"""
import json
import os
from datetime import datetime, timedelta
from flask import Blueprint, jsonify, request
from config import DATA_DIR
from services.audit_utils import next_audit_id
from services.compliance_service import DEMO_COMPLIANCE
from services.tender_service import get_all_tenders, get_requirements_for_tender, get_tender_by_id
from routes.auth import get_session, require_role

bidder_portal_bp = Blueprint('bidder_portal', __name__)

# --- Readiness data for demo ---
READINESS_DATA = {
    "BID-001": {
        "score": 87,
        "status": "READY_WITH_WARNINGS",
        "items": [
            {"req_id": "REQ-001", "title": "GST Registration", "status": "READY", "message": "GST certificate uploaded and valid."},
            {"req_id": "REQ-002", "title": "PAN Card", "status": "READY", "message": "PAN card uploaded and verified."},
            {"req_id": "REQ-003", "title": "Udyam / MSME", "status": "READY", "message": "Udyam certificate present."},
            {"req_id": "REQ-004", "title": "Minimum Turnover ₹10 Cr", "status": "READY", "message": "Turnover ₹14.8 Crore — meets threshold."},
            {"req_id": "REQ-005", "title": "5 Years Experience", "status": "READY", "message": "11 years experience documented."},
            {"req_id": "REQ-006", "title": "ISO 9001:2015", "status": "WARNING", "message": "Certificate expiry (14-Jan-2025) may have lapsed. Submit renewed certificate."},
            {"req_id": "REQ-007", "title": "EPFO Registration", "status": "READY", "message": "EPFO registration active."},
            {"req_id": "REQ-008", "title": "ESIC Registration", "status": "WARNING", "message": "Entity name mismatch on ESIC document. Clarification may be required."},
            {"req_id": "REQ-009", "title": "OEM Authorization", "status": "WARNING", "message": "OEM letter shows different entity name. Upload revised authorization."},
            {"req_id": "REQ-010", "title": "Make in India Declaration", "status": "READY", "message": "Declaration submitted."},
            {"req_id": "REQ-011", "title": "Non-Blacklisting Declaration", "status": "READY", "message": "Declaration submitted."},
            {"req_id": "REQ-012", "title": "3 Similar Projects ≥ ₹1 Cr", "status": "READY", "message": "3 qualifying projects documented."},
            {"req_id": "REQ-013", "title": "Bank Solvency Certificate", "status": "MISSING", "message": "Mandatory document not uploaded."},
            {"req_id": "REQ-014", "title": "BIS / CE Certificate", "status": "MISSING", "message": "Mandatory document not uploaded."},
            {"req_id": "REQ-019", "title": "EMD ₹24 Lakhs", "status": "READY", "message": "EMD / Bank Guarantee submitted."},
        ],
        "critical_issues": 2,
        "warnings": 3,
        "missing_mandatory": 2,
        "ready_count": 10,
    }
}


def load_json(filename):
    path = os.path.join(DATA_DIR, filename)
    if not os.path.exists(path):
        return []
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_json(filename, data):
    path = os.path.join(DATA_DIR, filename)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def _acting_bidder_id(session):
    """Which bidder is this request about?

    BIDDER  -> always their own organisation from the session (request params
               and body are ignored, so one bidder can't act as another).
    OFFICER -> read-only endpoints only; must name the bidder via ?bidder_id=.
    """
    if (session or {}).get('role') == 'BIDDER':
        return session.get('organization_id')
    return request.args.get('bidder_id')


def _deadline_passed(tender):
    """True if the tender's submission deadline (date part) is in the past."""
    deadline_str = (tender or {}).get('submission_deadline') or ''
    try:
        deadline = datetime.strptime(deadline_str[:10], '%Y-%m-%d').date()
    except ValueError:
        return False
    return datetime.now().date() > deadline



# ── Bidder Dashboard ──────────────────────────────────────────
@bidder_portal_bp.route('/api/bidder/dashboard', methods=['GET'])
@require_role('BIDDER', 'OFFICER')
def bidder_dashboard():
    # Prefer session org_id (from login) over query param
    session = get_session(request)
    bidder_id = _acting_bidder_id(session)
    if not bidder_id:
        return jsonify({'error': 'bidder_id is required'}), 400

    bidders = load_json('bidders.json')
    bidder = next((b for b in bidders if b['id'] == bidder_id), None)
    if not bidder:
        return jsonify({'error': 'Bidder not found'}), 404

    bids = [b for b in load_json('bids.json') if b['bidder_id'] == bidder_id]
    clarifications = [c for c in load_json('clarifications.json') if c['bidder_id'] == bidder_id and c['status'] == 'PENDING_BIDDER']
    tenders = get_all_tenders()
    readiness = READINESS_DATA.get(bidder_id, {})

    return jsonify({
        'bidder': bidder,
        'stats': {
            'active_applications': len(bids),
            'submitted_bids': len([b for b in bids if b['status'] not in ('DRAFT',)]),
            'clarifications_pending': len(clarifications),
            'bid_readiness': readiness.get('score', 0),
            'compliance_score': bidder.get('compliance_score', 0),
        },
        'recent_bids': bids[:5],
        'clarifications_required': clarifications,
        'available_tenders': len(tenders),
        'readiness_summary': readiness,
    })


# ── Tender Discovery ──────────────────────────────────────────
@bidder_portal_bp.route('/api/bidder/tenders', methods=['GET'])
@require_role('BIDDER', 'OFFICER')
def bidder_tender_list():
    tenders = get_all_tenders()
    category = request.args.get('category')
    search = request.args.get('search', '').lower()

    result = []
    for t in tenders:
        if category and t.get('category') != category:
            continue
        if search and search not in t.get('title', '').lower() and search not in t.get('id', '').lower():
            continue
        result.append({
            'id': t['id'],
            'title': t['title'],
            'department': t['department'],
            'category': t.get('category', ''),
            'estimated_value_display': t.get('estimated_value_display', ''),
            'submission_deadline': t.get('submission_deadline'),
            'status': t.get('status', 'active'),
            'location': t.get('location', 'Pan India'),
            'requirement_count': len(t.get('requirement_ids', [])),
            'bidder_count': len(t.get('bidder_ids', [])),
        })
    return jsonify(result)


# ── Bid Readiness ─────────────────────────────────────────────
@bidder_portal_bp.route('/api/bidder/readiness', methods=['GET'])
@require_role('BIDDER', 'OFFICER')
def bid_readiness():
    session = get_session(request)
    bidder_id = _acting_bidder_id(session)
    if not bidder_id:
        return jsonify({'error': 'bidder_id is required'}), 400
    tender_id = request.args.get('tender_id', 'GEM-DEMO-2026-001')

    # Use static data for demo seed bidders (BID-001/002/003) to ensure rich demo experience
    if bidder_id in READINESS_DATA:
        readiness = READINESS_DATA[bidder_id]
        return jsonify({'tender_id': tender_id, 'bidder_id': bidder_id, **readiness})

    # Dynamic readiness: compute from uploaded documents vs requirements
    return _compute_readiness_dynamic(bidder_id, tender_id)


def _compute_readiness_dynamic(bidder_id, tender_id):
    """Compute bid readiness by matching uploaded document classifications
    against each requirement's expected document types."""
    from services.document_service import get_documents_for_bidder

    requirements = get_requirements_for_tender(tender_id)
    documents = get_documents_for_bidder(bidder_id)

    # Build a set of document classifications uploaded by this bidder
    doc_types = set()
    for doc in documents:
        cls = (doc.get('classification') or '').upper()
        if cls:
            doc_types.add(cls)

    # Mapping from requirement category keywords → expected doc types
    REQ_TO_DOC_MAP = {
        'gst':         ['GST'],
        'pan':         ['PAN'],
        'udyam':       ['UDYAM'],
        'turnover':    ['FINANCIAL'],
        'experience':  ['EXPERIENCE'],
        'iso 9001':    ['ISO9001', 'ISO'],
        'epfo':        ['EPFO'],
        'esic':        ['ESIC'],
        'oem':         ['OEM'],
        'make in india': ['DECLARATION'],
        'blacklist':   ['DECLARATION'],
        'project':     ['EXPERIENCE'],
        'solvency':    ['FINANCIAL'],
        'bis':         ['BIS_CE'],
        'iso 27001':   ['ISO27001', 'ISO'],
        'manpower':    ['EPFO'],
        'nabl':        ['NABL'],
        'emd':         ['DECLARATION'],
    }

    items = []
    ready_count = 0
    warning_count = 0
    missing_count = 0
    critical_issues = 0

    for req in requirements:
        req_title_lower = req.get('title', '').lower()
        req_desc_lower  = req.get('description', '').lower()
        is_mandatory    = req.get('mandatory', True)

        # Find which doc types satisfy this requirement
        expected_types = []
        for keyword, types in REQ_TO_DOC_MAP.items():
            if keyword in req_title_lower or keyword in req_desc_lower:
                expected_types.extend(types)

        # Check if any uploaded doc matches
        matched = any(t in doc_types for t in expected_types) if expected_types else len(documents) > 0

        if matched:
            status  = 'READY'
            message = f'Document found in uploaded set.'
            ready_count += 1
        elif is_mandatory:
            status  = 'MISSING'
            message = f'Mandatory document not found. Please upload the required {req.get("title", "document")}.'
            missing_count += 1
            critical_issues += 1
        else:
            status  = 'WARNING'
            message = f'Optional document not uploaded. Recommended for a stronger bid.'
            warning_count += 1

        items.append({
            'req_id':  req.get('id'),
            'title':   req.get('title', req.get('id')),
            'status':  status,
            'message': message,
        })

    total = len(items) if items else 1
    ready_weight = ready_count
    warn_weight  = warning_count * 0.5
    score = round(((ready_weight + warn_weight) / total) * 100)

    if missing_count == 0 and warning_count == 0:
        overall_status = 'READY'
    elif missing_count == 0:
        overall_status = 'READY_WITH_WARNINGS'
    elif missing_count <= 2:
        overall_status = 'NEEDS_ATTENTION'
    else:
        overall_status = 'NOT_READY'

    return jsonify({
        'tender_id':        tender_id,
        'bidder_id':        bidder_id,
        'score':            score,
        'status':           overall_status,
        'items':            items,
        'critical_issues':  critical_issues,
        'warnings':         warning_count,
        'missing_mandatory': missing_count,
        'ready_count':      ready_count,
    })


# ── My Bids ───────────────────────────────────────────────────
@bidder_portal_bp.route('/api/bidder/bids', methods=['GET'])
@require_role('BIDDER', 'OFFICER')
def my_bids():
    session = get_session(request)
    bidder_id = _acting_bidder_id(session)
    if not bidder_id:
        return jsonify({'error': 'bidder_id is required'}), 400
    bids = [b for b in load_json('bids.json') if b['bidder_id'] == bidder_id]
    return jsonify(bids)


# ── Clarifications for bidder ─────────────────────────────────
@bidder_portal_bp.route('/api/bidder/clarifications', methods=['GET'])
@require_role('BIDDER', 'OFFICER')
def bidder_clarifications():
    session = get_session(request)
    bidder_id = _acting_bidder_id(session)
    if not bidder_id:
        return jsonify({'error': 'bidder_id is required'}), 400
    clarifications = [c for c in load_json('clarifications.json') if c['bidder_id'] == bidder_id]
    return jsonify(sorted(clarifications, key=lambda x: x.get('requested_at', ''), reverse=True))


@bidder_portal_bp.route('/api/bidder/clarifications/<clarification_id>/respond', methods=['POST'])
@require_role('BIDDER')
def respond_clarification(clarification_id):
    data = request.get_json(silent=True) or {}
    response_text = data.get('response', '')
    if not isinstance(response_text, str) or not response_text.strip():
        return jsonify({'error': 'Response text required'}), 400
    response_text = response_text.strip()

    clarifications = load_json('clarifications.json')
    clr = next((c for c in clarifications if c['id'] == clarification_id), None)
    if not clr:
        return jsonify({'error': 'Clarification not found'}), 404
    if clr.get('bidder_id') != get_session(request).get('organization_id'):
        return jsonify({'error': 'Unauthorized — this clarification was not addressed to you'}), 403

    for c in clarifications:
        if c['id'] == clarification_id:
            c['response'] = response_text
            c['responded_at'] = datetime.now().isoformat()
            c['status'] = 'PENDING_OFFICER'
    save_json('clarifications.json', clarifications)

    # Audit trail
    audit = load_json('audit.json')
    audit.append({
        'id': next_audit_id(audit),
        'timestamp': datetime.now().isoformat(),
        'actor': clr.get('bidder_id', 'Bidder'),
        'action': 'Clarification Response Submitted',
        'detail': f'Bidder responded to clarification: {clr.get("subject", "")}',
        'tender_id': clr.get('tender_id'),
        'bidder_id': clr.get('bidder_id'),
        'severity': 'info',
    })
    save_json('audit.json', audit)

    return jsonify({'status': 'submitted', 'clarification_id': clarification_id})


# ── Submit bid (or save as DRAFT) ────────────────────────────
@bidder_portal_bp.route('/api/bidder/submit-bid', methods=['POST'])
@require_role('BIDDER')
def submit_bid():
    data = request.get_json(silent=True) or {}
    session = get_session(request)
    # The bidder is ALWAYS the logged-in organisation — never trust the body.
    bidder_id = session.get('organization_id')
    if not bidder_id:
        return jsonify({'error': 'Your account is not linked to a bidder organisation'}), 403
    tender_id = data.get('tender_id')
    incoming_status = data.get('status', 'SUBMITTED')  # DRAFT or SUBMITTED

    import uuid
    from datetime import timedelta

    if incoming_status not in ('DRAFT', 'SUBMITTED'):
        return jsonify({'error': "status must be 'DRAFT' or 'SUBMITTED'"}), 400
    if not tender_id or not isinstance(tender_id, str):
        return jsonify({'error': 'tender_id is required'}), 400

    tender = get_tender_by_id(tender_id)
    if not tender:
        return jsonify({'error': f'Tender {tender_id} not found'}), 404
    if str(tender.get('status', '')).upper() in ('CANCELLED', 'CLOSED', 'AWARDED'):
        return jsonify({'error': f'Tender {tender_id} is {str(tender.get("status")).lower()} and no longer accepts bids'}), 400
    if incoming_status == 'SUBMITTED' and _deadline_passed(tender):
        return jsonify({'error': 'Bid submission is closed — the submission deadline has passed'}), 400

    try:
        price = float(data.get('quoted_price', 0) or 0)
        int(data.get('validity_period_days', 120))
        int(data.get('delivery_period_days', 90))
    except (TypeError, ValueError):
        return jsonify({'error': 'quoted_price, validity_period_days and delivery_period_days must be numbers'}), 400
    if price != price or price < 0:
        return jsonify({'error': 'quoted_price cannot be negative'}), 400
    if incoming_status == 'SUBMITTED' and price <= 0:
        return jsonify({'error': 'A quoted price greater than zero is required to submit a bid'}), 400

    bids = load_json('bids.json')
    # A bid that is already in play (anything except a draft or a withdrawn bid)
    # blocks a new submission for the same bidder + tender.
    existing = next(
        (b for b in bids if b['bidder_id'] == bidder_id
         and b['tender_id'] == tender_id
         and b.get('status') not in ('DRAFT', 'WITHDRAWN')),
        None
    )
    if existing:
        return jsonify({
            'error': (f"You have already submitted bid {existing['id']} for this tender. "
                      f"Use 'Modify Bid' to change it."),
            'status': 'already_submitted', 'bid_id': existing['id'],
        }), 409

    # Check if a DRAFT already exists — update it instead of creating new
    draft = next(
        (b for b in bids if b['bidder_id'] == bidder_id
         and b['tender_id'] == tender_id
         and b.get('status') == 'DRAFT'),
        None
    )

    # Compute validity expiry
    validity_days = int(data.get('validity_period_days', 120))
    validity_expires = (datetime.now() + timedelta(days=validity_days)).date().isoformat()

    bid_fields = {
        'tender_id': tender_id,
        'bidder_id': bidder_id,
        'bidder_name': session.get('organization_name') or data.get('bidder_name', 'Unknown Bidder'),
        'status': incoming_status,
        'last_updated': datetime.now().isoformat(),
        'compliance_score': None,
        'risk_level': None,
        'technical_status': 'PENDING',
        'financial_status': 'PENDING',
        'clarifications': 0,
        'documents_count': data.get('documents_count', 0),
        # ── Financial bid fields ──────────────────────────────
        'quoted_price': data.get('quoted_price', 0),
        'price_display': _format_price(data.get('quoted_price', 0)),
        'price_breakdown': data.get('price_breakdown', {}),
        'delivery_period_days': data.get('delivery_period_days', 90),
        'payment_terms': data.get('payment_terms', '30 days post acceptance'),
        'validity_period_days': validity_days,
        'validity_expires_at': validity_expires,
        'emd_reference': data.get('emd_reference', ''),
        'emd_bank': data.get('emd_bank', ''),
        'emd_amount': data.get('emd_amount', 0),
        'financial_remarks': data.get('financial_remarks', ''),
        # two-envelope: keep sealed unless this tender already had financial bids opened
        'financial_bid_opened': any(
            b.get('financial_bid_opened') and b.get('tender_id') == tender_id
            for b in bids
        ),
    }

    if draft:
        # Update existing draft
        for b in bids:
            if b['id'] == draft['id']:
                b.update(bid_fields)
                if incoming_status == 'SUBMITTED':
                    b['submitted_at'] = datetime.now().isoformat()
                # Re-check financial_bid_opened in case officer opened bids
                # between when the draft was saved and now
                b['financial_bid_opened'] = bid_fields['financial_bid_opened']
        bid_id = draft['id']
    else:
        bid_id = f'BID-SUB-{str(uuid.uuid4())[:6].upper()}'
        bid_fields['id'] = bid_id
        bid_fields['submitted_at'] = datetime.now().isoformat() if incoming_status == 'SUBMITTED' else None
        bids.append(bid_fields)

    save_json('bids.json', bids)

    if incoming_status == 'SUBMITTED':
        audit = load_json('audit.json')
        audit.append({
            'id': next_audit_id(audit),
            'timestamp': datetime.now().isoformat(),
            'actor': session.get('organization_name') or data.get('bidder_name', 'Bidder'),
            'action': 'Bid Submitted',
            'detail': (
                f'Bid {bid_id} submitted for tender {tender_id}. '
                f'Quoted: {_format_price(data.get("quoted_price", 0))}. '
                f'Delivery: {data.get("delivery_period_days", 90)} days.'
            ),
            'tender_id': tender_id,
            'bidder_id': bidder_id,
            'severity': 'info',
        })
        save_json('audit.json', audit)

    saved_bid = next((b for b in bids if b['id'] == bid_id), bid_fields)
    return jsonify({
        'status': 'draft_saved' if incoming_status == 'DRAFT' else 'submitted',
        'bid_id': bid_id,
        'bid': saved_bid,
    })


def _format_price(price):
    """Helper: format price as ₹X.XX Cr / ₹X.XX L string."""
    try:
        p = float(price)
        if p >= 10_000_000:
            return f'₹{p / 10_000_000:.2f} Cr'
        if p >= 100_000:
            return f'₹{p / 100_000:.2f} L'
        return f'₹{p:,.0f}'
    except (TypeError, ValueError):
        return '—'


# ── Bid Withdrawal ─────────────────────────────────────────────
@bidder_portal_bp.route('/api/bids/<bid_id>/withdraw', methods=['POST'])
@require_role('BIDDER')
def withdraw_bid(bid_id):
    """Bidder withdraws a bid before deadline."""
    data = request.get_json(silent=True) or {}
    session = get_session(request)
    bidder_id = session.get('organization_id')
    reason = str(data.get('reason') or '').strip()

    bids = load_json('bids.json')
    bid = next((b for b in bids if b['id'] == bid_id), None)
    if not bid:
        return jsonify({'error': 'Bid not found'}), 404
    if bid.get('bidder_id') != bidder_id:
        return jsonify({'error': 'Unauthorized — this bid does not belong to you'}), 403

    # Server-side deadline check
    tender = get_tender_by_id(bid.get('tender_id', ''))
    if tender:
        deadline_str = tender.get('submission_deadline', '')
        try:
            deadline = datetime.strptime(deadline_str[:10], '%Y-%m-%d').date()
            if datetime.now().date() > deadline:
                return jsonify({'error': 'Bid withdrawal is no longer allowed — submission deadline has passed'}), 400
        except ValueError:
            pass

    terminal_states = ('AWARDED', 'DISQUALIFIED', 'WITHDRAWN', 'CANCELLED')
    if bid.get('status') in terminal_states:
        return jsonify({'error': f'Cannot withdraw bid in status: {bid["status"]}'}), 400

    for b in bids:
        if b['id'] == bid_id:
            b['status'] = 'WITHDRAWN'
            b['withdrawn_at'] = datetime.now().isoformat()
            b['withdrawal_reason'] = reason
            b['last_updated'] = datetime.now().isoformat()

    save_json('bids.json', bids)

    audit = load_json('audit.json')
    audit.append({
        'id': next_audit_id(audit),
        'timestamp': datetime.now().isoformat(),
        'actor': bidder_id,
        'action': 'BID_WITHDRAWN',
        'detail': f'Bid {bid_id} withdrawn. Reason: {reason or "Not specified"}',
        'tender_id': bid.get('tender_id'),
        'bidder_id': bidder_id,
        'severity': 'warning',
    })
    save_json('audit.json', audit)

    return jsonify({'status': 'withdrawn', 'bid_id': bid_id})


# ── Bid Modification ───────────────────────────────────────────
@bidder_portal_bp.route('/api/bids/<bid_id>/modify', methods=['POST'])
@require_role('BIDDER')
def modify_bid(bid_id):
    """Bidder modifies a submitted bid before deadline. Creates a new version."""
    import uuid
    data = request.get_json(silent=True) or {}
    session = get_session(request)
    bidder_id = session.get('organization_id')

    bids = load_json('bids.json')
    bid = next((b for b in bids if b['id'] == bid_id), None)
    if not bid:
        return jsonify({'error': 'Bid not found'}), 404
    if bid.get('bidder_id') != bidder_id:
        return jsonify({'error': 'Unauthorized'}), 403

    # Deadline check
    tender = get_tender_by_id(bid.get('tender_id', ''))
    if tender:
        deadline_str = tender.get('submission_deadline', '')
        try:
            deadline = datetime.strptime(deadline_str[:10], '%Y-%m-%d').date()
            if datetime.now().date() > deadline:
                return jsonify({'error': 'Bid modification is no longer allowed — deadline passed'}), 400
        except ValueError:
            pass

    if bid.get('status') not in ('SUBMITTED', 'DRAFT'):
        return jsonify({'error': f'Cannot modify bid in status: {bid["status"]}'}), 400

    # Archive current version
    version_record = {
        **{k: v for k, v in bid.items() if k != 'versions'},
        'archived_at': datetime.now().isoformat(),
        'version': len(bid.get('versions', [])) + 1,
    }

    try:
        validity_days = int(data.get('validity_period_days', bid.get('validity_period_days', 120)))
        if 'quoted_price' in data and float(data['quoted_price']) <= 0:
            return jsonify({'error': 'quoted_price must be greater than zero'}), 400
    except (TypeError, ValueError):
        return jsonify({'error': 'quoted_price and validity_period_days must be numbers'}), 400
    validity_expires = (datetime.now() + timedelta(days=validity_days)).date().isoformat()

    # Apply modifications
    for b in bids:
        if b['id'] == bid_id:
            b.setdefault('versions', []).append(version_record)
            b['version_number'] = len(b['versions'])
            b['last_updated'] = datetime.now().isoformat()
            b['status'] = 'SUBMITTED'
            b['modified_at'] = datetime.now().isoformat()
            # Update financial fields if provided
            for field in ['quoted_price', 'price_breakdown', 'delivery_period_days',
                          'payment_terms', 'emd_reference', 'emd_bank', 'emd_amount',
                          'financial_remarks']:
                if field in data:
                    b[field] = data[field]
            if 'quoted_price' in data:
                b['price_display'] = _format_price(data['quoted_price'])
            b['validity_period_days'] = validity_days
            b['validity_expires_at'] = validity_expires

    save_json('bids.json', bids)

    audit = load_json('audit.json')
    audit.append({
        'id': next_audit_id(audit),
        'timestamp': datetime.now().isoformat(),
        'actor': bidder_id,
        'action': 'BID_MODIFIED',
        'detail': f'Bid {bid_id} modified. Version: {version_record["version"]}',
        'tender_id': bid.get('tender_id'),
        'bidder_id': bidder_id,
        'severity': 'info',
    })
    save_json('audit.json', audit)

    updated = next((b for b in bids if b['id'] == bid_id), {})
    return jsonify({'status': 'modified', 'bid_id': bid_id, 'version': updated.get('version_number', 1), 'bid': updated})


# ── Bid Versions ──────────────────────────────────────────────
@bidder_portal_bp.route('/api/bids/<bid_id>/versions', methods=['GET'])
@require_role('BIDDER', 'OFFICER')
def bid_versions(bid_id):
    """Get version history of a bid. Officer sees all; bidder sees own."""
    session = get_session(request)
    bidder_id = (session or {}).get('organization_id')
    role = (session or {}).get('role', '')

    bids = load_json('bids.json')
    bid = next((b for b in bids if b['id'] == bid_id), None)
    if not bid:
        return jsonify({'error': 'Bid not found'}), 404

    if role != 'OFFICER' and bid.get('bidder_id') != bidder_id:
        return jsonify({'error': 'Unauthorized'}), 403

    versions = bid.get('versions', [])
    return jsonify({
        'bid_id': bid_id,
        'current_version': bid.get('version_number', 1),
        'total_versions': len(versions) + 1,
        'versions': versions,
        'current': {k: v for k, v in bid.items() if k != 'versions'},
    })
