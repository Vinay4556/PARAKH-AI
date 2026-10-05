"""
Officer Portal Extended Routes - PARAKH AI
Evaluation tasks, clarifications management, feedback center, leaderboard.
"""
import json
import os
from datetime import datetime
from flask import Blueprint, jsonify, request
from config import DATA_DIR
from services.audit_utils import next_audit_id
from routes.auth import require_role, get_session

officer_portal_bp = Blueprint('officer_portal', __name__)


from database.db_utils import load_cached as load_json, save_cached as save_json


# ── Evaluation Tasks ──────────────────────────────────────────
@officer_portal_bp.route('/api/evaluation/tasks', methods=['GET'])
@require_role('OFFICER')
def get_tasks():
    tender_id = request.args.get('tender_id')
    status = request.args.get('status')
    tasks = load_json('evaluation_tasks.json')
    if tender_id:
        tasks = [t for t in tasks if t.get('tender_id') == tender_id]
    if status:
        tasks = [t for t in tasks if t.get('status') == status]
    return jsonify(sorted(tasks, key=lambda x: x.get('created_at', ''), reverse=True))


@officer_portal_bp.route('/api/evaluation/tasks', methods=['POST'])
@require_role('OFFICER')
def create_task():
    data = request.get_json() or {}
    tasks = load_json('evaluation_tasks.json')
    import uuid
    task = {
        'id': f'TASK-{str(uuid.uuid4())[:6].upper()}',
        'tender_id': data.get('tender_id'),
        'bid_id': data.get('bid_id'),
        'bidder_id': data.get('bidder_id'),
        'bidder_name': data.get('bidder_name', ''),
        'task_type': data.get('task_type', 'DOCUMENT_VERIFICATION'),
        'title': data.get('title', ''),
        'assigned_to': data.get('assigned_to', 'Rajesh Kumar'),
        'assigned_to_id': data.get('assigned_to_id', 'USR-001'),
        'priority': data.get('priority', 'MEDIUM'),
        'status': 'NOT_STARTED',
        'created_at': datetime.now().isoformat(),
        'due_date': data.get('due_date'),
        'completed_at': None,
        'comments': data.get('comments'),
    }
    tasks.append(task)
    save_json('evaluation_tasks.json', tasks)
    return jsonify(task), 201


@officer_portal_bp.route('/api/evaluation/tasks/<task_id>', methods=['PUT'])
@require_role('OFFICER')
def update_task(task_id):
    data = request.get_json() or {}
    tasks = load_json('evaluation_tasks.json')
    task = next((t for t in tasks if t['id'] == task_id), None)
    if not task:
        return jsonify({'error': 'Task not found'}), 404
    for t in tasks:
        if t['id'] == task_id:
            t.update({k: v for k, v in data.items() if k != 'id'})
            if data.get('status') == 'COMPLETED' and not t.get('completed_at'):
                t['completed_at'] = datetime.now().isoformat()
    save_json('evaluation_tasks.json', tasks)
    return jsonify(next(t for t in tasks if t['id'] == task_id))


# ── Clarifications (officer side) ─────────────────────────────
@officer_portal_bp.route('/api/officer/clarifications', methods=['GET'])
@require_role('OFFICER')
def officer_clarifications():
    tender_id = request.args.get('tender_id')
    bidder_id = request.args.get('bidder_id')
    clarifications = load_json('clarifications.json')
    if tender_id:
        clarifications = [c for c in clarifications if c.get('tender_id') == tender_id]
    if bidder_id:
        clarifications = [c for c in clarifications if c.get('bidder_id') == bidder_id]
    return jsonify(sorted(clarifications, key=lambda x: x.get('requested_at', ''), reverse=True))


@officer_portal_bp.route('/api/officer/clarifications', methods=['POST'])
@require_role('OFFICER')
def create_clarification():
    data = request.get_json() or {}
    clarifications = load_json('clarifications.json')
    import uuid
    clr = {
        'id': f'CLR-{str(uuid.uuid4())[:6].upper()}',
        'tender_id': data.get('tender_id'),
        'bid_id': data.get('bid_id'),
        'bidder_id': data.get('bidder_id'),
        'requirement_id': data.get('requirement_id'),
        'requested_by': data.get('requested_by', 'Rajesh Kumar'),
        'requested_at': datetime.now().isoformat(),
        'subject': data.get('subject', ''),
        'message': data.get('message', ''),
        'status': 'PENDING_BIDDER',
        'response': None,
        'responded_at': None,
        'resolved_at': None,
        'officer_notes': data.get('officer_notes'),
        'severity': data.get('severity', 'MEDIUM'),
    }
    clarifications.append(clr)
    save_json('clarifications.json', clarifications)

    audit = load_json('audit.json')
    audit.append({
        'id': next_audit_id(audit),
        'timestamp': datetime.now().isoformat(),
        'actor': data.get('requested_by', 'Rajesh Kumar'),
        'action': 'Clarification Requested',
        'detail': f'Officer requested clarification: {clr["subject"]}',
        'tender_id': data.get('tender_id'),
        'bidder_id': data.get('bidder_id'),
        'severity': 'warning',
    })
    save_json('audit.json', audit)
    return jsonify(clr), 201


@officer_portal_bp.route('/api/officer/clarifications/<clr_id>/resolve', methods=['POST'])
@require_role('OFFICER')
def resolve_clarification(clr_id):
    data = request.get_json() or {}
    clarifications = load_json('clarifications.json')
    for c in clarifications:
        if c['id'] == clr_id:
            c['status'] = data.get('status', 'RESOLVED')
            c['officer_notes'] = data.get('officer_notes', '')
            c['resolved_at'] = datetime.now().isoformat()
    save_json('clarifications.json', clarifications)
    return jsonify({'status': 'updated', 'id': clr_id})


# ── Feedback Center (officer) ─────────────────────────────────
@officer_portal_bp.route('/api/officer/feedback', methods=['GET'])
@require_role('OFFICER')
def officer_feedback():
    priority = request.args.get('priority')
    status = request.args.get('status')
    feedback = load_json('feedback.json')
    if priority:
        feedback = [f for f in feedback if f.get('priority') == priority]
    if status:
        feedback = [f for f in feedback if f.get('status') == status]
    return jsonify(sorted(feedback, key=lambda x: x.get('submitted_at', ''), reverse=True))


@officer_portal_bp.route('/api/officer/feedback/<fb_id>/respond', methods=['POST'])
@require_role('OFFICER')
def respond_feedback(fb_id):
    data = request.get_json() or {}
    feedback = load_json('feedback.json')
    fb = next((f for f in feedback if f['id'] == fb_id), None)
    if not fb:
        return jsonify({'error': 'Feedback not found'}), 404
    for f in feedback:
        if f['id'] == fb_id:
            f['public_response'] = data.get('public_response', '')
            f['internal_notes'] = data.get('internal_notes', f.get('internal_notes', ''))
            f['status'] = data.get('status', 'RESOLVED')
            if data.get('status') == 'RESOLVED':
                f['resolved_at'] = datetime.now().isoformat()
    save_json('feedback.json', feedback)

    audit = load_json('audit.json')
    audit.append({
        'id': next_audit_id(audit),
        'timestamp': datetime.now().isoformat(),
        'actor': 'Rajesh Kumar',
        'action': 'Feedback Responded',
        'detail': f'Officer responded to feedback {fb_id}',
        'tender_id': fb.get('tender_id'),
        'bidder_id': None,
        'severity': 'info',
    })
    save_json('audit.json', audit)
    return jsonify({'status': 'responded', 'id': fb_id})


# ── All bids for officer ───────────────────────────────────────
@officer_portal_bp.route('/api/officer/bids', methods=['GET'])
@require_role('OFFICER')
def officer_bids():
    tender_id = request.args.get('tender_id')
    bids = load_json('bids.json')
    if tender_id:
        bids = [b for b in bids if b.get('tender_id') == tender_id]
    # Always return financial fields (price hidden in frontend until opened)
    return jsonify(bids)


# ── Open Financial Bids (Two-Envelope ceremony) ───────────────
@officer_portal_bp.route('/api/officer/bids/open-financial', methods=['POST'])
@require_role('OFFICER')
def open_financial_bids():
    """Officer action: unseal financial bids for a tender. Logged to audit trail."""
    tender_id = request.args.get('tender_id') or (request.get_json() or {}).get('tender_id')
    if not tender_id:
        return jsonify({'error': 'tender_id required'}), 400

    bids = load_json('bids.json')
    opened = 0
    for b in bids:
        if b.get('tender_id') == tender_id and not b.get('financial_bid_opened'):
            b['financial_bid_opened'] = True
            b['financial_opened_at'] = datetime.now().isoformat()
            opened += 1
    save_json('bids.json', bids)

    audit = load_json('audit.json')
    audit.append({
        'id': next_audit_id(audit),
        'timestamp': datetime.now().isoformat(),
        'actor': 'Procurement Officer',
        'action': 'Financial Bids Opened',
        'detail': (
            f'Officer opened financial bids for tender {tender_id}. '
            f'{opened} bid(s) unsealed. Two-envelope opening ceremony completed.'
        ),
        'tender_id': tender_id,
        'bidder_id': None,
        'severity': 'info',
    })
    save_json('audit.json', audit)

    return jsonify({'status': 'opened', 'tender_id': tender_id, 'bids_opened': opened})


# ── Advance Bid Stage ─────────────────────────────────────────
BID_STAGE_SEQUENCE = [
    'SUBMITTED',
    'COMPLIANCE_REVIEW',
    'TECHNICAL_EVALUATION',
    'FINANCIAL_EVALUATION',
    'AWARDED',
]

@officer_portal_bp.route('/api/officer/bids/<bid_id>/advance-stage', methods=['POST'])
@require_role('OFFICER')
def advance_bid_stage(bid_id):
    """Move a bid forward one lifecycle stage."""
    data = request.get_json() or {}
    bids = load_json('bids.json')
    bid = next((b for b in bids if b['id'] == bid_id), None)
    if not bid:
        return jsonify({'error': 'Bid not found'}), 404

    current = bid.get('status', 'SUBMITTED')
    try:
        idx = BID_STAGE_SEQUENCE.index(current)
    except ValueError:
        return jsonify({'error': f'Cannot advance from status: {current}'}), 400

    if idx >= len(BID_STAGE_SEQUENCE) - 1:
        return jsonify({'error': 'Bid is already at final stage'}), 400

    next_stage = BID_STAGE_SEQUENCE[idx + 1]
    notes = data.get('notes', '')

    for b in bids:
        if b['id'] == bid_id:
            b['status'] = next_stage
            b['last_updated'] = datetime.now().isoformat()
            if next_stage == 'TECHNICAL_EVALUATION':
                b['technical_status'] = 'IN_PROGRESS'
            elif next_stage == 'FINANCIAL_EVALUATION':
                b['technical_status'] = 'COMPLETED'
                b['financial_status'] = 'IN_PROGRESS'
            elif next_stage == 'AWARDED':
                b['financial_status'] = 'COMPLETED'
    save_json('bids.json', bids)

    audit = load_json('audit.json')
    audit.append({
        'id': next_audit_id(audit),
        'timestamp': datetime.now().isoformat(),
        'actor': data.get('officer', 'Procurement Officer'),
        'action': f'Bid Stage Advanced: {current} → {next_stage}',
        'detail': (
            f'Bid {bid_id} ({bid.get("bidder_name", "")}) advanced to {next_stage}. '
            + (f'Notes: {notes}' if notes else '')
        ),
        'tender_id': bid.get('tender_id'),
        'bidder_id': bid.get('bidder_id'),
        'severity': 'info',
    })
    save_json('audit.json', audit)

    return jsonify({
        'bid_id': bid_id,
        'previous_stage': current,
        'current_stage': next_stage,
        'timestamp': datetime.now().isoformat(),
    })


# ── Tender Leaderboard / Bid Comparison ──────────────────────
@officer_portal_bp.route('/api/officer/tenders/<tender_id>/leaderboard', methods=['GET'])
@require_role('OFFICER')
def tender_leaderboard(tender_id):
    """Return compliance leaderboard for all bidders in a tender."""
    from services.scoring_service import get_tender_leaderboard
    bidders = load_json('bidders.json')
    tender_bidders = [b for b in bidders if b.get('tender_id') == tender_id]
    if not tender_bidders:
        return jsonify([])
    bidder_ids = [b['id'] for b in tender_bidders]
    leaderboard = get_tender_leaderboard(tender_id, bidder_ids)
    # Enrich with bidder details
    for entry in leaderboard:
        bidder = next((b for b in tender_bidders if b['id'] == entry['bidder_id']), {})
        entry['bidder_name'] = bidder.get('name', entry['bidder_id'])
        entry['risk_level'] = bidder.get('risk_level', entry.get('risk_level', 'UNKNOWN'))
        entry['gstin'] = bidder.get('gstin', '')
        entry['officer_decision'] = bidder.get('officer_decision')
    return jsonify(leaderboard)


# ── EMD Verification ──────────────────────────────────────────
EMD_STATUSES = ['VERIFIED', 'PENDING', 'INVALID', 'EXPIRED', 'MISMATCH', 'EXEMPT', 'NOT_SUBMITTED']

@officer_portal_bp.route('/api/bids/<bid_id>/emd/verify', methods=['POST'])
@require_role('OFFICER')
def verify_emd(bid_id):
    """Officer verifies EMD for a bid. AI pre-flags mismatches; officer confirms."""
    data = request.get_json() or {}
    bids = load_json('bids.json')
    bid = next((b for b in bids if b['id'] == bid_id), None)
    if not bid:
        return jsonify({'error': 'Bid not found'}), 404

    # Load tender to compare required EMD
    from services.tender_service import get_tender_by_id
    tender = get_tender_by_id(bid.get('tender_id', ''))
    required_emd = tender.get('emd_amount', 0) if tender else 0
    submitted_emd = bid.get('emd_amount') or 0

    # AI pre-analysis
    ai_flags = []
    auto_status = 'PENDING'

    if not bid.get('emd_reference'):
        ai_flags.append({'type': 'NOT_SUBMITTED', 'detail': 'No EMD reference number provided', 'severity': 'HIGH'})
        auto_status = 'NOT_SUBMITTED'
    elif submitted_emd == 0:
        ai_flags.append({'type': 'AMOUNT_ZERO', 'detail': 'EMD amount is ₹0 in bid', 'severity': 'HIGH'})
        auto_status = 'INVALID'
    elif required_emd > 0 and submitted_emd < required_emd:
        diff = required_emd - submitted_emd
        ai_flags.append({
            'type': 'AMOUNT_MISMATCH',
            'detail': f'Required ₹{required_emd:,.0f}, submitted ₹{submitted_emd:,.0f} (short by ₹{diff:,.0f})',
            'severity': 'HIGH'
        })
        auto_status = 'MISMATCH'
    elif required_emd > 0 and submitted_emd >= required_emd:
        auto_status = 'VERIFIED'

    # Officer override takes precedence
    final_status = data.get('status', auto_status)
    if final_status not in EMD_STATUSES:
        return jsonify({'error': f'Invalid EMD status. Must be one of: {EMD_STATUSES}'}), 400

    emd_record = {
        'status': final_status,
        'required_amount': required_emd,
        'submitted_amount': submitted_emd,
        'reference': bid.get('emd_reference', ''),
        'bank': bid.get('emd_bank', ''),
        'verified_by': data.get('verified_by', 'Procurement Officer'),
        'verified_at': datetime.now().isoformat(),
        'officer_notes': data.get('officer_notes', ''),
        'ai_flags': ai_flags,
        'ai_suggested_status': auto_status,
        'exemption_category': data.get('exemption_category'),
        'exemption_document': data.get('exemption_document'),
    }

    for b in bids:
        if b['id'] == bid_id:
            b['emd_verification'] = emd_record
            b['emd_status'] = final_status
            b['last_updated'] = datetime.now().isoformat()
    save_json('bids.json', bids)

    audit = load_json('audit.json')
    audit.append({
        'id': next_audit_id(audit),
        'timestamp': datetime.now().isoformat(),
        'actor': data.get('verified_by', 'Procurement Officer'),
        'action': 'EMD_VERIFIED',
        'detail': f'EMD for bid {bid_id} set to {final_status}. AI flags: {len(ai_flags)}.',
        'tender_id': bid.get('tender_id'),
        'bidder_id': bid.get('bidder_id'),
        'severity': 'info' if final_status == 'VERIFIED' else 'warning',
    })
    save_json('audit.json', audit)

    return jsonify({'status': 'recorded', 'bid_id': bid_id, 'emd': emd_record})


# ── Price Analysis ────────────────────────────────────────────
@officer_portal_bp.route('/api/bids/<bid_id>/price-analysis', methods=['POST'])
@require_role('OFFICER')
def price_analysis(bid_id):
    """AI-assisted price reasonableness analysis for a bid."""
    bids = load_json('bids.json')
    bid = next((b for b in bids if b['id'] == bid_id), None)
    if not bid:
        return jsonify({'error': 'Bid not found'}), 404

    from services.tender_service import get_tender_by_id
    tender = get_tender_by_id(bid.get('tender_id', ''))
    estimated_value = tender.get('estimated_value', 0) if tender else 0

    quoted = bid.get('quoted_price', 0)
    if not quoted:
        return jsonify({'error': 'No quoted price on this bid'}), 400

    # Get all bids for this tender for peer comparison
    # NOTE: use `(x or 0)` — quoted_price can be explicitly None on a bid
    # that hasn't been priced yet (e.g. no financial submission), and
    # dict.get()'s default only covers a missing key, not an existing
    # key whose value is None. Comparing None > 0 raises a TypeError.
    all_bids = [b for b in bids
                if b.get('tender_id') == bid.get('tender_id')
                and (b.get('quoted_price') or 0) > 0
                and b.get('status') not in ('WITHDRAWN', 'CANCELLED', 'DRAFT')]
    prices = [b['quoted_price'] for b in all_bids]

    analysis = {}

    # vs Estimated value
    if estimated_value > 0:
        deviation_pct = round((quoted - estimated_value) / estimated_value * 100, 1)
        analysis['vs_estimated'] = {
            'estimated_value': estimated_value,
            'quoted_price': quoted,
            'deviation_pct': deviation_pct,
            'flag': 'ABNORMAL_LOW' if deviation_pct < -40 else
                    'SIGNIFICANTLY_BELOW' if deviation_pct < -20 else
                    'BELOW_ESTIMATE' if deviation_pct < -5 else
                    'WITHIN_RANGE' if deviation_pct <= 10 else
                    'ABOVE_ESTIMATE' if deviation_pct <= 25 else 'ABNORMAL_HIGH',
            'note': f'{abs(deviation_pct)}% {"below" if deviation_pct < 0 else "above"} estimated value.',
        }

    # vs Other bids (peer comparison)
    if len(prices) > 1:
        median_price = sorted(prices)[len(prices) // 2]
        l1_price = min(prices)
        spread = max(prices) - min(prices)
        rank = sorted(prices).index(quoted) + 1
        analysis['vs_peers'] = {
            'total_bids': len(prices),
            'l1_price': l1_price,
            'median_price': median_price,
            'price_spread': spread,
            'this_rank': rank,
            'vs_median_pct': round((quoted - median_price) / median_price * 100, 1),
            'vs_l1_pct': round((quoted - l1_price) / l1_price * 100, 1) if l1_price > 0 else None,
        }

    # Abnormal bid detection
    flags = []
    if 'vs_estimated' in analysis:
        flag = analysis['vs_estimated']['flag']
        if flag == 'ABNORMAL_LOW':
            flags.append({'type': 'ABNORMAL_LOW', 'severity': 'HIGH',
                          'detail': 'Price is more than 40% below estimated value. Verify capability.'})
        elif flag == 'ABNORMAL_HIGH':
            flags.append({'type': 'ABNORMAL_HIGH', 'severity': 'MEDIUM',
                          'detail': 'Price is more than 25% above estimated value. Negotiate or reject.'})

    # Suspiciously identical prices
    if len(prices) > 1 and prices.count(quoted) > 1:
        flags.append({'type': 'IDENTICAL_PRICE', 'severity': 'MEDIUM',
                      'detail': f'Same quoted price found in {prices.count(quoted)} bids — possible collusion.'})

    # Store analysis on bid
    for b in bids:
        if b['id'] == bid_id:
            b['price_analysis'] = {
                **analysis,
                'flags': flags,
                'overall_concern': 'HIGH' if any(f['severity'] == 'HIGH' for f in flags)
                                   else 'MEDIUM' if flags else 'LOW',
                'analyzed_at': datetime.now().isoformat(),
            }
    save_json('bids.json', bids)

    return jsonify({
        'bid_id': bid_id,
        'quoted_price': quoted,
        'analysis': analysis,
        'flags': flags,
        'overall_concern': 'HIGH' if any(f['severity'] == 'HIGH' for f in flags) else 'MEDIUM' if flags else 'LOW',
    })


# ── AI Override ───────────────────────────────────────────────
@officer_portal_bp.route('/api/ai/<entity_type>/<entity_id>/override', methods=['POST'])
@require_role('OFFICER')
def ai_override(entity_type, entity_id):
    """Officer overrides an AI recommendation. Reason is mandatory. Permanently audit-logged."""
    data = request.get_json() or {}
    reason = data.get('reason', '').strip()
    ai_result = data.get('ai_result')
    officer_result = data.get('officer_result')
    officer = data.get('officer', 'Procurement Officer')

    if not reason:
        return jsonify({'error': 'Override reason is mandatory'}), 400
    if not officer_result:
        return jsonify({'error': 'officer_result is required'}), 400

    override_record = {
        'entity_type': entity_type,  # 'bid' | 'requirement' | 'emd' | 'price'
        'entity_id': entity_id,
        'ai_result': ai_result,
        'officer_result': officer_result,
        'reason': reason,
        'officer': officer,
        'overridden_at': datetime.now().isoformat(),
        'field': data.get('field'),
    }

    # Persist override to a dedicated file
    overrides = load_json('ai_overrides.json')
    import uuid as _uuid
    override_record['id'] = f'OVR-{str(_uuid.uuid4())[:6].upper()}'
    overrides.append(override_record)
    save_json('ai_overrides.json', overrides)

    # Also update the bid record if applicable
    if entity_type == 'bid':
        bids = load_json('bids.json')
        for b in bids:
            if b['id'] == entity_id:
                b.setdefault('ai_overrides', []).append(override_record)
        save_json('bids.json', bids)
    elif entity_type == 'compliance':
        # Update compliance.json override marker
        compliance = load_json('compliance.json')
        if isinstance(compliance, dict) and entity_id in compliance:
            compliance[entity_id].setdefault('overrides', []).append(override_record)
        save_json('compliance.json', compliance)

    audit = load_json('audit.json')
    audit.append({
        'id': next_audit_id(audit),
        'timestamp': datetime.now().isoformat(),
        'actor': officer,
        'action': 'AI_OVERRIDE',
        'detail': f'AI result [{ai_result}] overridden to [{officer_result}] for {entity_type}/{entity_id}. Reason: {reason}',
        'tender_id': data.get('tender_id'),
        'bidder_id': data.get('bidder_id'),
        'severity': 'warning',
    })
    save_json('audit.json', audit)

    return jsonify({'status': 'overridden', 'override': override_record})


# ── Technical Evaluation Committee ───────────────────────────
@officer_portal_bp.route('/api/tenders/<tender_id>/committee', methods=['GET'])
@require_role('OFFICER')
def get_committee(tender_id):
    committees = load_json('eval_committees.json')
    committee = next((c for c in committees if c.get('tender_id') == tender_id), None)
    if not committee:
        return jsonify({'tender_id': tender_id, 'members': [], 'scores': [], 'status': 'NOT_FORMED'})
    return jsonify(committee)


@officer_portal_bp.route('/api/tenders/<tender_id>/committee', methods=['POST'])
@require_role('OFFICER')
def form_committee(tender_id):
    """Form or update technical evaluation committee for a tender."""
    data = request.get_json() or {}
    members = data.get('members', [])
    if not members:
        return jsonify({'error': 'At least one committee member is required'}), 400

    committees = load_json('eval_committees.json')

    existing = next((c for c in committees if c.get('tender_id') == tender_id), None)
    import uuid as _uuid
    if existing:
        for c in committees:
            if c['tender_id'] == tender_id:
                c['members'] = members
                c['updated_at'] = datetime.now().isoformat()
        committee = next(c for c in committees if c['tender_id'] == tender_id)
    else:
        committee = {
            'id': f'COM-{str(_uuid.uuid4())[:6].upper()}',
            'tender_id': tender_id,
            'members': members,
            'formed_by': data.get('formed_by', 'Procurement Officer'),
            'formed_at': datetime.now().isoformat(),
            'updated_at': datetime.now().isoformat(),
            'scores': [],
            'status': 'ACTIVE',
            'aggregate_method': data.get('aggregate_method', 'AVERAGE'),
        }
        committees.append(committee)

    save_json('eval_committees.json', committees)
    return jsonify({'status': 'saved', 'committee': committee}), 201


@officer_portal_bp.route('/api/tenders/<tender_id>/committee/score', methods=['POST'])
@require_role('OFFICER')
def submit_committee_score(tender_id):
    """Evaluator submits technical score for a bid."""
    data = request.get_json() or {}
    bid_id = data.get('bid_id')
    evaluator_id = data.get('evaluator_id', 'USR-001')
    score = data.get('score')
    comments = data.get('comments', '')

    if score is None or not (0 <= float(score) <= 100):
        return jsonify({'error': 'Score must be 0–100'}), 400

    committees = load_json('eval_committees.json')
    committee = next((c for c in committees if c.get('tender_id') == tender_id), None)
    if not committee:
        return jsonify({'error': 'No committee found for this tender'}), 404

    score_record = {
        'bid_id': bid_id,
        'evaluator_id': evaluator_id,
        'evaluator_name': data.get('evaluator_name', evaluator_id),
        'score': float(score),
        'comments': comments,
        'submitted_at': datetime.now().isoformat(),
        'immutable': True,
    }

    for c in committees:
        if c['tender_id'] == tender_id:
            # Remove existing score by same evaluator for same bid (replace only — once submitted, truly immutable in prod)
            c['scores'] = [s for s in c.get('scores', [])
                           if not (s['bid_id'] == bid_id and s['evaluator_id'] == evaluator_id)]
            c['scores'].append(score_record)

            # Compute aggregate
            bid_scores = [s['score'] for s in c['scores'] if s['bid_id'] == bid_id]
            method = c.get('aggregate_method', 'AVERAGE')
            if bid_scores:
                if method == 'AVERAGE':
                    aggregate = round(sum(bid_scores) / len(bid_scores), 1)
                elif method == 'MIN':
                    aggregate = min(bid_scores)
                elif method == 'MAX':
                    aggregate = max(bid_scores)
                else:
                    aggregate = round(sum(bid_scores) / len(bid_scores), 1)
                score_record['aggregate'] = aggregate

                # Update bid's technical_score
                bids = load_json('bids.json')
                for b in bids:
                    if b['id'] == bid_id:
                        b['technical_score'] = aggregate
                        b['committee_scores'] = bid_scores
                        b['committee_evaluators'] = len(bid_scores)
                save_json('bids.json', bids)

    save_json('eval_committees.json', committees)

    audit = load_json('audit.json')
    audit.append({
        'id': next_audit_id(audit),
        'timestamp': datetime.now().isoformat(),
        'actor': data.get('evaluator_name', evaluator_id),
        'action': 'TECHNICAL_SCORE_SUBMITTED',
        'detail': f'Score {score}/100 submitted for bid {bid_id} by {evaluator_id}.',
        'tender_id': tender_id,
        'bidder_id': data.get('bidder_id'),
        'severity': 'info',
    })
    save_json('audit.json', audit)

    return jsonify({'status': 'scored', 'score_record': score_record})


# ── MSE / Startup Preference Verification ─────────────────────
@officer_portal_bp.route('/api/bids/<bid_id>/preference/verify', methods=['POST'])
@require_role('OFFICER')
def verify_preference(bid_id):
    """Verify MSE/Startup preference eligibility for a bid."""
    data = request.get_json() or {}
    bids = load_json('bids.json')
    bid = next((b for b in bids if b['id'] == bid_id), None)
    if not bid:
        return jsonify({'error': 'Bid not found'}), 404

    bidders = load_json('bidders.json')
    bidder = next((b for b in bidders if b['id'] == bid.get('bidder_id')), {})

    preference = {
        'mse_eligible': data.get('mse_eligible', False),
        'mse_category': data.get('mse_category'),  # MICRO | SMALL | MEDIUM
        'udyam_number': bidder.get('udyam_no', data.get('udyam_number')),
        'startup_eligible': data.get('startup_eligible', False),
        'startup_recognition': data.get('startup_recognition'),
        'preference_applicable': data.get('preference_applicable', False),
        'preference_type': data.get('preference_type'),  # MSE | STARTUP
        'preference_pct': data.get('preference_pct', 0),
        'verified_by': data.get('verified_by', 'Procurement Officer'),
        'verified_at': datetime.now().isoformat(),
        'officer_notes': data.get('officer_notes', ''),
        'documents_checked': data.get('documents_checked', []),
        'ai_recommendation': data.get('ai_recommendation'),
        'officer_final': data.get('officer_final', data.get('preference_applicable', False)),
    }

    for b in bids:
        if b['id'] == bid_id:
            b['preference_verification'] = preference
    save_json('bids.json', bids)

    audit = load_json('audit.json')
    audit.append({
        'id': next_audit_id(audit),
        'timestamp': datetime.now().isoformat(),
        'actor': data.get('verified_by', 'Procurement Officer'),
        'action': 'PREFERENCE_VERIFIED',
        'detail': f'Preference for bid {bid_id}: MSE={data.get("mse_eligible")}, Startup={data.get("startup_eligible")}',
        'tender_id': bid.get('tender_id'),
        'bidder_id': bid.get('bidder_id'),
        'severity': 'info',
    })
    save_json('audit.json', audit)

    return jsonify({'status': 'verified', 'bid_id': bid_id, 'preference': preference})


# ── OEM / Local Content Verification ─────────────────────────
@officer_portal_bp.route('/api/bids/<bid_id>/local-content/verify', methods=['POST'])
@require_role('OFFICER')
def verify_local_content(bid_id):
    """Record officer verification of local content / Make in India declaration."""
    data = request.get_json() or {}
    bids = load_json('bids.json')
    bid = next((b for b in bids if b['id'] == bid_id), None)
    if not bid:
        return jsonify({'error': 'Bid not found'}), 404

    lc_record = {
        'country_of_origin': data.get('country_of_origin', 'India'),
        'declared_local_content_pct': data.get('declared_local_content_pct', 0),
        'verified_local_content_pct': data.get('verified_local_content_pct', 0),
        'class': data.get('class'),  # CLASS_I | CLASS_II
        'manufacturer': data.get('manufacturer'),
        'supporting_documents': data.get('supporting_documents', []),
        'status': data.get('status', 'NEEDS_REVIEW'),
        # LOCAL_CONTENT_VERIFIED | LOCAL_CONTENT_NEEDS_REVIEW | LOCAL_CONTENT_MISMATCH | DECLARATION_MISSING
        'officer_notes': data.get('officer_notes', ''),
        'verified_by': data.get('verified_by', 'Procurement Officer'),
        'verified_at': datetime.now().isoformat(),
    }

    for b in bids:
        if b['id'] == bid_id:
            b['local_content_verification'] = lc_record
    save_json('bids.json', bids)

    return jsonify({'status': 'verified', 'local_content': lc_record})


@officer_portal_bp.route('/api/bids/<bid_id>/oem/verify', methods=['POST'])
@require_role('OFFICER')
def verify_oem(bid_id):
    """Record OEM / Authorized Dealer verification result."""
    data = request.get_json() or {}
    bids = load_json('bids.json')
    bid = next((b for b in bids if b['id'] == bid_id), None)
    if not bid:
        return jsonify({'error': 'Bid not found'}), 404

    oem_record = {
        'oem_name': data.get('oem_name'),
        'dealer_name': data.get('dealer_name'),
        'product': data.get('product'),
        'model': data.get('model'),
        'auth_date': data.get('auth_date'),
        'auth_validity': data.get('auth_validity'),
        'cert_reference': data.get('cert_reference'),
        'status': data.get('status', 'NEEDS_REVIEW'),
        # VERIFIED | EXPIRED | NAME_MISMATCH | MODEL_MISMATCH | GENERIC | SUSPICIOUS | NOT_SUBMITTED
        'ai_flags': data.get('ai_flags', []),
        'officer_notes': data.get('officer_notes', ''),
        'verified_by': data.get('verified_by', 'Procurement Officer'),
        'verified_at': datetime.now().isoformat(),
    }

    for b in bids:
        if b['id'] == bid_id:
            b['oem_verification'] = oem_record
    save_json('bids.json', bids)

    return jsonify({'status': 'verified', 'oem': oem_record})


# ── Vendor Integrity Check ────────────────────────────────────
@officer_portal_bp.route('/api/vendors/<bidder_id>/integrity', methods=['GET'])
@require_role('OFFICER')
def vendor_integrity(bidder_id):
    """Get vendor integrity status: blacklist, debarment, conflict of interest."""
    bidders = load_json('bidders.json')
    bidder = next((b for b in bidders if b['id'] == bidder_id), None)
    if not bidder:
        return jsonify({'error': 'Bidder not found'}), 404

    vendor_profiles = load_json('vendor_profiles.json')
    profile = next((p for p in vendor_profiles if p.get('bidder_id') == bidder_id), {})

    # Load AI overrides for this bidder
    overrides = load_json('ai_overrides.json')
    bidder_overrides = [o for o in overrides if o.get('bidder_id') == bidder_id or
                        (o.get('entity_type') == 'bid' and o.get('bidder_id') == bidder_id)]

    integrity = {
        'bidder_id': bidder_id,
        'bidder_name': bidder.get('name'),
        'gstin': bidder.get('gstin'),
        'pan': bidder.get('pan'),
        'cin': bidder.get('cin'),
        'blacklist_status': profile.get('blacklisted', False),
        'debarment_status': profile.get('debarment_status', 'CLEAR'),
        # CLEAR | MATCH_FOUND | PENDING_VERIFICATION | EXPIRED_RECORD | NEEDS_REVIEW
        'verification_source': 'MOCK — Demo Mode',
        'last_checked': profile.get('last_integrity_check'),
        'conflict_of_interest': bidder.get('conflict_of_interest', []),
        'ai_overrides_count': len(bidder_overrides),
        'risk_signal': profile.get('risk_signal', 'NORMAL'),
        'notes': profile.get('integrity_notes', ''),
    }

    return jsonify(integrity)


# ── Conflict of Interest Declaration ─────────────────────────
@officer_portal_bp.route('/api/tenders/<tender_id>/conflict-declaration', methods=['POST'])
@require_role('OFFICER')
def conflict_declaration(tender_id):
    """Officer or evaluator declares/denies conflict of interest for a tender."""
    data = request.get_json() or {}
    session = get_session(request)
    actor_id = (session or {}).get('id', data.get('officer_id', 'USR-001'))

    declaration = {
        'tender_id': tender_id,
        'officer_id': actor_id,
        'officer_name': data.get('officer_name', 'Procurement Officer'),
        'has_conflict': data.get('has_conflict', False),
        'conflict_reason': data.get('conflict_reason', ''),
        'action': data.get('action', 'NONE'),  # RECUSE | DISCLOSE | NONE
        'declared_at': datetime.now().isoformat(),
    }

    # Persist
    declarations = load_json('conflict_declarations.json')
    declarations.append(declaration)
    save_json('conflict_declarations.json', declarations)

    severity = 'warning' if data.get('has_conflict') else 'info'
    audit = load_json('audit.json')
    audit.append({
        'id': next_audit_id(audit),
        'timestamp': datetime.now().isoformat(),
        'actor': data.get('officer_name', actor_id),
        'action': 'CONFLICT_DECLARATION',
        'detail': f'Conflict declaration for tender {tender_id}: has_conflict={data.get("has_conflict")}',
        'tender_id': tender_id,
        'bidder_id': None,
        'severity': severity,
    })
    save_json('audit.json', audit)

    return jsonify({'status': 'declared', 'declaration': declaration}), 201


# ── Notifications (In-App) ────────────────────────────────────
@officer_portal_bp.route('/api/notifications', methods=['GET'])
def get_notifications():
    session = get_session(request)
    user_id = (session or {}).get('id', 'USR-001')
    role = (session or {}).get('role', 'OFFICER')

    notifications = load_json('notifications.json')

    # Filter by recipient
    user_notifs = [n for n in notifications if
                   n.get('recipient_id') == user_id or
                   n.get('recipient_role') == role or
                   n.get('broadcast', False)]

    unread = sum(1 for n in user_notifs if not n.get('read', False))
    return jsonify({
        'notifications': sorted(user_notifs, key=lambda x: x.get('created_at', ''), reverse=True)[:50],
        'unread_count': unread,
    })


@officer_portal_bp.route('/api/notifications/read', methods=['POST'])
def mark_notifications_read():
    data = request.get_json() or {}
    notification_ids = data.get('ids', [])  # empty = mark all as read

    session = get_session(request)
    user_id = (session or {}).get('id', 'USR-001')

    notifications = load_json('notifications.json')

    for n in notifications:
        if not notification_ids or n.get('id') in notification_ids:
            if n.get('recipient_id') == user_id or n.get('broadcast'):
                n['read'] = True
                n['read_at'] = datetime.now().isoformat()

    save_json('notifications.json', notifications)
    return jsonify({'status': 'marked_read'})


def _create_notification(recipient_id=None, recipient_role=None, notif_type='INFO',
                         title='', message='', tender_id=None, bid_id=None,
                         priority='NORMAL', broadcast=False):
    """Internal helper to create an in-app notification."""
    import uuid as _uuid
    notifications = load_json('notifications.json')
    notifications.append({
        'id': f'NOTIF-{str(_uuid.uuid4())[:6].upper()}',
        'type': notif_type,
        'title': title,
        'message': message,
        'recipient_id': recipient_id,
        'recipient_role': recipient_role,
        'broadcast': broadcast,
        'tender_id': tender_id,
        'bid_id': bid_id,
        'priority': priority,
        'read': False,
        'created_at': datetime.now().isoformat(),
    })
    save_json('notifications.json', notifications)


# ── Global Procurement Search ─────────────────────────────────
@officer_portal_bp.route('/api/search', methods=['GET'])
def global_search():
    """Role-aware global procurement search."""
    session = get_session(request)
    role = (session or {}).get('role', 'STAKEHOLDER')
    q = (request.args.get('q') or '').lower().strip()

    if not q or len(q) < 2:
        return jsonify({'results': [], 'query': q})

    results = []

    # Tenders
    tenders = load_json('tenders.json') if isinstance(load_json('tenders.json'), list) else []
    for t in tenders:
        if q in (t.get('id') or '').lower() or q in (t.get('title') or '').lower() or q in (t.get('department') or '').lower():
            results.append({
                'type': 'tender',
                'id': t['id'],
                'title': t['title'],
                'subtitle': f"{t.get('department', '')} · {t.get('status', '')}",
                'url': f'/tenders/{t["id"]}',
            })

    # Bidders (officer only)
    if role == 'OFFICER':
        bidders = load_json('bidders.json')
        for b in bidders:
            if (q in (b.get('name') or '').lower() or q in (b.get('gstin') or '').lower() or
                    q in (b.get('pan') or '').lower() or q in (b.get('id') or '').lower() or
                    q in (b.get('udyam_no') or '').lower() or q in (b.get('cin') or '').lower()):
                results.append({
                    'type': 'bidder',
                    'id': b['id'],
                    'title': b['name'],
                    'subtitle': f"GSTIN: {b.get('gstin', '')} · {b.get('id', '')}",
                    'url': f'/bidders/{b["id"]}',
                })

        # Bids
        bids = load_json('bids.json')
        for b in bids:
            if q in (b.get('id') or '').lower() or q in (b.get('bidder_name') or '').lower():
                results.append({
                    'type': 'bid',
                    'id': b['id'],
                    'title': f'Bid {b["id"]}',
                    'subtitle': f"{b.get('bidder_name', '')} · {b.get('status', '')}",
                    'url': f'/bid-comparison?tender={b.get("tender_id", "")}',
                })

        # Contracts
        contracts = load_json('contracts.json')
        for c in contracts:
            if (q in (c.get('id') or '').lower() or q in (c.get('bidder_name') or '').lower() or
                    q in (c.get('contract_reference') or '').lower()):
                results.append({
                    'type': 'contract',
                    'id': c['id'],
                    'title': f'Contract {c["id"]}',
                    'subtitle': f"{c.get('bidder_name', '')} · {c.get('contract_reference', '')}",
                    'url': '/contracts',
                })

    return jsonify({'results': results[:20], 'query': q, 'total': len(results)})
