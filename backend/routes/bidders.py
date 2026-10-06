import json
import os
import re
import time
import uuid
from datetime import datetime
from flask import Blueprint, jsonify, request
from config import DATA_DIR
from services.audit_utils import next_audit_id
from services.document_service import get_documents_for_bidder
from services.compliance_service import get_compliance_results, calculate_score, get_cross_document_checks
from services.tender_service import get_requirements_for_tender, get_tender_by_id
from routes.auth import require_role, get_session
from database.db_utils import load_cached, save_cached

bidders_bp = Blueprint('bidders', __name__)

# PAN format: 5 uppercase letters, 4 digits, 1 uppercase letter
_PAN_RE = re.compile(r'^[A-Z]{5}[0-9]{4}[A-Z]$')
# GSTIN format: 15-char alphanumeric per GST specification
_GSTIN_RE = re.compile(r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$')
_EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


def load_bidders():
    """Database read — returns all bidders as list of dicts."""
    return load_cached('bidders.json')


def save_bidders(bidders):
    """Write bidders back to database."""
    save_cached('bidders.json', bidders)


def _null_if_placeholder(value, placeholder_patterns=None):
    """Return None if the value looks like test/demo placeholder data."""
    if value is None:
        return None
    s = str(value).strip()
    if not s or s in ('—', '-', 'N/A', 'null', 'None', 'undefined'):
        return None
    # Exact placeholder strings / tokens that are never legitimate values.
    BAD_TOKENS = [
        'testb0000t', '29testb0000t1z0', 'test.bidder@example.com',
        '+91-00-0000-0000', 'test address', 'test city',
    ]
    low = s.lower()
    if any(tok in low for tok in BAD_TOKENS):
        return None
    # Placeholder WORDS must match as whole words: "Test Company" is a placeholder,
    # but "Testing Laboratories", "Fastest Logistics" or "Contest Media" are real names.
    if re.search(r'\b(test|demo|example|placeholder|dummy|fake)\b', low):
        return None
    # A value made only of zeros / separators (e.g. 000000, +00-000) is a placeholder,
    # but a real number that merely CONTAINS zeros (9800000000) is not.
    if re.fullmatch(r'[0\-+\s]+', s):
        return None
    if placeholder_patterns:
        for pat in placeholder_patterns:
            if re.search(pat, s, re.IGNORECASE):
                return None
    return s if s else None


def _sanitize_bidder(bidder):
    """Strip any placeholder/fake values from a bidder record before returning
    it to the frontend. Returns None for any field that looks like test data.
    Real-user-entered legitimate data is preserved."""
    b = dict(bidder)
    for field in ('name', 'short_name', 'gstin', 'pan', 'email', 'phone',
                  'address', 'state', 'type', 'cin', 'udyam_no',
                  'contact_person'):
        b[field] = _null_if_placeholder(b.get(field))
    # Numeric fields
    yr = b.get('incorporation_year')
    if yr is not None:
        try:
            yr = int(yr)
            # Anything outside a reasonable range is placeholder
            if yr < 1900 or yr > datetime.now().year:
                yr = None
        except (TypeError, ValueError):
            yr = None
    b['incorporation_year'] = yr
    return b


def _attach_extracted_registration(bidder, documents):
    """Add document-extracted identity fields to the bidder dict.

    These are the values actually read from uploaded documents by OCR/entity
    extraction. They are shown alongside (or instead of) the self-declared
    registration values so the UI can:
      - display the OCR-extracted PAN as the authoritative value
      - flag a mismatch between registered PAN and extracted PAN

    Added keys (all may be None if not extracted):
      extracted_pan, extracted_gstin, extracted_udyam,
      pan_source_doc, gstin_source_doc,
      pan_confidence, gstin_confidence,
      pan_mismatch, gstin_mismatch,
      pan_status   ('VERIFIED' | 'NEEDS_REVIEW' | 'MISMATCH' | None)
    """
    # Only consider documents that were actually uploaded (have a saved_path)
    uploaded = [d for d in documents if d.get('saved_path')]

    # --- PAN ---
    pan_doc = next(
        (d for d in uploaded if d.get('classification') == 'PAN'),
        None
    )
    extracted_pan = None
    pan_confidence = None
    pan_source_doc = None
    pan_status = None

    if pan_doc:
        entities = pan_doc.get('extracted_entities') or {}
        raw_pan = entities.get('pan')
        pan_confidence = pan_doc.get('confidence', 0)
        pan_source_doc = pan_doc.get('id')

        if raw_pan:
            # Validate PAN format
            clean = raw_pan.strip().upper()
            if _PAN_RE.match(clean):
                extracted_pan = clean
                # Confidence threshold: below 0.70 → NEEDS_REVIEW
                if pan_confidence < 0.70:
                    pan_status = 'NEEDS_REVIEW'
                else:
                    # Compare against registered PAN
                    reg_pan = (bidder.get('pan') or '').strip().upper()
                    if reg_pan and reg_pan != clean:
                        pan_status = 'MISMATCH'
                    else:
                        pan_status = 'VERIFIED'
            else:
                # OCR produced something but it fails format validation
                extracted_pan = None
                pan_status = 'NEEDS_REVIEW'
        else:
            # PAN document uploaded but no PAN entity extracted
            pan_status = 'NEEDS_REVIEW'

    # --- GSTIN ---
    gst_doc = next(
        (d for d in uploaded if d.get('classification') == 'GST'),
        None
    )
    extracted_gstin = None
    gstin_confidence = None
    gstin_source_doc = None
    gstin_status = None

    if gst_doc:
        entities = gst_doc.get('extracted_entities') or {}
        raw_gstin = entities.get('gstin')
        gstin_confidence = gst_doc.get('confidence', 0)
        gstin_source_doc = gst_doc.get('id')

        if raw_gstin:
            clean = raw_gstin.strip().upper()
            if _GSTIN_RE.match(clean):
                extracted_gstin = clean
                if gstin_confidence < 0.70:
                    gstin_status = 'NEEDS_REVIEW'
                else:
                    reg_gstin = (bidder.get('gstin') or '').strip().upper()
                    if reg_gstin and reg_gstin != clean:
                        gstin_status = 'MISMATCH'
                    else:
                        gstin_status = 'VERIFIED'
            else:
                gstin_status = 'NEEDS_REVIEW'
        else:
            gstin_status = 'NEEDS_REVIEW'

    bidder['extracted_pan']      = extracted_pan
    bidder['pan_confidence']     = pan_confidence
    bidder['pan_source_doc']     = pan_source_doc
    bidder['pan_status']         = pan_status
    bidder['extracted_gstin']    = extracted_gstin
    bidder['gstin_confidence']   = gstin_confidence
    bidder['gstin_source_doc']   = gstin_source_doc
    bidder['gstin_status']       = gstin_status

    return bidder


@bidders_bp.route('/api/tenders/<tender_id>/bidders', methods=['GET'])
def list_bidders_for_tender(tender_id):
    bidders = load_bidders()
    tender_bidders = [b for b in bidders if b.get('tender_id') == tender_id]

    # Load all documents ONCE and group by bidder_id — eliminates N+1
    from services.json_cache import load_cached
    all_docs = load_cached('documents.json')
    # Only count actually-uploaded docs (saved_path present)
    docs_by_bidder: dict = {}
    for d in all_docs:
        if d.get('saved_path'):
            bid = d.get('bidder_id')
            if bid:
                docs_by_bidder.setdefault(bid, []).append(d)

    result = []
    for b in tender_bidders:
        b = _sanitize_bidder(b)
        doc_count = len(docs_by_bidder.get(b['id'], []))
        b['document_count'] = doc_count
        
        # If no documents uploaded, reset compliance to 0 and status to pending
        if doc_count == 0:
            b['compliance_score'] = 0
            b['risk_level'] = 'UNKNOWN'
            b['status'] = 'pending'
            b['analyzed_at'] = None
        
        result.append(b)
    return jsonify(result)


@bidders_bp.route('/api/bidders/<bidder_id>', methods=['GET'])
def get_bidder(bidder_id):
    bidders = load_bidders()
    bidder = next((b for b in bidders if b['id'] == bidder_id), None)
    if not bidder:
        return jsonify({'error': 'Bidder not found'}), 404
    docs = get_documents_for_bidder(bidder_id)
    bidder = _sanitize_bidder(bidder)
    # Only count documents that were actually uploaded (not demo docs)
    uploaded_docs = [d for d in docs if d.get('saved_path')]
    bidder['document_count'] = len(uploaded_docs)
    
    # If no documents uploaded, reset compliance to 0 and status to pending
    if len(uploaded_docs) == 0:
        bidder['compliance_score'] = 0
        bidder['risk_level'] = 'UNKNOWN'
        bidder['status'] = 'pending'
        bidder['analyzed_at'] = None
    
    # Attach extracted/verified identity fields from uploaded documents
    bidder = _attach_extracted_registration(bidder, docs)
    return jsonify(bidder)


@bidders_bp.route('/api/bidders/<bidder_id>/documents', methods=['GET'])
def get_bidder_documents(bidder_id):
    docs = get_documents_for_bidder(bidder_id)
    # Only return documents that were actually uploaded (saved_path present)
    # Demo seed documents (DOC-001-xx etc.) have no saved_path
    uploaded = [d for d in docs if d.get('saved_path')]
    return jsonify(uploaded)


@bidders_bp.route('/api/bidders/<bidder_id>/analyze', methods=['POST'])
@require_role('OFFICER')
def analyze_bidder(bidder_id):
    """Run compliance analysis for a bidder and persist results."""
    from services.json_cache import load_cached, save_cached

    bidders = load_bidders()
    bidder = next((b for b in bidders if b['id'] == bidder_id), None)
    if not bidder:
        return jsonify({'error': 'Bidder not found'}), 404

    tender_id = bidder.get('tender_id')
    requirements = get_requirements_for_tender(tender_id)
    documents = get_documents_for_bidder(bidder_id)

    # Run compliance engine
    compliance_results = get_compliance_results(bidder_id, requirements, documents, bidder=bidder)
    score_data = calculate_score(compliance_results, requirements)

    # Persist compliance results — use cache for read, save_cached for write
    try:
        all_compliance = load_cached('compliance.json')
        if not isinstance(all_compliance, dict):
            all_compliance = {}
    except Exception:
        all_compliance = {}

    serialized = {}
    for req_id, result in compliance_results.items():
        serialized[req_id] = {
            'status':          result.get('status'),
            'confidence':      result.get('confidence'),
            'source_doc':      result.get('source_doc'),
            'extracted_value': result.get('extracted_value'),
            'required_value':  result.get('required_value'),
            'found_value':     result.get('found_value'),
            'reason':          result.get('reason', ''),
            'concern':         result.get('concern', ''),
        }
    all_compliance[bidder_id] = {
        'results':     serialized,
        'score':       score_data,
        'analyzed_at': datetime.now().isoformat(),
        'tender_id':   tender_id,
    }
    save_cached('compliance.json', all_compliance)

    # Update bidder record
    for b in bidders:
        if b['id'] == bidder_id:
            b['compliance_score'] = score_data['overall_score']
            b['risk_level']       = score_data['risk_level']
            b['status']           = 'analyzed'
            b['analyzed_at']      = datetime.now().isoformat()
    save_bidders(bidders)

    # Audit log — cached read + cached write
    try:
        audit = load_cached('audit.json')
        audit.append({
            'id':        next_audit_id(audit),
            'timestamp': datetime.now().isoformat(),
            'actor':     'Veritas AI Engine',
            'action':    'Compliance Analysis Completed',
            'detail':    (f"Bidder {bidder.get('name', bidder_id)} scored "
                          f"{score_data['overall_score']}% with {score_data['risk_level']} risk."),
            'tender_id': tender_id,
            'bidder_id': bidder_id,
            'severity':  ('info' if score_data['risk_level'] == 'LOW'
                          else 'warning' if score_data['risk_level'] == 'MEDIUM'
                          else 'error'),
        })
        save_cached('audit.json', audit)
    except Exception:
        pass

    return jsonify({
        'bidder_id': bidder_id,
        'status': 'completed',
        'compliance_score': score_data['overall_score'],
        'risk_level': score_data['risk_level'],
        'status_counts': score_data['status_counts'],
        'category_scores': score_data['category_scores'],
        'analyzed_at': datetime.now().isoformat(),
    })


@bidders_bp.route('/api/bidders/<bidder_id>/compliance', methods=['GET'])
def get_compliance(bidder_id):
    """Get detailed compliance results for a bidder."""
    bidders = load_bidders()
    bidder = next((b for b in bidders if b['id'] == bidder_id), None)
    if not bidder:
        return jsonify({'error': 'Bidder not found'}), 404

    tender_id = bidder.get('tender_id')
    requirements = get_requirements_for_tender(tender_id)
    documents = get_documents_for_bidder(bidder_id)

    compliance_results = get_compliance_results(bidder_id, requirements, documents, bidder=bidder)
    score_data = calculate_score(compliance_results, requirements)
    cross_checks = get_cross_document_checks(bidder_id)

    # Serialize compliance results (strip requirement obj for lighter response)
    serialized = {}
    for req_id, result in compliance_results.items():
        serialized[req_id] = {
            'status': result.get('status'),
            'confidence': result.get('confidence'),
            'found_value': result.get('found_value'),
            'required_value': result.get('required_value'),
            'extracted_value': result.get('extracted_value'),
            'reason': result.get('reason', ''),
            'concern': result.get('concern', ''),
            'explanation': result.get('explanation'),
            'source_doc_id': result.get('source_doc'),
            'source_document': result.get('source_document'),
            'requirement': result.get('requirement'),
        }

    return jsonify({
        'bidder': bidder,
        'overall_score': score_data['overall_score'],
        'risk_level': score_data['risk_level'],
        'status_counts': score_data['status_counts'],
        'category_scores': score_data['category_scores'],
        'total_requirements': score_data['total_requirements'],
        'compliance_results': serialized,
        'cross_document_checks': cross_checks,
    })


@bidders_bp.route('/api/bidders/<bidder_id>', methods=['DELETE'])
@require_role('OFFICER')
def delete_bidder(bidder_id):
    """Permanently remove a bidder — bidder record, uploaded documents (incl.
    physical files), compliance results, and audit trail references. Useful
    for removing erroneous or test registrations."""
    from config import DATA_DIR, UPLOAD_DIR

    bidders = load_bidders()
    bidder = next((b for b in bidders if b['id'] == bidder_id), None)
    if not bidder:
        return jsonify({'error': 'Bidder not found'}), 404

    officer = (request.get_json(silent=True) or {}).get('officer', 'Procurement Officer')

    # 1. Remove from bidders.json
    remaining = [b for b in bidders if b['id'] != bidder_id]
    save_bidders(remaining)

    # 2. Remove this bidder's documents (JSON entries + physical files)
    from services.document_service import load_documents, save_documents
    docs = load_documents()
    removed_docs = [d for d in docs if d.get('bidder_id') == bidder_id]
    kept_docs = [d for d in docs if d.get('bidder_id') != bidder_id]
    save_documents(kept_docs)

    bidder_upload_dir = os.path.join(UPLOAD_DIR, bidder_id)
    if os.path.isdir(bidder_upload_dir):
        import shutil
        try:
            shutil.rmtree(bidder_upload_dir)
        except Exception as e:
            print(f"Warning: could not remove upload folder {bidder_upload_dir}: {e}")

    # 3. Remove compliance.json entry
    try:
        from services.json_cache import load_cached, save_cached
        all_compliance = load_cached('compliance.json')
        if bidder_id in all_compliance:
            del all_compliance[bidder_id]
            save_cached('compliance.json', all_compliance)
    except Exception:
        pass

    # 4. Remove this bidder's prior audit entries, then log the deletion itself
    try:
        from services.json_cache import load_cached, save_cached
        audit = load_cached('audit.json')
        audit = [a for a in audit if a.get('bidder_id') != bidder_id]
        audit.append({
            'id':        next_audit_id(audit),
            'timestamp': datetime.now().isoformat(),
            'actor':     officer,
            'action':    'Bidder Deleted',
            'detail':    (f"{officer} permanently removed bidder {bidder.get('name', bidder_id)} "
                          f"({bidder_id}) and {len(removed_docs)} associated document(s)."),
            'tender_id': bidder.get('tender_id'),
            'bidder_id': None,
            'severity':  'warning',
        })
        save_cached('audit.json', audit)
    except Exception:
        pass

    return jsonify({
        'success': True,
        'deleted': bidder_id,
        'name': bidder.get('name'),
        'documents_removed': len(removed_docs),
        'message': f"Bidder {bidder.get('name', bidder_id)} and all associated data have been permanently removed."
    })


@bidders_bp.route('/api/bidders', methods=['POST'])
@require_role('BIDDER', 'OFFICER')
def create_bidder():
    data = request.get_json(silent=True) or {}
    required = ['name', 'email', 'gstin', 'pan', 'tender_id']
    for field in required:
        value = data.get(field)
        if not value or not isinstance(value, str) or not value.strip():
            return jsonify({'error': f'Missing required field: {field}'}), 400

    if not _EMAIL_RE.match(data['email'].strip()):
        return jsonify({'error': 'Invalid email address'}), 400
    if not get_tender_by_id(data['tender_id'].strip()):
        return jsonify({'error': f"Tender {data['tender_id']} not found"}), 404

    # Validate PAN format: 5 uppercase letters, 4 digits, 1 uppercase letter
    pan = data['pan'].strip().upper()
    if not _PAN_RE.match(pan):
        return jsonify({
            'error': 'Invalid PAN format. PAN must be 10 characters: 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F).'
        }), 400

    # Validate GSTIN format
    gstin = data['gstin'].strip().upper()
    if not _GSTIN_RE.match(gstin):
        return jsonify({
            'error': 'Invalid GSTIN format. GSTIN must be 15 characters (e.g. 27ABCDE1234F1Z5).'
        }), 400

    import uuid
    bidders = load_bidders()
    # Check for duplicate GSTIN in this tender
    existing = next((b for b in bidders if b.get('gstin') == gstin and b.get('tender_id') == data['tender_id']), None)
    if existing:
        return jsonify({'error': 'A bidder with this GSTIN is already registered for this tender', 'bidder_id': existing['id']}), 409

    bidder_id = f"BID-{str(uuid.uuid4())[:8].upper()}"
    bidder = {
        'id': bidder_id,
        'tender_id': data['tender_id'].strip(),
        'name': data['name'].strip() or None,
        'gstin': gstin,
        'pan': pan,
        'cin': data.get('cin', '') or None,
        'udyam_no': data.get('udyam_no', '') or None,
        'email': data.get('email', '') or None,
        'phone': data.get('phone', '') or None,
        'address': data.get('address', '') or None,
        'type': data.get('type', '') or None,
        'incorporation_year': data.get('incorporation_year') or None,
        'contact_person': data.get('contact_person', '') or None,
        'status': 'registered',
        'compliance_score': 0,
        'risk_level': 'UNKNOWN',
        'submitted_at': datetime.now().isoformat(),
        'document_ids': [],
    }
    bidders.append(bidder)
    save_bidders(bidders)

    # Audit log — cached
    try:
        from services.json_cache import load_cached, save_cached
        audit = load_cached('audit.json')
        audit.append({
            'id':        next_audit_id(audit),
            'timestamp': datetime.now().isoformat(),
            'actor':     data.get('name', 'Bidder'),
            'action':    'Bidder Registered',
            'detail':    f"{data['name']} (GSTIN: {gstin}) registered for tender {data['tender_id']}.",
            'tender_id': data['tender_id'],
            'bidder_id': bidder_id,
            'severity':  'info',
        })
        save_cached('audit.json', audit)
    except Exception:
        pass

    return jsonify(bidder), 201


@bidders_bp.route('/api/bidders/<bidder_id>/decision', methods=['POST'])
@require_role('OFFICER')
def submit_officer_decision(bidder_id):
    """Record the officer's final decision for a bidder.

    For DISQUALIFY decisions the following extra fields are required:
      rejection_category  – one of the eight standard reason categories
      rejection_stage     – procurement stage at which rejection occurred
      rejection_reason    – free-text justification (minimum 20 characters)

    These are stored on the bidder record and written to the audit trail so
    the rejection statement is permanently auditable and non-editable without
    a separate override flow.
    """
    data = request.get_json() or {}
    decision  = data.get('decision', '')
    remarks   = data.get('remarks', '').strip()
    officer   = data.get('officer', 'Procurement Officer')
    officer_id = data.get('officer_id', '')

    if decision not in ('QUALIFY', 'DISQUALIFY', 'CLARIFICATION'):
        return jsonify({'error': 'Invalid decision value'}), 400

    # ── Rejection-specific validation ─────────────────────────────────────────
    if decision == 'DISQUALIFY':
        rejection_category = data.get('rejection_category', '').strip()
        rejection_stage    = data.get('rejection_stage', '').strip()
        rejection_reason   = data.get('rejection_reason', '').strip()

        VALID_CATEGORIES = [
            'Eligibility Criteria Not Met',
            'Required Documents Missing',
            'Technical Requirements Not Met',
            'Financial Evaluation',
            'Non-Compliance with Tender Conditions',
            'Late Submission',
            'Invalid/Incomplete Information',
            'Other',
        ]

        if not rejection_category or rejection_category not in VALID_CATEGORIES:
            return jsonify({
                'error': 'A valid rejection category is required for disqualification.',
                'valid_categories': VALID_CATEGORIES,
            }), 400

        if not rejection_stage:
            return jsonify({'error': 'Rejection stage is required for disqualification.'}), 400

        if not rejection_reason or len(rejection_reason) < 20:
            return jsonify({
                'error': 'A detailed rejection reason (minimum 20 characters) is required for disqualification.'
            }), 400
    else:
        rejection_category = None
        rejection_stage    = None
        rejection_reason   = None

    # ── Load bidder ───────────────────────────────────────────────────────────
    bidders = load_bidders()
    bidder = next((b for b in bidders if b['id'] == bidder_id), None)
    if not bidder:
        return jsonify({'error': 'Bidder not found'}), 404

    now = datetime.now().isoformat()

    # ── Persist decision on bidder record ─────────────────────────────────────
    for b in bidders:
        if b['id'] == bidder_id:
            b['officer_decision']    = decision
            b['officer_remarks']     = remarks
            b['decision_officer']    = officer
            b['decision_officer_id'] = officer_id
            b['decision_timestamp']  = now
            # Rejection-specific fields (None for QUALIFY / CLARIFICATION)
            b['rejection_category']  = rejection_category
            b['rejection_stage']     = rejection_stage
            b['rejection_reason']    = rejection_reason
            # Surface a simple boolean flag so the UI can quickly detect rejections
            b['is_disqualified']     = (decision == 'DISQUALIFY')
    save_bidders(bidders)

    # ── Audit trail ───────────────────────────────────────────────────────────
    try:
        from services.json_cache import load_cached, save_cached
        audit = load_cached('audit.json')

        if decision == 'DISQUALIFY':
            detail = (
                f'{officer} DISQUALIFIED {bidder.get("name", bidder_id)}. '
                f'Stage: {rejection_stage}. '
                f'Category: {rejection_category}. '
                f'Reason: {rejection_reason}'
            )
            if remarks:
                detail += f' | Additional remarks: {remarks}'
            severity = 'error'
        elif decision == 'QUALIFY':
            detail = (
                f'{officer} QUALIFIED {bidder.get("name", bidder_id)}.'
                + (f' Remarks: {remarks}' if remarks else '')
            )
            severity = 'info'
        else:
            detail = (
                f'{officer} requested CLARIFICATION for {bidder.get("name", bidder_id)}.'
                + (f' Remarks: {remarks}' if remarks else '')
            )
            severity = 'warning'

        audit.append({
            'id':                next_audit_id(audit),
            'timestamp':         now,
            'actor':             officer,
            'action':            f'Officer Decision: {decision}',
            'detail':            detail,
            'tender_id':         bidder.get('tender_id'),
            'bidder_id':         bidder_id,
            'severity':          severity,
            # Structured rejection fields embedded in the audit record
            'rejection_category': rejection_category,
            'rejection_stage':    rejection_stage,
            'rejection_reason':   rejection_reason,
        })
        save_cached('audit.json', audit)
    except Exception:
        pass  # Non-fatal — decision already persisted on bidder record

    # ── Auto-create rejection feedback record ─────────────────────────────────
    # When the officer disqualifies a bidder, a rejection feedback record is
    # automatically created from the rejection reason so the bidder can read it.
    if decision == 'DISQUALIFY':
        try:
            import uuid as _uuid
            fb_records = _load_feedback()
            fb_records.append({
                'id':                  f'RFB-{str(_uuid.uuid4())[:6].upper()}',
                'bidder_id':           bidder_id,
                'bidder_name':         bidder.get('name', bidder_id),
                'tender_id':           bidder.get('tender_id'),
                'officer':             officer,
                'officer_id':          officer_id,
                'decision':            'DISQUALIFY',
                'rejection_stage':     rejection_stage,
                'rejection_category':  rejection_category,
                'rejection_reason':    rejection_reason,
                'officer_remarks':     remarks,
                'additional_feedback': None,   # optional follow-up message from officer
                'feedback_sent_at':    None,
                'created_at':          now,
                'read_by_bidder':      False,
                'read_at':             None,
            })
            _save_feedback(fb_records)
        except Exception:
            pass

    return jsonify({
        'status':             'recorded',
        'bidder_id':          bidder_id,
        'decision':           decision,
        'officer':            officer,
        'timestamp':          now,
        'rejection_category': rejection_category,
        'rejection_stage':    rejection_stage,
        'rejection_reason':   rejection_reason,
    })


# ── Rejection Feedback helpers ────────────────────────────────

def _load_feedback():
    return load_cached('rejection_feedback.json')


def _save_feedback(data):
    save_cached('rejection_feedback.json', data)


# ── GET — Officer: list all rejection feedback records ────────
@bidders_bp.route('/api/rejection-feedback', methods=['GET'])
def list_rejection_feedback():
    """Return all rejection feedback records, optionally filtered by tender."""
    tender_id = request.args.get('tender_id')
    records = _load_feedback()
    if tender_id:
        records = [r for r in records if r.get('tender_id') == tender_id]
    # Sort newest first
    records.sort(key=lambda r: r.get('created_at', ''), reverse=True)
    return jsonify(records)


# ── POST — Officer: send additional feedback to a bidder ──────
@bidders_bp.route('/api/rejection-feedback/<fb_id>/send', methods=['POST'])
@require_role('OFFICER')
def send_rejection_feedback(fb_id):
    """
    Officer sends an additional personalised feedback message to a disqualified
    bidder on top of the mandatory rejection reason.  This is optional but
    strongly recommended so the bidder can improve for future tenders.
    """
    data = request.get_json() or {}
    additional_feedback = data.get('additional_feedback', '').strip()
    if not additional_feedback:
        return jsonify({'error': 'Feedback message cannot be empty.'}), 400

    records = _load_feedback()
    record = next((r for r in records if r['id'] == fb_id), None)
    if not record:
        return jsonify({'error': 'Rejection feedback record not found.'}), 404

    now = datetime.now().isoformat()
    for r in records:
        if r['id'] == fb_id:
            r['additional_feedback'] = additional_feedback
            r['feedback_sent_at'] = now
            r['feedback_sent_by'] = data.get('officer', record.get('officer', 'Procurement Officer'))
    _save_feedback(records)

    # Append to audit
    try:
        from services.json_cache import load_cached, save_cached
        audit = load_cached('audit.json')
        audit.append({
            'id':        next_audit_id(audit),
            'timestamp': now,
            'actor':     data.get('officer', 'Procurement Officer'),
            'action':    'Rejection Feedback Sent',
            'detail':    (
                f'Officer sent rejection feedback to {record.get("bidder_name", record["bidder_id"])} '
                f'for tender {record.get("tender_id")}.'
            ),
            'tender_id': record.get('tender_id'),
            'bidder_id': record.get('bidder_id'),
            'severity':  'info',
        })
        save_cached('audit.json', audit)
    except Exception:
        pass

    return jsonify({'status': 'sent', 'id': fb_id, 'feedback_sent_at': now})


# ── GET — Bidder: read their own rejection feedback ───────────
@bidders_bp.route('/api/bidder/rejection-feedback', methods=['GET'])
def bidder_rejection_feedback():
    """
    Returns all rejection feedback records for the calling bidder.
    Marks them as read on first access.
    """
    session = get_session(request)
    bidder_id = (session or {}).get('organization_id') or request.args.get('bidder_id', 'BID-001')

    records = _load_feedback()
    my_records = [r for r in records if r.get('bidder_id') == bidder_id]

    # Mark unread records as read
    changed = False
    now = datetime.now().isoformat()
    for r in records:
        if r.get('bidder_id') == bidder_id and not r.get('read_by_bidder'):
            r['read_by_bidder'] = True
            r['read_at'] = now
            changed = True
    if changed:
        _save_feedback(records)

    my_records.sort(key=lambda r: r.get('created_at', ''), reverse=True)
    return jsonify(my_records)
