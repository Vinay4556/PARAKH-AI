"""
Contract & Quality Management Routes — BIDVERIFY 360
Covers: contract award, milestones, delivery, inspection, corrective actions, vendor profiles.
"""
import json
import os
import uuid
from datetime import datetime
from flask import Blueprint, jsonify, request
from config import DATA_DIR
from services.audit_utils import next_audit_id
from routes.auth import require_role

contracts_bp = Blueprint('contracts', __name__)


# All persistence goes through the database-backed store (see database/db_utils.py)
from database.db_utils import load_cached as load_json, save_cached as save_json  # noqa: E402


def audit_log(action, detail, tender_id=None, bidder_id=None, actor='System', severity='info'):
    audit = load_json('audit.json')
    audit.append({
        'id': next_audit_id(audit),
        'timestamp': datetime.now().isoformat(),
        'actor': actor,
        'action': action,
        'detail': detail,
        'tender_id': tender_id,
        'bidder_id': bidder_id,
        'severity': severity,
    })
    save_json('audit.json', audit)


# ── CONTRACTS ────────────────────────────────────────────────

@contracts_bp.route('/api/contracts', methods=['GET'])
def list_contracts():
    tender_id = request.args.get('tender_id')
    bidder_id = request.args.get('bidder_id')
    contracts = load_json('contracts.json')
    if tender_id:
        contracts = [c for c in contracts if c.get('tender_id') == tender_id]
    if bidder_id:
        contracts = [c for c in contracts if c.get('bidder_id') == bidder_id]
    return jsonify(contracts)


@contracts_bp.route('/api/contracts/<contract_id>', methods=['GET'])
def get_contract(contract_id):
    contracts = load_json('contracts.json')
    contract = next((c for c in contracts if c['id'] == contract_id), None)
    if not contract:
        return jsonify({'error': 'Contract not found'}), 404
    # Attach inspections
    inspections = [i for i in load_json('inspections.json') if i.get('contract_id') == contract_id]
    contract['inspections'] = inspections
    return jsonify(contract)


@contracts_bp.route('/api/contracts', methods=['POST'])
@require_role('OFFICER')
def create_contract():
    data = request.get_json() or {}
    required = ['tender_id', 'bid_id', 'bidder_id', 'bidder_name', 'contract_value', 'awarded_by']
    for field in required:
        if not data.get(field):
            return jsonify({'error': f'Missing required field: {field}'}), 400

    contracts = load_json('contracts.json')
    contract = {
        'id': f'CON-{datetime.now().year}-{str(uuid.uuid4())[:6].upper()}',
        'tender_id': data['tender_id'],
        'bid_id': data['bid_id'],
        'bidder_id': data['bidder_id'],
        'bidder_name': data['bidder_name'],
        'awarded_by': data['awarded_by'],
        'awarded_by_id': data.get('awarded_by_id', 'USR-001'),
        'awarded_at': datetime.now().isoformat(),
        'contract_value': data['contract_value'],
        'contract_value_display': data.get('contract_value_display', f"₹{data['contract_value']:,}"),
        'contract_reference': data.get('contract_reference', f"CON/{datetime.now().year}/{len(contracts)+1:04d}"),
        'status': 'AWARDED',
        'delivery_address': data.get('delivery_address', ''),
        'delivery_deadline': data.get('delivery_deadline'),
        'payment_terms': data.get('payment_terms', '30 days post acceptance'),
        'advance_payment_pct': data.get('advance_payment_pct', 0),
        'milestones': data.get('milestones', []),
        'total_penalty_amount': 0,
        'penalty_details': None,
        'notes': data.get('notes', ''),
    }
    contracts.append(contract)
    save_json('contracts.json', contracts)

    # Update bid status
    bids = load_json('bids.json')
    for b in bids:
        if b['id'] == data['bid_id']:
            b['status'] = 'AWARDED'
    save_json('bids.json', bids)

    audit_log('Contract Awarded', f"Contract {contract['id']} awarded to {data['bidder_name']}",
              tender_id=data['tender_id'], bidder_id=data['bidder_id'],
              actor=data['awarded_by'], severity='info')

    return jsonify(contract), 201


@contracts_bp.route('/api/contracts/<contract_id>/milestone', methods=['PUT'])
def update_milestone(contract_id):
    data = request.get_json() or {}
    milestone_id = data.get('milestone_id')
    contracts = load_json('contracts.json')
    contract = next((c for c in contracts if c['id'] == contract_id), None)
    if not contract:
        return jsonify({'error': 'Contract not found'}), 404

    for c in contracts:
        if c['id'] == contract_id:
            for ms in c.get('milestones', []):
                if ms['id'] == milestone_id:
                    ms.update({k: v for k, v in data.items() if k not in ('contract_id', 'milestone_id')})
                    if data.get('status') == 'COMPLETED' and not ms.get('completed_date'):
                        ms['completed_date'] = datetime.now().strftime('%Y-%m-%d')
    save_json('contracts.json', contracts)

    audit_log('Milestone Updated', f"Milestone {milestone_id} updated on contract {contract_id}",
              tender_id=contract.get('tender_id'), bidder_id=contract.get('bidder_id'),
              actor=data.get('updated_by', 'Officer'), severity='info')

    return jsonify({'status': 'updated', 'contract_id': contract_id, 'milestone_id': milestone_id})


# ── INSPECTIONS ──────────────────────────────────────────────

@contracts_bp.route('/api/contracts/<contract_id>/inspections', methods=['GET'])
def list_inspections(contract_id):
    inspections = [i for i in load_json('inspections.json') if i.get('contract_id') == contract_id]
    return jsonify(inspections)


@contracts_bp.route('/api/inspections', methods=['POST'])
def create_inspection():
    data = request.get_json() or {}
    inspections = load_json('inspections.json')
    inspection = {
        'id': f'INS-{str(uuid.uuid4())[:6].upper()}',
        'contract_id': data.get('contract_id'),
        'tender_id': data.get('tender_id'),
        'bidder_id': data.get('bidder_id'),
        'milestone_id': data.get('milestone_id'),
        'inspection_type': data.get('inspection_type', 'INCOMING_QUALITY'),
        'inspector': data.get('inspector', 'Quality Officer'),
        'inspector_id': data.get('inspector_id', 'USR-005'),
        'inspected_at': datetime.now().isoformat(),
        'status': data.get('status', 'IN_PROGRESS'),
        'items': data.get('items', []),
        'overall_result': data.get('overall_result', 'PENDING'),
        'corrective_action_required': data.get('corrective_action_required', False),
        'corrective_action_id': None,
        'report_notes': data.get('report_notes', ''),
        'attachments': data.get('attachments', []),
    }
    inspections.append(inspection)
    save_json('inspections.json', inspections)

    audit_log('Inspection Created', f"Quality inspection {inspection['id']} created for contract {data.get('contract_id')}",
              tender_id=data.get('tender_id'), bidder_id=data.get('bidder_id'),
              actor=data.get('inspector', 'Quality Officer'), severity='info')

    return jsonify(inspection), 201


@contracts_bp.route('/api/inspections/<inspection_id>', methods=['PUT'])
def update_inspection(inspection_id):
    data = request.get_json() or {}
    inspections = load_json('inspections.json')
    ins = next((i for i in inspections if i['id'] == inspection_id), None)
    if not ins:
        return jsonify({'error': 'Inspection not found'}), 404
    for i in inspections:
        if i['id'] == inspection_id:
            i.update({k: v for k, v in data.items() if k != 'id'})
    save_json('inspections.json', inspections)

    severity = 'warning' if data.get('corrective_action_required') else 'info'
    audit_log('Inspection Updated', f"Inspection {inspection_id} result: {data.get('overall_result', 'updated')}",
              tender_id=ins.get('tender_id'), bidder_id=ins.get('bidder_id'),
              actor=data.get('inspector', 'Quality Officer'), severity=severity)

    return jsonify({'status': 'updated', 'id': inspection_id})


# ── CORRECTIVE ACTIONS ────────────────────────────────────────

@contracts_bp.route('/api/corrective-actions', methods=['GET'])
def list_corrective_actions():
    contract_id = request.args.get('contract_id')
    cas = load_json('corrective_actions.json')
    if contract_id:
        cas = [ca for ca in cas if ca.get('contract_id') == contract_id]
    return jsonify(cas)


@contracts_bp.route('/api/corrective-actions', methods=['POST'])
def create_corrective_action():
    data = request.get_json() or {}
    cas = load_json('corrective_actions.json')
    ca = {
        'id': f'CA-{str(uuid.uuid4())[:6].upper()}',
        'inspection_id': data.get('inspection_id'),
        'contract_id': data.get('contract_id'),
        'bidder_id': data.get('bidder_id'),
        'issued_by': data.get('issued_by', 'Quality Officer'),
        'issued_at': datetime.now().isoformat(),
        'deadline': data.get('deadline'),
        'type': data.get('type', 'REPLACEMENT'),
        'description': data.get('description', ''),
        'status': 'ISSUED',
        'resolved_at': None,
        'vendor_response': None,
        're_inspection_required': data.get('re_inspection_required', True),
        're_inspection_id': None,
        'impact_on_payment': data.get('impact_on_payment', 'Pending assessment'),
    }
    cas.append(ca)
    save_json('corrective_actions.json', cas)

    audit_log('Corrective Action Issued', f"CA {ca['id']}: {data.get('description', '')}",
              bidder_id=data.get('bidder_id'), actor=data.get('issued_by', 'Quality Officer'),
              severity='warning')

    return jsonify(ca), 201


@contracts_bp.route('/api/corrective-actions/<ca_id>/resolve', methods=['POST'])
def resolve_corrective_action(ca_id):
    data = request.get_json() or {}
    cas = load_json('corrective_actions.json')
    ca = next((c for c in cas if c['id'] == ca_id), None)
    if not ca:
        return jsonify({'error': 'Corrective action not found'}), 404
    for c in cas:
        if c['id'] == ca_id:
            c['status'] = 'RESOLVED'
            c['resolved_at'] = datetime.now().isoformat()
            c['vendor_response'] = data.get('vendor_response', '')
            c['re_inspection_id'] = data.get('re_inspection_id')
    save_json('corrective_actions.json', cas)

    audit_log('Corrective Action Resolved', f"CA {ca_id} resolved",
              bidder_id=ca.get('bidder_id'), actor=data.get('resolved_by', 'Vendor'),
              severity='info')

    return jsonify({'status': 'resolved', 'id': ca_id})


# ── VENDOR PROFILES ───────────────────────────────────────────

@contracts_bp.route('/api/vendor-profiles', methods=['GET'])
def list_vendor_profiles():
    profiles = load_json('vendor_profiles.json')
    return jsonify(profiles)


@contracts_bp.route('/api/vendor-profiles/<bidder_id>', methods=['GET'])
def get_vendor_profile(bidder_id):
    profiles = load_json('vendor_profiles.json')
    profile = next((p for p in profiles if p['bidder_id'] == bidder_id), None)
    if not profile:
        # Return minimal profile if not found
        bidders = load_json('bidders.json')
        bidder = next((b for b in bidders if b['id'] == bidder_id), None)
        if not bidder:
            return jsonify({'error': 'Vendor not found'}), 404
        return jsonify({
            'bidder_id': bidder_id,
            'bidder_name': bidder.get('name'),
            'gstin': bidder.get('gstin'),
            'total_tenders_participated': 0,
            'total_contracts_awarded': 0,
            'avg_compliance_score': bidder.get('compliance_score', 0),
            'risk_signal': bidder.get('risk_level', 'UNKNOWN'),
            'performance_trend': 'INSUFFICIENT_DATA',
            'blacklisted': False,
            'debarment_status': 'NONE',
        })
    # Attach recent contracts
    contracts = [c for c in load_json('contracts.json') if c.get('bidder_id') == bidder_id]
    profile['recent_contracts'] = contracts[-3:]  # Last 3
    return jsonify(profile)


@contracts_bp.route('/api/public/vendor-profiles/<gstin>', methods=['GET'])
def public_vendor_profile(gstin):
    """Public-safe vendor profile — aggregate scores only, no confidential data."""
    profiles = load_json('vendor_profiles.json')
    profile = next((p for p in profiles if p.get('gstin') == gstin), None)
    if not profile:
        return jsonify({'error': 'Vendor not found'}), 404
    # Return only public-safe fields
    return jsonify({
        'bidder_name': profile['bidder_name'],
        'gstin': profile['gstin'],
        'registration_date': profile.get('registration_date'),
        'total_contracts_completed': profile.get('completed_contracts', 0),
        'avg_compliance_score': profile.get('avg_compliance_score', 0),
        'on_time_delivery_rate': profile.get('on_time_delivery_rate', 0),
        'quality_pass_rate': profile.get('quality_pass_rate', 0),
        'blacklisted': profile.get('blacklisted', False),
        'debarment_status': profile.get('debarment_status', 'NONE'),
        'performance_trend': profile.get('performance_trend'),
        'risk_signal': profile.get('risk_signal'),
        'certifications': profile.get('certifications', []),
    })
