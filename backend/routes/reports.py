import json, os
from flask import Blueprint, jsonify, send_file, request, Response
from config import DATA_DIR, REPORTS_DIR
from services.compliance_service import get_compliance_results, get_cross_document_checks
from services.compliance_service import calculate_score
from services.tender_service import get_requirements_for_tender, get_tender_by_id
from services.document_service import get_documents_for_bidder
from services.report_service import generate_html_report, save_report

reports_bp = Blueprint('reports', __name__)


from database.db_utils import load_cached as load_json, save_cached as save_json


def load_bidders():
    return load_json('bidders.json')


@reports_bp.route('/api/bidders/<bidder_id>/report', methods=['GET'])
def get_report(bidder_id):
    """Generate and return compliance report data."""
    bidders = load_bidders()
    bidder = next((b for b in bidders if b['id'] == bidder_id), None)
    if not bidder:
        return jsonify({'error': 'Bidder not found'}), 404

    tender_id = bidder.get('tender_id')
    tender = get_tender_by_id(tender_id)
    requirements = get_requirements_for_tender(tender_id)
    documents = get_documents_for_bidder(bidder_id)

    compliance_results = get_compliance_results(bidder_id, requirements, documents, bidder=bidder)
    score_data = calculate_score(compliance_results, requirements)
    cross_checks = get_cross_document_checks(bidder_id)

    # Generate HTML report
    html = generate_html_report(bidder, tender, compliance_results, score_data, cross_checks)
    filename = save_report(bidder_id, html)

    return jsonify({
        'report_file': filename,
        'bidder': bidder,
        'tender': tender,
        'score': score_data,
        'html': html,
    })


@reports_bp.route('/api/bidders/<bidder_id>/report/download', methods=['GET'])
def download_report(bidder_id):
    """Download the latest compliance report as HTML file."""
    import re
    from datetime import datetime

    bidders = load_bidders()
    bidder = next((b for b in bidders if b['id'] == bidder_id), None)
    if not bidder:
        return jsonify({'error': 'Bidder not found'}), 404

    # Find the latest report file for this bidder
    try:
        files = [f for f in os.listdir(REPORTS_DIR) if f.startswith(f'report_{bidder_id}_') and f.endswith('.html')]
    except Exception:
        files = []

    if files:
        # Sort by timestamp embedded in filename
        files.sort(reverse=True)
        report_path = os.path.join(REPORTS_DIR, files[0])
        if os.path.exists(report_path):
            return send_file(
                report_path,
                mimetype='text/html',
                as_attachment=True,
                download_name=f'compliance_report_{bidder_id}_{datetime.now().strftime("%Y%m%d")}.html'
            )

    # Generate on-the-fly if no cached report
    tender_id = bidder.get('tender_id')
    tender = get_tender_by_id(tender_id)
    requirements = get_requirements_for_tender(tender_id)
    documents = get_documents_for_bidder(bidder_id)
    compliance_results = get_compliance_results(bidder_id, requirements, documents, bidder=bidder)
    score_data = calculate_score(compliance_results, requirements)
    cross_checks = get_cross_document_checks(bidder_id)
    html = generate_html_report(bidder, tender, compliance_results, score_data, cross_checks)

    return Response(
        html,
        mimetype='text/html',
        headers={'Content-Disposition': f'attachment; filename=compliance_report_{bidder_id}.html'}
    )


@reports_bp.route('/api/reports/list', methods=['GET'])
def list_reports():
    """List all saved compliance reports."""
    try:
        files = [f for f in os.listdir(REPORTS_DIR) if f.endswith('.html')]
    except Exception:
        files = []

    reports = []
    for f in sorted(files, reverse=True):
        parts = f.replace('.html', '').split('_')
        if len(parts) >= 3:
            reports.append({
                'filename': f,
                'bidder_id': parts[1] if len(parts) > 1 else 'unknown',
                'generated_at': f'{parts[-2][:4]}-{parts[-2][4:6]}-{parts[-2][6:8]} {parts[-1][:2]}:{parts[-1][2:4]}' if len(parts[-2]) == 8 else parts[-1],
                'url': f'/api/reports/file/{f}',
            })
    return jsonify(reports)


@reports_bp.route('/api/reports/file/<filename>', methods=['GET'])
def serve_report_file(filename):
    """Serve a specific saved report file."""
    # Security: ensure no path traversal
    safe_name = os.path.basename(filename)
    report_path = os.path.join(REPORTS_DIR, safe_name)
    if not os.path.exists(report_path):
        return jsonify({'error': 'Report not found'}), 404
    return send_file(report_path, mimetype='text/html')


@reports_bp.route('/api/audit', methods=['GET'])
def get_audit_trail():
    audit = load_json('audit.json')

    tender_id = request.args.get('tender_id')
    bidder_id = request.args.get('bidder_id')
    severity = request.args.get('severity')
    limit = request.args.get('limit', type=int)

    if tender_id:
        audit = [a for a in audit if a.get('tender_id') == tender_id or a.get('tender_id') is None]
    if bidder_id:
        audit = [a for a in audit if a.get('bidder_id') == bidder_id or a.get('bidder_id') is None]
    if severity:
        audit = [a for a in audit if a.get('severity') == severity]

    result = sorted(audit, key=lambda x: x.get('timestamp', ''), reverse=True)
    if limit:
        result = result[:limit]

    return jsonify(result)
