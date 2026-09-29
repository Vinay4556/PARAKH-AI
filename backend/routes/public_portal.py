"""
Public / Stakeholder Portal Routes - PARAKH AI
Public-facing APIs — NO confidential bidder information.
"""
import json
import os
from datetime import datetime
from flask import Blueprint, jsonify, request
from config import DATA_DIR
from services.tender_service import get_all_tenders, get_tender_by_id

public_portal_bp = Blueprint('public_portal', __name__)

# Public timeline for the demo tender
PUBLIC_TIMELINE = {
    "GEM-DEMO-2026-001": [
        {"stage": "Tender Published", "date": "2026-08-01", "status": "COMPLETED", "public_note": "Tender GEM-DEMO-2026-001 published on GeM portal."},
        {"stage": "Pre-Bid Meeting", "date": "2026-08-10", "status": "COMPLETED", "public_note": "Pre-bid meeting held. 12 vendors attended."},
        {"stage": "Corrigendum #01", "date": "2026-08-15", "status": "COMPLETED", "public_note": "Corrigendum published — minor clarification on ISO scope."},
        {"stage": "Bid Submission Opens", "date": "2026-08-01", "status": "COMPLETED", "public_note": "Portal open for bid submissions."},
        {"stage": "Bid Submission Closed", "date": "2026-08-25", "status": "COMPLETED", "public_note": "Bid submission deadline passed. 3 bids received."},
        {"stage": "Scrutiny & Document Verification", "date": "2026-08-26", "status": "IN_PROGRESS", "public_note": "Document scrutiny in progress by procurement team."},
        {"stage": "Compliance Evaluation", "date": "2026-09-01", "status": "IN_PROGRESS", "public_note": "AI-assisted compliance verification underway."},
        {"stage": "Technical Evaluation", "date": "2026-09-05", "status": "PENDING", "public_note": "Scheduled to begin 5 Sep 2026.", "expected_date": "2026-09-05"},
        {"stage": "Financial Evaluation", "date": "2026-09-12", "status": "PENDING", "public_note": "Scheduled to begin 12 Sep 2026.", "expected_date": "2026-09-12"},
        {"stage": "Award Decision", "date": "2026-09-20", "status": "PENDING", "public_note": "Expected 20 Sep 2026.", "expected_date": "2026-09-20"},
        {"stage": "Award Published", "date": "2026-09-25", "status": "PENDING", "public_note": "Expected 25 Sep 2026.", "expected_date": "2026-09-25"},
    ]
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


def sanitize_tender(t):
    """Return only public-safe tender fields."""
    return {
        'id': t.get('id'),
        'title': t.get('title'),
        'department': t.get('department'),
        'category': t.get('category', ''),
        'description': t.get('description', ''),
        'estimated_value_display': t.get('estimated_value_display'),
        'submission_deadline': t.get('submission_deadline'),
        'status': t.get('status', 'active'),
        'location': t.get('location', 'Pan India'),
        'created_at': t.get('created_at'),
        'contact_officer': t.get('contact_officer'),
        'bid_count': len(t.get('bidder_ids', [])),
        'requirement_count': len(t.get('requirement_ids', [])),
        'current_stage': _get_current_stage(t.get('id', '')),
    }


def _generate_dynamic_timeline(tender):
    """Generate a procurement timeline from tender dates for any tender."""
    created = tender.get('created_at', '')[:10] if tender.get('created_at') else None
    deadline = tender.get('submission_deadline', '')[:10] if tender.get('submission_deadline') else None

    if not created or not deadline:
        return []

    from datetime import date, timedelta

    try:
        t_start   = datetime.strptime(created,  '%Y-%m-%d').date()
        t_deadline = datetime.strptime(deadline, '%Y-%m-%d').date()
    except ValueError:
        return []

    today = date.today()

    def fmt(d): return d.isoformat()
    def done(d): return 'COMPLETED' if today >= d else 'PENDING'
    def prog(d): return 'IN_PROGRESS' if today >= d else 'PENDING'

    prebid_date     = t_start + timedelta(days=10)
    corr_date       = t_start + timedelta(days=15)
    scrutiny_date   = t_deadline + timedelta(days=1)
    compliance_date = t_deadline + timedelta(days=5)
    tech_date       = t_deadline + timedelta(days=12)
    finance_date    = t_deadline + timedelta(days=19)
    award_dec_date  = t_deadline + timedelta(days=26)
    award_pub_date  = t_deadline + timedelta(days=31)

    def stage_status(d):
        if today > d: return 'COMPLETED'
        if today == d: return 'IN_PROGRESS'
        if today >= d - timedelta(days=3): return 'IN_PROGRESS'
        return 'PENDING'

    return [
        {'stage': 'Tender Published',              'date': fmt(t_start),       'status': 'COMPLETED',                  'public_note': f'Tender {tender["id"]} published on GeM portal.'},
        {'stage': 'Pre-Bid Meeting',               'date': fmt(prebid_date),   'status': stage_status(prebid_date),    'public_note': 'Pre-bid queries and clarification meeting.',        'expected_date': fmt(prebid_date)},
        {'stage': 'Corrigendum / Clarification',   'date': fmt(corr_date),     'status': stage_status(corr_date),      'public_note': f'{len(tender.get("corrigenda", []))} corrigendum(a) issued.',  'expected_date': fmt(corr_date)},
        {'stage': 'Bid Submission Opens',          'date': fmt(t_start),       'status': 'COMPLETED',                  'public_note': 'Portal open for bid submissions.'},
        {'stage': 'Bid Submission Closed',         'date': fmt(t_deadline),    'status': stage_status(t_deadline),     'public_note': f'Bid submission deadline: {deadline}.',            'expected_date': fmt(t_deadline)},
        {'stage': 'Scrutiny & Document Verification', 'date': fmt(scrutiny_date), 'status': stage_status(scrutiny_date), 'public_note': 'Document scrutiny by procurement team.',         'expected_date': fmt(scrutiny_date)},
        {'stage': 'Compliance Evaluation',         'date': fmt(compliance_date), 'status': stage_status(compliance_date), 'public_note': 'AI-assisted compliance verification.',          'expected_date': fmt(compliance_date)},
        {'stage': 'Technical Evaluation',          'date': fmt(tech_date),     'status': stage_status(tech_date),      'public_note': 'Technical committee evaluation.',                  'expected_date': fmt(tech_date)},
        {'stage': 'Financial Evaluation',          'date': fmt(finance_date),  'status': stage_status(finance_date),   'public_note': 'Financial bid opening and L1 determination.',      'expected_date': fmt(finance_date)},
        {'stage': 'Award Decision',                'date': fmt(award_dec_date),'status': stage_status(award_dec_date), 'public_note': 'Procurement Officer award decision.',               'expected_date': fmt(award_dec_date)},
        {'stage': 'Award Published',               'date': fmt(award_pub_date),'status': stage_status(award_pub_date), 'public_note': 'Award order published on GeM portal.',             'expected_date': fmt(award_pub_date)},
    ]


def _get_current_stage(tender_id):
    # Try static timeline first, then dynamic
    tender = get_tender_by_id(tender_id)
    timeline = PUBLIC_TIMELINE.get(tender_id)
    if timeline is None and tender:
        timeline = _generate_dynamic_timeline(tender)
    if not timeline:
        return 'Published'
    in_progress = [s for s in timeline if s['status'] == 'IN_PROGRESS']
    if in_progress:
        return in_progress[-1]['stage']
    completed = [s for s in timeline if s['status'] == 'COMPLETED']
    if completed:
        return completed[-1]['stage']
    return 'Published'


# ── Public Tender List ────────────────────────────────────────
@public_portal_bp.route('/api/public/tenders', methods=['GET'])
def public_tenders():
    tenders = get_all_tenders()

    search     = request.args.get('search',     '').lower().strip()
    category   = request.args.get('category',   '').strip()
    department = request.args.get('department', '').strip()
    status     = request.args.get('status',     '').strip()
    location   = request.args.get('location',   '').strip()
    # value_min / value_max are integers in rupees (optional)
    try:
        value_min = int(request.args.get('value_min', 0))
    except (TypeError, ValueError):
        value_min = 0
    try:
        value_max_raw = request.args.get('value_max')
        value_max = int(value_max_raw) if value_max_raw is not None else None
    except (TypeError, ValueError):
        value_max = None

    result = []
    for t in tenders:
        # keyword search across id, title, department
        if search and \
           search not in t.get('title', '').lower() and \
           search not in t.get('id', '').lower() and \
           search not in t.get('department', '').lower():
            continue
        # category filter
        if category and t.get('category', '') != category:
            continue
        # department filter (case-insensitive)
        if department and t.get('department', '').lower() != department.lower():
            continue
        # status filter
        if status and t.get('status', '') != status:
            continue
        # location filter (substring)
        if location and location.lower() not in t.get('location', '').lower():
            continue
        # value band filter using estimated_value (raw numeric field if present)
        if value_min > 0 or value_max is not None:
            raw_val = t.get('estimated_value', 0) or 0
            try:
                raw_val = float(raw_val)
            except (TypeError, ValueError):
                raw_val = 0
            if raw_val < value_min:
                continue
            if value_max is not None and raw_val >= value_max:
                continue

        result.append(sanitize_tender(t))
    return jsonify(result)


# ── Public Tender Detail ──────────────────────────────────────
@public_portal_bp.route('/api/public/tenders/<tender_id>', methods=['GET'])
def public_tender_detail(tender_id):
    t = get_tender_by_id(tender_id)
    if not t:
        return jsonify({'error': 'Tender not found'}), 404
    return jsonify(sanitize_tender(t))


# ── Public filter metadata (departments, locations, categories) ──
@public_portal_bp.route('/api/public/meta', methods=['GET'])
def public_meta():
    """Return distinct departments, locations, and categories for filter dropdowns."""
    tenders = get_all_tenders()
    departments = sorted({t.get('department', '') for t in tenders if t.get('department')})
    locations   = sorted({t.get('location', '')   for t in tenders if t.get('location')})
    categories  = sorted({t.get('category', '')   for t in tenders if t.get('category')})
    return jsonify({
        'departments': departments,
        'locations':   locations,
        'categories':  categories,
    })


# ── Public Tender Documents ───────────────────────────────────
@public_portal_bp.route('/api/public/tenders/<tender_id>/documents', methods=['GET'])
def public_tender_documents(tender_id):
    """Return only public-cleared documents for a tender.

    Bidder-submitted documents, sealed pricing, and internal reports
    are never returned from this endpoint.
    """
    t = get_tender_by_id(tender_id)
    if not t:
        return jsonify({'error': 'Tender not found'}), 404

    all_docs = load_json('documents.json')

    # Only return documents that are explicitly marked as public
    # and belong to this tender but NOT to a specific bidder.
    public_docs = []
    for d in all_docs:
        if d.get('tender_id') != tender_id:
            continue
        # Never expose documents tied to a specific bidder
        if d.get('bidder_id'):
            continue
        # Only include documents explicitly flagged as public or of a public type
        public_types = {'tender_notice', 'corrigendum', 'pre_bid_minutes', 'award_notice', 'nit'}
        doc_type = (d.get('document_type') or d.get('type') or '').lower().replace(' ', '_')
        if not d.get('is_public', False) and doc_type not in public_types:
            continue
        public_docs.append({
            'id':            d.get('id'),
            'title':         d.get('original_name') or d.get('filename') or 'Document',
            'document_type': d.get('document_type') or d.get('type') or 'Notice',
            'uploaded_at':   d.get('uploaded_at') or d.get('created_at'),
            'pages':         d.get('pages'),
        })

    return jsonify({
        'tender_id':     tender_id,
        'document_count': len(public_docs),
        'documents':     public_docs,
    })


# ── Public Timeline ───────────────────────────────────────────
@public_portal_bp.route('/api/public/tenders/<tender_id>/timeline', methods=['GET'])
def public_timeline(tender_id):
    # Use rich static data for demo tender, dynamic generation for others
    timeline = PUBLIC_TIMELINE.get(tender_id)
    if timeline is None:
        tender = get_tender_by_id(tender_id)
        if not tender:
            return jsonify({'error': 'Tender not found'}), 404
        timeline = _generate_dynamic_timeline(tender)
        if not timeline:
            return jsonify({'error': 'Unable to generate timeline — tender dates missing'}), 422

    today = datetime.now().date()
    enriched = []
    for item in timeline:
        entry = dict(item)
        expected = item.get('expected_date') or item.get('date')
        if item['status'] == 'PENDING' and expected:
            try:
                exp_date = datetime.strptime(expected[:10], '%Y-%m-%d').date()
                entry['delayed'] = today > exp_date
                entry['delay_days'] = (today - exp_date).days if today > exp_date else 0
            except ValueError:
                entry['delayed'] = False
        else:
            entry['delayed'] = False
        enriched.append(entry)

    current = _get_current_stage(tender_id)
    return jsonify({'tender_id': tender_id, 'current_stage': current, 'timeline': enriched})


# ── Submit Feedback ───────────────────────────────────────────
@public_portal_bp.route('/api/public/tenders/<tender_id>/feedback', methods=['POST'])
def submit_feedback(tender_id):
    data = request.get_json() or {}
    if not data.get('subject') or not data.get('description'):
        return jsonify({'error': 'Subject and description are required'}), 400

    feedback = load_json('feedback.json')
    import uuid
    fb_id = f'FB-2026-{str(uuid.uuid4())[:4].upper()}'

    # AI classification (simple rule-based for demo)
    subject_lower = data.get('subject', '').lower()
    desc_lower = data.get('description', '').lower()
    if 'delay' in subject_lower or 'delayed' in desc_lower:
        ai_category = 'Process Concern'
        ai_priority = 'HIGH'
    elif 'document' in subject_lower or 'clarif' in desc_lower:
        ai_category = 'Technical Issue'
        ai_priority = 'MEDIUM'
    elif 'corrupt' in desc_lower or 'fraud' in desc_lower:
        ai_category = 'Integrity Concern'
        ai_priority = 'CRITICAL'
    else:
        ai_category = data.get('category', 'General')
        ai_priority = 'LOW'

    new_fb = {
        'id': fb_id,
        'tender_id': tender_id,
        'submitted_by': data.get('submitted_by', 'Anonymous'),
        'submitter_name': data.get('submitter_name', 'Citizen'),
        'category': data.get('category', 'General'),
        'subject': data.get('subject'),
        'description': data.get('description'),
        'priority': ai_priority,
        'status': 'SUBMITTED',
        'submitted_at': datetime.now().isoformat(),
        'assigned_to': None,
        'public_response': None,
        'internal_notes': None,
        'resolved_at': None,
        'ai_category': ai_category,
        'ai_priority': ai_priority,
        'ai_tender_id': tender_id,
    }
    feedback.append(new_fb)
    save_json('feedback.json', feedback)

    return jsonify({'status': 'submitted', 'feedback_id': fb_id, 'ai_priority': ai_priority}), 201


# ── Get feedback status (stakeholder) ────────────────────────
@public_portal_bp.route('/api/public/feedback', methods=['GET'])
def public_feedback_list():
    tender_id = request.args.get('tender_id')
    submitter = request.args.get('submitted_by')
    feedback = load_json('feedback.json')
    if tender_id:
        feedback = [f for f in feedback if f.get('tender_id') == tender_id]
    if submitter:
        feedback = [f for f in feedback if f.get('submitted_by') == submitter]
    # Return only public-safe fields
    safe = []
    for f in feedback:
        safe.append({
            'id': f['id'],
            'tender_id': f.get('tender_id'),
            'category': f.get('category'),
            'subject': f.get('subject'),
            'status': f.get('status'),
            'submitted_at': f.get('submitted_at'),
            'priority': f.get('priority'),
            'public_response': f.get('public_response'),
            'resolved_at': f.get('resolved_at'),
        })
    return jsonify(sorted(safe, key=lambda x: x.get('submitted_at', ''), reverse=True))


# ── Public stats ──────────────────────────────────────────────
@public_portal_bp.route('/api/public/dashboard', methods=['GET'])
def public_dashboard():
    tenders  = get_all_tenders()
    feedback = load_json('feedback.json')

    active      = [t for t in tenders if t.get('status') in ('active', 'OPEN')]
    evaluation  = [t for t in tenders if t.get('status') in ('evaluation', 'under_evaluation')]
    awarded     = [t for t in tenders if t.get('status') in ('awarded', 'AWARDED')]

    return jsonify({
        'active_tenders':            len(active),
        'tenders_under_evaluation':  len(evaluation) or 1,   # keep demo value ≥ 1
        'completed_awards':          len(awarded),
        'public_notices':            max(len(tenders), 2),
        'recent_tenders':            [sanitize_tender(t) for t in tenders[:3]],
        'pending_feedback':          len([f for f in feedback if f.get('status') == 'SUBMITTED']),
        # Metadata useful for filter dropdowns — avoids a separate /api/public/meta call
        'departments': sorted({t.get('department', '') for t in tenders if t.get('department')}),
        'locations':   sorted({t.get('location',   '') for t in tenders if t.get('location')}),
        'categories':  sorted({t.get('category',   '') for t in tenders if t.get('category')}),
    })
