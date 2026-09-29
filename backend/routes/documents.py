"""
Document Routes — PARAKH AI
Handles upload, metadata retrieval, tampering analysis, and file serving.
"""
from flask import Blueprint, jsonify, request, send_file, Response
import os
import logging
from config import UPLOAD_DIR, DATA_DIR
from services.document_service import (
    process_uploaded_file, get_documents_for_bidder,
    get_document_by_id, load_documents, DuplicatePANError
)
from routes.auth import require_role, get_session

documents_bp = Blueprint('documents', __name__)
logger = logging.getLogger(__name__)


# ── Duplicate Check ────────────────────────────────────────────────────────

@documents_bp.route('/api/documents/check-duplicate', methods=['GET'])
def check_duplicate():
    """
    Check if a document of the same type already exists for a bidder.
    Query params: bidder_id, doc_type (PAN/GST/UDYAM/...), requirement_id (optional)
    Returns: { duplicate: bool, existing_doc: {...} | null }
    """
    bidder_id      = request.args.get('bidder_id')
    doc_type       = request.args.get('doc_type', '').upper()
    requirement_id = request.args.get('requirement_id', '')

    if not bidder_id or not doc_type:
        return jsonify({'duplicate': False, 'existing_doc': None})

    docs = get_documents_for_bidder(bidder_id)
    # Match by requirement_id first (most specific), then by doc type
    existing = None
    if requirement_id:
        existing = next((d for d in docs if d.get('requirement_id') == requirement_id and d.get('saved_path')), None)
    if not existing and doc_type:
        existing = next((d for d in docs if d.get('classification') == doc_type and d.get('saved_path')), None)

    return jsonify({
        'duplicate':    existing is not None,
        'existing_doc': {
            'id':           existing['id'],
            'filename':     existing['filename'],
            'uploaded_at':  existing.get('uploaded_at'),
            'classification': existing.get('classification'),
        } if existing else None
    })


# ── Upload ─────────────────────────────────────────────────────────────────

def _can_touch_bidder(session, bidder_id):
    """OFFICER may act on any bidder; a BIDDER only on their own organisation."""
    if session.get('role') == 'OFFICER':
        return True
    return session.get('role') == 'BIDDER' and session.get('organization_id') == bidder_id


@documents_bp.route('/api/documents/upload', methods=['POST'])
@require_role('BIDDER', 'OFFICER')
def upload_documents():
    bidder_id      = request.form.get('bidder_id')
    tender_id      = request.form.get('tender_id')       # which tender
    requirement_id = request.form.get('requirement_id')  # which requirement it satisfies

    if not bidder_id:
        return jsonify({'error': 'bidder_id is required'}), 400
    if not _can_touch_bidder(get_session(request), bidder_id):
        return jsonify({'error': 'You can only upload documents for your own organisation'}), 403
    from services.json_cache import load_cached
    if not any(b.get('id') == bidder_id for b in load_cached('bidders.json')):
        return jsonify({'error': f'Bidder {bidder_id} not found'}), 404

    files = request.files.getlist('files')
    if not files or all(f.filename == '' for f in files):
        return jsonify({'error': 'No files provided'}), 400

    uploaded = []
    errors   = []
    for file in files:
        if file.filename == '':
            continue
        try:
            # Snapshot the bidder's documents BEFORE this file is processed, so we can
            # detect whether the same document type already existed (regardless of
            # filename — classification is based on the actual OCR'd content, so a
            # photo of a PAN card is correctly compared against an existing PAN PDF).
            prior_docs = get_documents_for_bidder(bidder_id)

            doc = process_uploaded_file(file, bidder_id, tender_id=tender_id, requirement_id=requirement_id)

            duplicate_of = None
            if doc.get('classification') and doc['classification'] != 'UNKNOWN':
                existing = next(
                    (d for d in prior_docs
                     if d.get('classification') == doc['classification'] and d.get('saved_path')),
                    None
                )
                if existing:
                    duplicate_of = {
                        'id': existing['id'],
                        'filename': existing['filename'],
                        'uploaded_at': existing.get('uploaded_at'),
                    }

            uploaded.append({
                'id':                     doc['id'],
                'filename':               doc['filename'],
                'document_type':          doc['classification'],
                'classification':         doc['classification'],
                'confidence':             doc['confidence'],
                'pages':                  doc['pages'],
                'status':                 doc['status'],
                'tampered':               doc.get('tampered', False),
                'suspicious':             doc.get('suspicious', False),
                'tampering_risk':         doc.get('tampering_risk'),
                'tampering_signal_count': doc.get('tampering_signal_count', 0),
                'tender_id':              doc.get('tender_id'),
                'requirement_id':         doc.get('requirement_id'),
                'gov_verification':       doc.get('gov_verification'),
                'extracted_entities':     doc.get('extracted_entities', {}),
                'is_duplicate':           duplicate_of is not None,
                'duplicate_of':           duplicate_of,
                'success': True,
            })
        except DuplicatePANError as e:
            errors.append({
                'filename':    file.filename,
                'error':       str(e),
                'error_code':  e.error_code,
                'existing_doc': {
                    'id':          e.existing_doc.get('id'),
                    'filename':    e.existing_doc.get('filename'),
                    'uploaded_at': e.existing_doc.get('uploaded_at'),
                },
                'success': False,
            })
        except Exception as e:
            errors.append({'filename': file.filename, 'error': str(e), 'success': False})

    # If every file in this request was rejected specifically for an
    # already-existing PAN, surface it as a real 409 Conflict rather than a
    # generic 200 — this is the common single-file "upload my PAN" case.
    status_code = 200
    top_level_error = {}
    if not uploaded and errors and all(e.get('error_code') == 'PAN_ALREADY_EXISTS' for e in errors):
        status_code = 409
        # Mirror the failure at the TOP level too (not just inside `errors[]`),
        # matching this app's existing `{'error': '<message>'}` convention so the
        # global axios interceptor picks up the friendly message automatically.
        top_level_error = {
            'error':        errors[0]['error'],
            'error_code':   errors[0]['error_code'],
            'existing_doc': errors[0]['existing_doc'],
        }

    # Auto-trigger full gov verification for the bidder after any successful
    # document upload.  This ensures GovVerification page always shows fresh
    # results without requiring the officer to click "Verify" manually.
    # We run it in-process (not in a thread) so the response includes the
    # updated verification summary the frontend can use immediately.
    auto_verification = None
    if uploaded and bidder_id:
        try:
            from services.gov_adapters import run_full_verification
            from services.document_service import get_documents_for_bidder
            from services.json_cache import load_cached
            _bidder_obj = next(
                (b for b in load_cached('bidders.json') if b['id'] == bidder_id), {}
            )
            _docs = get_documents_for_bidder(bidder_id)
            _results = run_full_verification(_bidder_obj, documents=_docs)
            _verified_count = sum(1 for r in _results if r.get('verified'))
            _mismatches = [f for r in _results for f in r.get('mismatch_flags', [])]
            auto_verification = {
                'bidder_id':          bidder_id,
                'overall_status':     'CLEAR' if (_results and not _mismatches and _verified_count == len(_results)) else 'ISSUES_FOUND',
                'verified_count':     _verified_count,
                'total_checks':       len(_results),
                'mismatches_detected': len(_mismatches),
                'mismatch_details':   _mismatches,
                'results':            _results,
            }
        except Exception as _ve:
            # Non-fatal — upload still succeeds even if auto-verification errors
            logger.warning(f"Auto gov-verification after upload failed: {_ve}")

    return jsonify({
        'success':            len(uploaded) > 0,
        'uploaded':           uploaded,
        'results':            uploaded + errors,
        'errors':             errors,
        'total_uploaded':     len(uploaded),
        'gov_verification':   auto_verification,
        **top_level_error,
    }), status_code


# ── Delete ─────────────────────────────────────────────────────────────────

@documents_bp.route('/api/documents/<doc_id>', methods=['DELETE'])
@require_role('BIDDER', 'OFFICER')
def delete_document(doc_id):
    """Delete a document — removes from documents.json and deletes the physical file."""
    from services.document_service import load_documents, save_documents

    docs = load_documents()
    doc = next((d for d in docs if d['id'] == doc_id), None)

    if not doc:
        return jsonify({'error': 'Document not found'}), 404
    if not _can_touch_bidder(get_session(request), doc.get('bidder_id')):
        return jsonify({'error': 'You can only delete documents belonging to your own organisation'}), 403

    # Delete physical file if it exists
    saved_path = doc.get('saved_path')
    bidder_id  = doc.get('bidder_id', '')
    if saved_path:
        file_path = os.path.join(UPLOAD_DIR, bidder_id, saved_path)
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception as e:
                # Log but don't block — still remove from JSON
                print(f"Warning: could not delete file {file_path}: {e}")

    # Remove from documents.json
    updated = [d for d in docs if d['id'] != doc_id]
    save_documents(updated)

    return jsonify({
        'success':  True,
        'deleted':  doc_id,
        'filename': doc.get('filename'),
        'message':  f"Document {doc.get('filename')} deleted successfully."
    })


# ── Re-process existing document ──────────────────────────────────────────

@documents_bp.route('/api/documents/<doc_id>/reprocess', methods=['POST'])
@require_role('BIDDER', 'OFFICER')
def reprocess_document(doc_id):
    """Re-run OCR + classification + gov verification on an already-uploaded file."""
    from services.document_service import (
        load_documents, save_documents,
        extract_text_from_image, extract_text_from_pdf,
        _run_gov_verification
    )
    from services.ai_service import classify_document, extract_entities
    import json as _json

    doc = get_document_by_id(doc_id)
    if not doc:
        return jsonify({'error': 'Document not found'}), 404
    if not _can_touch_bidder(get_session(request), doc.get('bidder_id')):
        return jsonify({'error': 'You can only reprocess documents belonging to your own organisation'}), 403

    saved_path = doc.get('saved_path')
    bidder_id  = doc.get('bidder_id', '')
    if not saved_path:
        return jsonify({'error': 'No physical file to reprocess'}), 400

    file_path = os.path.join(UPLOAD_DIR, bidder_id, saved_path)
    if not os.path.exists(file_path):
        return jsonify({'error': 'File not found on disk'}), 404

    # Re-run OCR
    ext = saved_path.rsplit('.', 1)[-1].lower()
    if ext == 'pdf':
        extraction = extract_text_from_pdf(file_path)
    elif ext in ('png', 'jpg', 'jpeg'):
        extraction = extract_text_from_image(file_path)
    else:
        return jsonify({'error': f'Unsupported file type: {ext}'}), 400

    # Re-classify
    classification = classify_document(doc.get('filename', ''), extraction['text'])
    entities       = extract_entities(extraction['text'], classification['type'])

    # Re-run gov verification
    bidders_data = []
    try:
        import json as _j
        with open(os.path.join(UPLOAD_DIR, '..', 'data', 'bidders.json'), 'r', encoding='utf-8') as f:
            bidders_data = _j.load(f)
    except Exception:
        pass
    bidder_obj   = next((b for b in bidders_data if b['id'] == bidder_id), {})
    bidder_name  = bidder_obj.get('name', '')
    gov_verification = _run_gov_verification(classification['type'], extraction['text'], bidder_name)

    # Update the document record
    docs = load_documents()
    for d in docs:
        if d['id'] == doc_id:
            d['extracted_text']    = extraction['text'][:2000]
            d['extraction_method'] = extraction['method']
            d['classification']    = classification['type']
            d['doc_type']          = classification['type']
            d['confidence']        = classification['confidence']
            d['pages']             = extraction['pages']
            d['extracted_entities'] = entities
            d['gov_verification']  = gov_verification
            break
    save_documents(docs)

    return jsonify({
        'success':        True,
        'id':             doc_id,
        'classification': classification['type'],
        'confidence':     classification['confidence'],
        'extracted_text': extraction['text'][:500],
        'extracted_entities': entities,
        'gov_verification': gov_verification,
        'method':         extraction['method'],
    })


# ── Metadata ───────────────────────────────────────────────────────────────

@documents_bp.route('/api/documents/<doc_id>', methods=['GET'])
def get_document(doc_id):
    """Return document metadata + extracted text + any tampering signals."""
    doc = get_document_by_id(doc_id)
    if not doc:
        return jsonify({'error': 'Document not found'}), 404
    return jsonify(doc)


# ── Tampering Summary ──────────────────────────────────────────────────────

@documents_bp.route('/api/bidders/<bidder_id>/tampering', methods=['GET'])
def get_bidder_tampering_summary(bidder_id):
    """
    Return tampering analysis summary for all documents of a bidder.
    For demo documents (no saved_path / no prior analysis), runs text-pattern
    and cross-bidder certificate analysis on the fly.
    """
    from services.tampering_service import (
        detect_suspicious_text_patterns,
        check_duplicate_cert_numbers,
        SEVERITY_HIGH, SEVERITY_MEDIUM,
    )
    from services.document_service import load_documents

    docs = get_documents_for_bidder(bidder_id)
    all_docs = load_documents()  # For cross-bidder certificate checks

    enriched_docs = []
    for d in docs:
        # If tampering already analysed (saved on upload), use stored result
        if 'tampering_signals' in d and d.get('tampering_signal_count', -1) >= 0:
            enriched_docs.append(d)
            continue

        # Otherwise run text-pattern analysis live (demo docs)
        text     = d.get('extracted_text', '') or ''
        doc_type = d.get('classification', 'UNKNOWN')

        signals  = detect_suspicious_text_patterns(text, doc_type)
        signals += check_duplicate_cert_numbers(text, d['id'], bidder_id, all_docs, doc_type)

        sev_high = any(s['severity'] == SEVERITY_HIGH   for s in signals)
        sev_med  = any(s['severity'] == SEVERITY_MEDIUM for s in signals)

        enriched_docs.append({
            **d,
            'tampering_signals':      signals,
            'tampering_signal_count': len(signals),
            'tampered':               sev_high,
            'suspicious':             sev_high or sev_med,
            'tampering_risk': (SEVERITY_HIGH if sev_high else SEVERITY_MEDIUM if sev_med else None),
        })

    flagged     = [d for d in enriched_docs if d.get('suspicious') or d.get('tampered')]
    all_signals = []
    for d in enriched_docs:
        for sig in d.get('tampering_signals', []):
            all_signals.append({**sig, 'doc_id': d['id'], 'filename': d['filename']})

    overall_risk = None
    if any(d.get('tampered')   for d in enriched_docs):
        overall_risk = SEVERITY_HIGH
    elif any(d.get('suspicious') for d in enriched_docs):
        overall_risk = SEVERITY_MEDIUM

    return jsonify({
        'bidder_id':              bidder_id,
        'total_documents':        len(enriched_docs),
        'flagged_documents':      len(flagged),
        'overall_tampering_risk': overall_risk,
        'tampered_count':         sum(1 for d in enriched_docs if d.get('tampered')),
        'suspicious_count':       sum(1 for d in enriched_docs if d.get('suspicious')),
        'all_signals':            all_signals,
        'flagged_docs': [
            {
                'id':             d['id'],
                'filename':       d['filename'],
                'classification': d.get('classification'),
                'tampered':       d.get('tampered', False),
                'suspicious':     d.get('suspicious', False),
                'tampering_risk': d.get('tampering_risk'),
                'signal_count':   d.get('tampering_signal_count', 0),
                'signals':        d.get('tampering_signals', []),
            }
            for d in flagged
        ],
    })


# ── File Viewer (inline) ───────────────────────────────────────────────────

@documents_bp.route('/api/documents/<doc_id>/view', methods=['GET'])
def view_document(doc_id):
    """
    Serve the actual uploaded file for officer inline viewing.
    Accepts token via Authorization header OR ?token= query param
    (query param is required for <iframe>/<img> which can't set headers).
    OFFICER role only.
    """
    from routes.auth import SESSIONS
    token = request.headers.get('Authorization', '').replace('Bearer ', '').strip()
    if not token:
        token = request.args.get('token', '')
    session = SESSIONS.get(token)
    if not session:
        return _render_access_denied()
    if session.get('role') != 'OFFICER':
        return _render_access_denied()

    doc = get_document_by_id(doc_id)
    if not doc:
        return jsonify({'error': 'Document not found'}), 404

    saved_path = doc.get('saved_path')
    if saved_path:
        file_path = os.path.join(UPLOAD_DIR, doc.get('bidder_id', ''), saved_path)
        if os.path.exists(file_path):
            ext = (doc.get('filename', '') or saved_path).rsplit('.', 1)[-1].lower()
            mime_map = {
                'pdf':  'application/pdf',
                'png':  'image/png',
                'jpg':  'image/jpeg',
                'jpeg': 'image/jpeg',
                'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            }
            return send_file(
                file_path,
                mimetype=mime_map.get(ext, 'application/octet-stream'),
                as_attachment=False,
                download_name=doc.get('filename', saved_path),
            )

    # No physical file — render extracted text as styled HTML
    return _render_text_document(doc)


# ── File Download (force attachment) ─────────────────────────────────────

@documents_bp.route('/api/documents/<doc_id>/download', methods=['GET'])
def download_document(doc_id):
    """Force-download the actual file. Same token logic as /view."""
    from routes.auth import SESSIONS
    token = request.headers.get('Authorization', '').replace('Bearer ', '').strip()
    if not token:
        token = request.args.get('token', '')
    session = SESSIONS.get(token)
    if not session or session.get('role') != 'OFFICER':
        return jsonify({'error': 'Authentication required'}), 401

    doc = get_document_by_id(doc_id)
    if not doc:
        return jsonify({'error': 'Document not found'}), 404

    saved_path = doc.get('saved_path')
    if saved_path:
        file_path = os.path.join(UPLOAD_DIR, doc.get('bidder_id', ''), saved_path)
        if os.path.exists(file_path):
            return send_file(file_path, as_attachment=True,
                             download_name=doc.get('filename', saved_path))

    return jsonify({'error': 'File not available for download (demo document)'}), 404


# ── Helpers ────────────────────────────────────────────────────────────────

def _render_access_denied():
    html = """<!DOCTYPE html><html>
<body style="font-family:sans-serif;text-align:center;padding:60px;color:#dc2626;">
<h2>🔒 Access Denied</h2>
<p>This document requires Procurement Officer authorization.</p>
</body></html>"""
    return Response(html, status=403, mimetype='text/html')


def _render_text_document(doc):
    """Render extracted text as a clean government-style HTML page."""
    filename       = doc.get('filename', 'Document')
    classification = doc.get('classification', 'UNKNOWN')
    confidence     = int((doc.get('confidence', 0)) * 100)
    pages          = doc.get('pages', 1)
    uploaded_at    = doc.get('uploaded_at', '')
    extracted_text = doc.get('extracted_text', 'No text extracted.')
    bidder_id      = doc.get('bidder_id', '—')

    TYPE_COLORS = {
        'GST': '#1d4ed8', 'PAN': '#4338ca', 'UDYAM': '#7c3aed',
        'ISO9001': '#0f766e', 'ISO27001': '#0f766e', 'FINANCIAL': '#15803d',
        'OEM': '#c2410c', 'EPFO': '#0369a1', 'ESIC': '#0e7490',
        'EXPERIENCE': '#b45309', 'DECLARATION': '#be123c',
        'BIS_CE': '#4d7c0f', 'NABL': '#9333ea', 'INCORPORATION': '#6d28d9',
    }
    accent     = TYPE_COLORS.get(classification, '#374151')
    conf_color = '#16a34a' if confidence >= 90 else '#d97706' if confidence >= 70 else '#dc2626'

    # Tampering badge
    tamper_html = ''
    if doc.get('tampered'):
        tamper_html = '<span style="background:#dc2626;color:white;font-size:10px;font-weight:700;padding:2px 8px;border-radius:12px;margin-left:8px;">⚠ TAMPERED</span>'
    elif doc.get('suspicious'):
        tamper_html = '<span style="background:#d97706;color:white;font-size:10px;font-weight:700;padding:2px 8px;border-radius:12px;margin-left:8px;">⚠ SUSPICIOUS</span>'

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>{filename} — PARAKH AI Viewer</title>
  <style>
    *{{box-sizing:border-box;margin:0;padding:0}}
    body{{font-family:'Segoe UI',Arial,sans-serif;background:#f8fafc;color:#1e293b}}
    .hdr{{background:linear-gradient(135deg,#003087 0%,#1a4da8 100%);color:white;
          padding:14px 24px;display:flex;align-items:center;justify-content:space-between;
          position:sticky;top:0;z-index:10;box-shadow:0 2px 8px rgba(0,0,0,.3)}}
    .badge{{background:{accent};color:white;font-size:11px;font-weight:700;
            padding:3px 10px;border-radius:20px;letter-spacing:.5px;text-transform:uppercase}}
    .brand{{font-size:11px;color:#93c5fd;font-weight:600}}
    .meta{{background:white;border-bottom:1px solid #e2e8f0;
           padding:10px 24px;display:flex;gap:24px;flex-wrap:wrap}}
    .ml{{font-size:10px;text-transform:uppercase;color:#94a3b8;font-weight:600}}
    .mv{{font-size:13px;font-weight:600;color:#1e293b}}
    .wrap{{max-width:860px;margin:20px auto;padding:0 24px 40px}}
    .card{{background:white;border-radius:12px;border:1px solid #e2e8f0;
           box-shadow:0 1px 4px rgba(0,0,0,.06);overflow:hidden}}
    .ch{{background:#f8fafc;border-bottom:1px solid #e2e8f0;padding:14px 20px}}
    .ct{{font-size:15px;font-weight:700;color:#0f172a}}
    .cs{{font-size:12px;color:#64748b;margin-top:2px}}
    .wm{{background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;
         padding:10px 16px;margin:12px 20px;display:flex;align-items:center;gap:8px;font-size:12px;color:#9a3412}}
    .tx{{padding:20px;font-family:'Courier New',monospace;font-size:13px;
         line-height:1.8;color:#334155;white-space:pre-wrap;word-break:break-word;background:#fafafa}}
    .cbar{{height:4px;background:#e2e8f0;border-radius:2px;overflow:hidden;width:80px}}
    .cfill{{height:100%;border-radius:2px;background:{conf_color};width:{confidence}%}}
    .stripe{{height:4px;background:linear-gradient(90deg,#FF9933 33%,#fff 33%,#fff 66%,#138808 66%);}}
  </style>
</head>
<body>
  <div class="stripe"></div>
  <div class="hdr">
    <div style="display:flex;align-items:center;gap:12px">
      <div>
        <div style="font-size:14px;font-weight:700">📄 {filename}{tamper_html}</div>
        <div class="brand">PARAKH AI · Document Viewer · OFFICER ACCESS ONLY</div>
      </div>
      <span class="badge">{classification}</span>
    </div>
    <div style="font-size:11px;color:#93c5fd;text-align:right">
      Confidence: {confidence}%<br>
      <div class="cbar" style="margin-top:4px"><div class="cfill"></div></div>
    </div>
  </div>

  <div class="meta">
    <div><div class="ml">Document</div><div class="mv">{filename}</div></div>
    <div><div class="ml">Type</div><div class="mv">{classification}</div></div>
    <div><div class="ml">Pages</div><div class="mv">{pages}</div></div>
    <div><div class="ml">Bidder ID</div><div class="mv">{bidder_id}</div></div>
    <div><div class="ml">Uploaded</div><div class="mv">{uploaded_at[:10] if uploaded_at else '—'}</div></div>
    <div><div class="ml">Confidence</div><div class="mv">{confidence}%</div></div>
  </div>

  <div class="wrap">
    <div class="card">
      <div class="ch">
        <div class="ct">📝 Extracted Text Content</div>
        <div class="cs">AI-extracted text via OCR / PyMuPDF — used for compliance verification</div>
      </div>
      <div class="wm">
        🔒 <span><strong>Restricted Access</strong> — Confidential document, authorised Procurement Officers only.</span>
      </div>
      <div class="tx">{extracted_text}</div>
    </div>
  </div>
</body>
</html>"""
    return Response(html, mimetype='text/html')
