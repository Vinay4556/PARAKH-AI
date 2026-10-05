"""
Grievance & Representation Routes — PARAKH AI
Bidder representations, technical/financial objections, procurement grievances.
Officer assignment, review, response, escalation.
Public portal shows only public-safe fields.
"""
import json
import os
import uuid
from datetime import datetime
from flask import Blueprint, jsonify, request
from config import DATA_DIR
from services.audit_utils import next_audit_id
from routes.auth import get_session, require_role

grievance_bp = Blueprint('grievance', __name__)

GRIEVANCE_CATEGORIES = [
    'CLARIFICATION', 'TECHNICAL_OBJECTION', 'FINANCIAL_OBJECTION',
    'TENDER_GRIEVANCE', 'PROCESS_COMPLAINT', 'INTEGRITY_CONCERN',
    'DOCUMENT_ISSUE', 'GENERAL',
]

GRIEVANCE_STATUSES = [
    'SUBMITTED', 'UNDER_REVIEW', 'RESPONDED', 'ESCALATED', 'CLOSED', 'REJECTED'
]


from database.db_utils import load_cached as load_json, save_cached as save_json


def _audit(action, detail, tender_id=None, bidder_id=None, actor='System', severity='info'):
    audit = load_json('audit.json')
    audit.append({
        'id': next_audit_id(audit),
        'timestamp': datetime.now().isoformat(),
        'actor': actor, 'action': action, 'detail': detail,
        'tender_id': tender_id, 'bidder_id': bidder_id, 'severity': severity,
    })
    save_json('audit.json', audit)


# ── Submit Grievance (Bidder or Public) ───────────────────────
@grievance_bp.route('/api/grievances', methods=['POST'])
def submit_grievance():
    data = request.get_json(silent=True) or {}
    session = get_session(request)
    # Sessions store the user under 'user_id' (there is no 'id' key), so the old
    # lookup always fell through to 'ANON'.
    submitter_id = (session or {}).get('user_id') or data.get('submitter_id', 'ANON')
    submitter_role = (session or {}).get('role', 'BIDDER')

    subject = data.get('subject')
    description = data.get('description')
    if not isinstance(subject, str) or not subject.strip():
        return jsonify({'error': 'A subject is required'}), 400
    if not isinstance(description, str) or not description.strip():
        return jsonify({'error': 'A description is required'}), 400

    category = data.get('category', 'GENERAL')
    if category not in GRIEVANCE_CATEGORIES:
        category = 'GENERAL'

    grievance = {
        'id': f'GRV-{str(uuid.uuid4())[:6].upper()}',
        'tender_id': data.get('tender_id'),
        'bid_id': data.get('bid_id'),
        # A logged-in bidder always files as their own organisation; the body's bidder_id is
        # only honoured for non-bidder submitters (officer filing on a bidder's behalf).
        'bidder_id': ((session or {}).get('organization_id') if submitter_role == 'BIDDER' and session
                      else data.get('bidder_id')),
        'submitter_id': submitter_id,
        'submitter_name': data.get('submitter_name', 'Anonymous'),
        'submitter_role': submitter_role,
        'category': category,
        'subject': subject.strip(),
        'description': description.strip(),
        'supporting_documents': data.get('supporting_documents', []),
        'priority': data.get('priority', 'MEDIUM'),
        'status': 'SUBMITTED',
        'submitted_at': datetime.now().isoformat(),
        'assigned_to': None,
        'officer_response': None,
        'response_at': None,
        'closed_at': None,
        'escalated_at': None,
        'public_note': None,    # public-safe summary
        'internal_notes': [],
    }

    grievances = load_json('grievances.json')
    grievances.append(grievance)
    save_json('grievances.json', grievances)

    _audit('GRIEVANCE_CREATED',
           f'Grievance {grievance["id"]} submitted: {category} — {grievance["subject"][:80]}',
           tender_id=grievance.get('tender_id'), bidder_id=grievance.get('bidder_id'),
           actor=data.get('submitter_name', submitter_id))

    return jsonify({'status': 'submitted', 'grievance_id': grievance['id'], 'grievance': grievance}), 201


# ── List Grievances (Officer) ─────────────────────────────────
@grievance_bp.route('/api/grievances', methods=['GET'])
@require_role('OFFICER')
def list_grievances():
    tender_id = request.args.get('tender_id')
    status = request.args.get('status')
    category = request.args.get('category')

    grievances = load_json('grievances.json')
    if tender_id:
        grievances = [g for g in grievances if g.get('tender_id') == tender_id]
    if status:
        grievances = [g for g in grievances if g.get('status') == status]
    if category:
        grievances = [g for g in grievances if g.get('category') == category]

    return jsonify(sorted(grievances, key=lambda x: x.get('submitted_at', ''), reverse=True))


# ── Bidder's Own Grievances ───────────────────────────────────
@grievance_bp.route('/api/bidder/grievances', methods=['GET'])
@require_role('BIDDER', 'OFFICER')
def bidder_grievances():
    session = get_session(request)
    bidder_id = session.get('organization_id') if session.get('role') == 'BIDDER' else request.args.get('bidder_id')
    if not bidder_id:
        return jsonify({'error': 'bidder_id is required'}), 400
    grievances = load_json('grievances.json')
    my_grievances = [g for g in grievances if g.get('bidder_id') == bidder_id or g.get('submitter_id') == bidder_id]
    # Return safe fields only (no internal_notes)
    safe = [{k: v for k, v in g.items() if k != 'internal_notes'} for g in my_grievances]
    return jsonify(sorted(safe, key=lambda x: x.get('submitted_at', ''), reverse=True))


# ── Officer: Assign & Respond ─────────────────────────────────
@grievance_bp.route('/api/grievances/<grievance_id>/assign', methods=['POST'])
@require_role('OFFICER')
def assign_grievance(grievance_id):
    data = request.get_json() or {}
    grievances = load_json('grievances.json')
    for g in grievances:
        if g['id'] == grievance_id:
            g['assigned_to'] = data.get('assigned_to', 'Rajesh Kumar')
            g['status'] = 'UNDER_REVIEW'
    save_json('grievances.json', grievances)
    return jsonify({'status': 'assigned', 'id': grievance_id})


@grievance_bp.route('/api/grievances/<grievance_id>/respond', methods=['POST'])
@require_role('OFFICER')
def respond_grievance(grievance_id):
    data = request.get_json() or {}
    response = data.get('response', '').strip()
    if not response:
        return jsonify({'error': 'Response is required'}), 400

    grievances = load_json('grievances.json')
    grv = next((g for g in grievances if g['id'] == grievance_id), None)
    if not grv:
        return jsonify({'error': 'Grievance not found'}), 404

    for g in grievances:
        if g['id'] == grievance_id:
            g['officer_response'] = response
            g['response_at'] = datetime.now().isoformat()
            g['status'] = data.get('status', 'RESPONDED')
            g['public_note'] = data.get('public_note')
            if data.get('internal_note'):
                g.setdefault('internal_notes', []).append({
                    'note': data['internal_note'],
                    'by': data.get('officer', 'Procurement Officer'),
                    'at': datetime.now().isoformat(),
                })
            if data.get('status') == 'CLOSED':
                g['closed_at'] = datetime.now().isoformat()
            if data.get('status') == 'ESCALATED':
                g['escalated_at'] = datetime.now().isoformat()

    save_json('grievances.json', grievances)

    _audit('GRIEVANCE_RESPONDED',
           f'Grievance {grievance_id} responded: status={data.get("status", "RESPONDED")}',
           tender_id=grv.get('tender_id'), bidder_id=grv.get('bidder_id'),
           actor=data.get('officer', 'Procurement Officer'))

    return jsonify({'status': 'responded', 'id': grievance_id})


# ── Public Grievance Stats ────────────────────────────────────
@grievance_bp.route('/api/public/grievances/stats', methods=['GET'])
def public_grievance_stats():
    """Public-safe grievance statistics only — no confidential data."""
    tender_id = request.args.get('tender_id')
    grievances = load_json('grievances.json')
    if tender_id:
        grievances = [g for g in grievances if g.get('tender_id') == tender_id]

    return jsonify({
        'total': len(grievances),
        'by_status': {
            'submitted': sum(1 for g in grievances if g['status'] == 'SUBMITTED'),
            'under_review': sum(1 for g in grievances if g['status'] == 'UNDER_REVIEW'),
            'responded': sum(1 for g in grievances if g['status'] == 'RESPONDED'),
            'closed': sum(1 for g in grievances if g['status'] == 'CLOSED'),
        },
        'by_category': {
            cat: sum(1 for g in grievances if g['category'] == cat)
            for cat in GRIEVANCE_CATEGORIES
        },
    })
