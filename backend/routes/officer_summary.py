"""
Officer Summary — PARAKH AI
Consolidated bidder summary endpoint and print-ready HTML report generation.
Reuses the existing compliance engine (compliance_service) as the single
source of truth — no duplicate scoring logic.
"""
from datetime import datetime
from flask import Blueprint, jsonify

from routes.auth import require_role
from services.compliance_service import (
    get_compliance_results,
    calculate_score,
    get_cross_document_checks,
)
from services.tender_service import get_requirements_for_tender, get_tender_by_id
from services.document_service import get_documents_for_bidder

officer_summary_bp = Blueprint('officer_summary', __name__)


def _load_bidders():
    from services.json_cache import load_cached
    return load_cached('bidders.json')


def _classify_bidder(compliance_results, score_data, requirements, bidder):
    """Derive a display compliance status from the existing evaluation data.

    Rules (aligned with the existing risk-level engine):
      - Not analyzed                      → 'PENDING'
      - risk_level HIGH                   → 'NON_COMPLIANT'
      - risk_level MEDIUM                 → 'UNDER_REVIEW'
      - risk_level LOW + missing mandatory → 'UNDER_REVIEW'
      - risk_level LOW                    → 'COMPLIANT'
    """
    if bidder.get('status') != 'analyzed':
        return 'PENDING'

    risk = score_data.get('risk_level', 'UNKNOWN')

    if risk == 'HIGH':
        return 'NON_COMPLIANT'
    if risk == 'MEDIUM':
        return 'UNDER_REVIEW'

    # LOW risk — but flag if mandatory docs are still missing
    req_mandatory = {r['id']: r.get('mandatory', True) for r in requirements}
    for req_id, result in compliance_results.items():
        if result.get('status') in ('MISSING', 'NON_COMPLIANT') and req_mandatory.get(req_id, True):
            return 'UNDER_REVIEW'

    return 'COMPLIANT'


def _build_bidder_summary(bidder, requirements, all_requirement_map):
    """Build the consolidated per-bidder summary using the existing engine."""
    bidder_id = bidder['id']
    documents = get_documents_for_bidder(bidder_id)
    uploaded_docs = [d for d in documents if d.get('saved_path')]

    compliance_results = get_compliance_results(
        bidder_id, requirements, documents, bidder=bidder
    )
    score_data = calculate_score(compliance_results, requirements)
    cross_checks = get_cross_document_checks(bidder_id)

    status_counts = score_data.get('status_counts', {})
    total_req = score_data.get('total_requirements', len(requirements))

    missing_items = []
    review_items = []
    non_compliant_items = []
    issues = []

    for req_id, result in compliance_results.items():
        req = all_requirement_map.get(req_id, {})
        item = {
            'requirement_id': req_id,
            'title': req.get('title', req_id),
            'category': req.get('category', ''),
            'mandatory': req.get('mandatory', True),
            'status': result.get('status', 'MISSING'),
            'found_value': result.get('found_value', ''),
            'concern': result.get('concern', ''),
        }
        st = result.get('status')
        if st == 'MISSING':
            missing_items.append(item)
        elif st == 'REVIEW':
            review_items.append(item)
        elif st == 'NON_COMPLIANT':
            non_compliant_items.append(item)

    # Cross-document mismatches become issues
    for check in cross_checks:
        if check.get('status') in ('MISMATCH', 'MINOR_VARIATION'):
            issues.append({
                'type': 'Cross-Document',
                'detail': check.get('detail', ''),
                'severity': check.get('severity', 'WARNING'),
            })

    # Concerns from compliance results become issues
    for item in review_items + non_compliant_items:
        if item.get('concern'):
            issues.append({
                'type': item['title'],
                'detail': item['concern'],
                'severity': 'WARNING' if item['status'] == 'REVIEW' else 'HIGH',
            })

    compliance_status = _classify_bidder(
        compliance_results, score_data, requirements, bidder
    )

    verified = status_counts.get('VERIFIED', 0)
    compliance_pct = round(verified / total_req * 100) if total_req else 0

    return {
        'id': bidder_id,
        'name': bidder.get('name') or bidder_id,
        'gstin': bidder.get('gstin'),
        'pan': bidder.get('pan'),
        'email': bidder.get('email'),
        'phone': bidder.get('phone'),
        'state': bidder.get('state'),
        'type': bidder.get('type'),
        'submitted_at': bidder.get('submitted_at'),
        'analyzed_at': bidder.get('analyzed_at'),
        'status': bidder.get('status', 'registered'),
        'officer_decision': bidder.get('officer_decision'),
        'officer_remarks': bidder.get('officer_remarks'),
        'document_count': len(uploaded_docs),
        'overall_score': score_data.get('overall_score', 0),
        'risk_level': score_data.get('risk_level', bidder.get('risk_level', 'UNKNOWN')),
        'category_scores': score_data.get('category_scores', {}),
        'status_counts': status_counts,
        'total_requirements': total_req,
        'compliance_pct': compliance_pct,
        'compliance_status': compliance_status,
        'missing_items': missing_items,
        'review_items': review_items,
        'non_compliant_items': non_compliant_items,
        'issues': issues,
        'cross_document_checks': cross_checks,
    }


@officer_summary_bp.route('/api/officer/tenders/<tender_id>/summary', methods=['GET'])
@require_role('OFFICER')
def tender_summary(tender_id):
    """Consolidated summary of ALL bidders for a tender (single source of truth)."""
    tender = get_tender_by_id(tender_id)
    if not tender:
        return jsonify({'error': 'Tender not found'}), 404

    bidders = _load_bidders()
    tender_bidders = [b for b in bidders if b.get('tender_id') == tender_id]
    requirements = get_requirements_for_tender(tender_id)
    all_requirement_map = {r['id']: r for r in requirements}

    bidder_summaries = [
        _build_bidder_summary(b, requirements, all_requirement_map)
        for b in tender_bidders
    ]

    # Sort by overall score descending (default view)
    bidder_summaries.sort(key=lambda x: x['overall_score'], reverse=True)

    # ── Aggregate statistics ─────────────────────────────────────
    total = len(bidder_summaries)
    compliant = sum(1 for b in bidder_summaries if b['compliance_status'] == 'COMPLIANT')
    under_review = sum(1 for b in bidder_summaries if b['compliance_status'] == 'UNDER_REVIEW')
    non_compliant = sum(1 for b in bidder_summaries if b['compliance_status'] == 'NON_COMPLIANT')
    pending = sum(1 for b in bidder_summaries if b['compliance_status'] == 'PENDING')
    with_missing = sum(1 for b in bidder_summaries if b['missing_items'])
    with_review_items = sum(1 for b in bidder_summaries if b['review_items'])

    scored = [b['overall_score'] for b in bidder_summaries if b['status'] == 'analyzed']
    avg_score = round(sum(scored) / len(scored), 1) if scored else 0
    highest_score = max(scored) if scored else 0

    return jsonify({
        'tender': {
            'id': tender.get('id'),
            'title': tender.get('title'),
            'department': tender.get('department'),
            'organisation': tender.get('organisation'),
            'estimated_value_display': tender.get('estimated_value_display'),
            'submission_deadline': tender.get('submission_deadline'),
            'status': tender.get('status'),
            'workflow_stage': tender.get('workflow_stage'),
            'category': tender.get('category'),
        },
        'generated_at': datetime.now().isoformat(),
        'total_requirements': len(requirements),
        'requirements': [
            {
                'id': r['id'],
                'title': r.get('title'),
                'category': r.get('category'),
                'mandatory': r.get('mandatory', True),
            }
            for r in requirements
        ],
        'statistics': {
            'total_bidders': total,
            'compliant': compliant,
            'under_review': under_review,
            'non_compliant': non_compliant,
            'pending': pending,
            'with_missing_documents': with_missing,
            'with_review_items': with_review_items,
            'average_score': avg_score,
            'highest_score': highest_score,
        },
        'bidders': bidder_summaries,
    })


# ── Print-ready HTML report ──────────────────────────────────────

_STATUS_COLOR = {
    'VERIFIED': '#146c2e',
    'REVIEW': '#b87300',
    'NON_COMPLIANT': '#a3180a',
    'MISSING': '#3d4a5c',
}
_STATUS_LABEL = {
    'VERIFIED': 'VERIFIED',
    'REVIEW': 'NEEDS REVIEW',
    'NON_COMPLIANT': 'NON-COMPLIANT',
    'MISSING': 'MISSING',
}
_RISK_COLOR = {'LOW': '#146c2e', 'MEDIUM': '#b87300', 'HIGH': '#a3180a'}
_STATUS_COLOR_MAP = {
    'COMPLIANT': '#146c2e',
    'UNDER_REVIEW': '#b87300',
    'NON_COMPLIANT': '#a3180a',
    'PENDING': '#3d4a5c',
}
_STATUS_LABEL_MAP = {
    'COMPLIANT': 'COMPLIANT',
    'UNDER_REVIEW': 'UNDER REVIEW',
    'NON_COMPLIANT': 'NON-COMPLIANT',
    'PENDING': 'PENDING ANALYSIS',
}


def _esc(value):
    """HTML-escape a value for safe inline rendering."""
    if value is None:
        return ''
    return (str(value)
            .replace('&', '&amp;')
            .replace('<', '&lt;')
            .replace('>', '&gt;')
            .replace('"', '&quot;'))


def _generate_summary_html(tender, requirements, bidder_summaries, statistics, generated_at):
    """Build the complete print-ready consolidated bidder report (A4)."""
    gen_str = datetime.now().strftime('%d %B %Y, %H:%M IST')

    # ── Comparison table rows ────────────────────────────────────
    comparison_rows = []
    for idx, b in enumerate(bidder_summaries, 1):
        sc = b['status_counts']
        missing_titles = ', '.join(i['title'] for i in b['missing_items']) or 'None'
        issues_count = len(b['issues'])
        status_color = _STATUS_COLOR_MAP.get(b['compliance_status'], '#3d4a5c')
        risk_color = _RISK_COLOR.get(b['risk_level'], '#3d4a5c')
        comparison_rows.append(f"""
        <tr>
          <td style="padding:8px;border:1px solid #c8d0db;text-align:center">{idx}</td>
          <td style="padding:8px;border:1px solid #c8d0db"><strong>{_esc(b['name'])}</strong><br><span style="font-size:11px;color:#6b7a8d">{b['id']}</span></td>
          <td style="padding:8px;border:1px solid #c8d0db;text-align:center">{b['document_count']}/{b['total_requirements']}</td>
          <td style="padding:8px;border:1px solid #c8d0db;font-size:11px">{_esc(missing_titles)}</td>
          <td style="padding:8px;border:1px solid #c8d0db;text-align:center"><span style="color:{status_color};font-weight:700">{_STATUS_LABEL_MAP.get(b['compliance_status'], b['compliance_status'])}</span></td>
          <td style="padding:8px;border:1px solid #c8d0db;text-align:center">{sc.get('VERIFIED', 0)}</td>
          <td style="padding:8px;border:1px solid #c8d0db;text-align:center">{sc.get('REVIEW', 0)}</td>
          <td style="padding:8px;border:1px solid #c8d0db;text-align:center">{sc.get('NON_COMPLIANT', 0)}</td>
          <td style="padding:8px;border:1px solid #c8d0db;text-align:center">{sc.get('MISSING', 0)}</td>
          <td style="padding:8px;border:1px solid #c8d0db;text-align:center;font-weight:700;font-size:15px">{b['overall_score']}%</td>
          <td style="padding:8px;border:1px solid #c8d0db;text-align:center"><span style="color:{risk_color};font-weight:600">{b['risk_level']}</span></td>
          <td style="padding:8px;border:1px solid #c8d0db;text-align:center;font-size:12px">{issues_count}</td>
        </tr>""")

    # ── Missing / pending information section ────────────────────
    missing_sections = []
    for b in bidder_summaries:
        if not b['missing_items'] and not b['review_items']:
            missing_sections.append(f"""
        <div style="margin-bottom:14px">
          <strong>{_esc(b['name'])}</strong> ({b['id']})<br>
          <span style="color:#146c2e;font-size:12px">No missing documents. All mandatory requirements submitted.</span>
        </div>""")
        else:
            items_html = []
            for item in b['missing_items']:
                mand = 'MANDATORY' if item['mandatory'] else 'OPTIONAL'
                color = '#a3180a' if item['mandatory'] else '#3d4a5c'
                items_html.append(
                    f'<li style="margin-bottom:4px"><strong>{_esc(item["title"])}</strong> – Missing '
                    f'<span style="color:{color};font-size:11px">({mand})</span></li>'
                )
            for item in b['review_items']:
                items_html.append(
                    f'<li style="margin-bottom:4px"><strong>{_esc(item["title"])}</strong> – Pending Verification '
                    f'<span style="color:#b87300;font-size:11px">(REVIEW)</span></li>'
                )
            missing_sections.append(f"""
        <div style="margin-bottom:14px">
          <strong>{_esc(b['name'])}</strong> ({b['id']})
          <ul style="margin:4px 0 0 18px;padding:0">{''.join(items_html)}</ul>
        </div>""")

    # ── Observations section ─────────────────────────────────────
    observation_blocks = []
    for b in bidder_summaries:
        sc = b['status_counts']
        parts = []
        parts.append(
            f"Bidder submitted {b['document_count']} of {b['total_requirements']} required documents."
        )
        if b['missing_items']:
            mand_missing = [i for i in b['missing_items'] if i['mandatory']]
            if mand_missing:
                parts.append(
                    f"{len(mand_missing)} mandatory document(s) missing: "
                    f"{', '.join(i['title'] for i in mand_missing)}."
                )
            else:
                parts.append(f"{len(b['missing_items'])} optional document(s) not submitted.")
        else:
            parts.append("All mandatory requirements submitted.")
        if b['review_items']:
            parts.append(
                f"{len(b['review_items'])} item(s) pending verification: "
                f"{', '.join(i['title'] for i in b['review_items'])}."
            )
        if b['non_compliant_items']:
            parts.append(
                f"{len(b['non_compliant_items'])} requirement(s) non-compliant: "
                f"{', '.join(i['title'] for i in b['non_compliant_items'])}."
            )
        parts.append(
            f"Compliance score: {b['overall_score']}% "
            f"({sc.get('VERIFIED', 0)} verified, {sc.get('REVIEW', 0)} review, "
            f"{sc.get('NON_COMPLIANT', 0)} non-compliant, {sc.get('MISSING', 0)} missing). "
            f"Risk level: {b['risk_level']}."
        )
        if b['officer_decision']:
            parts.append(f"Officer decision: {b['officer_decision']}.")

        observation_blocks.append(f"""
        <div style="margin-bottom:12px">
          <strong>Bidder: {_esc(b['name'])}</strong> ({b['id']})<br>
          <span style="font-size:12px;color:#3d4a5c">{_esc(' '.join(parts))}</span>
        </div>""")

    # ── Category score breakdown ─────────────────────────────────
    cat_rows = []
    for b in bidder_summaries:
        cats = b.get('category_scores', {})
        cat_str = ' | '.join(f"{cat}: {pct}%" for cat, pct in cats.items()) or 'Not evaluated'
        cat_rows.append(f"""
        <tr>
          <td style="padding:6px 8px;border:1px solid #c8d0db"><strong>{_esc(b['name'])}</strong></td>
          <td style="padding:6px 8px;border:1px solid #c8d0db;font-size:11px">{_esc(cat_str)}</td>
        </tr>""")

    stats = statistics
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>PARAKH AI — Consolidated Bidder Summary — {_esc(tender.get('id', ''))}</title>
<style>
  @page {{ size: A4; margin: 12mm; }}
  body {{ font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a2e; margin: 0; padding: 0; font-size: 12px; }}
  .header {{ background: #00205c; color: white; padding: 20px 28px; }}
  .header h1 {{ margin: 0; font-size: 20px; letter-spacing: 0.5px; }}
  .header p {{ margin: 4px 0 0; font-size: 12px; opacity: 0.85; }}
  .content {{ padding: 20px 28px; }}
  .section-title {{ font-size: 14px; font-weight: 700; color: #00205c; margin: 22px 0 10px; border-left: 4px solid #003380; padding-left: 8px; page-break-after: avoid; }}
  table {{ width: 100%; border-collapse: collapse; }}
  th {{ background: #e8edf5; text-align: left; padding: 8px; font-size: 11px; color: #3d4a5c; border: 1px solid #b8c4d0; text-transform: uppercase; }}
  .stats-grid {{ display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }}
  .stat-box {{ border: 1px solid #c8d0db; padding: 10px 14px; flex: 1; min-width: 110px; text-align: center; page-break-inside: avoid; }}
  .stat-box .value {{ font-size: 22px; font-weight: 700; }}
  .stat-box .label {{ font-size: 10px; color: #6b7a8d; margin-top: 2px; text-transform: uppercase; }}
  .info-table td {{ padding: 5px 8px; font-size: 12px; }}
  .info-table td:first-child {{ color: #6b7a8d; width: 180px; }}
  tr {{ page-break-inside: avoid; }}
  .footer {{ margin-top: 30px; padding-top: 12px; border-top: 1px solid #c8d0db; font-size: 10px; color: #8a9aaa; text-align: center; }}
  @media print {{
    body {{ -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
    .header {{ background: #00205c !important; -webkit-print-color-adjust: exact; }}
  }}
</style>
</head>
<body>
<div class="header">
  <h1>PARAKH AI — CONSOLIDATED BIDDER SUMMARY</h1>
  <p>Evidence-Driven Bid Compliance Intelligence &nbsp;|&nbsp; Team Aevora &nbsp;|&nbsp; SIH 2026 #26100</p>
</div>
<div class="content">

  <div class="section-title">Tender Information</div>
  <table class="info-table">
    <tr><td>Tender Name</td><td><strong>{_esc(tender.get('title', ''))}</strong></td></tr>
    <tr><td>Tender ID</td><td>{_esc(tender.get('id', ''))}</td></tr>
    <tr><td>Department</td><td>{_esc(tender.get('department', ''))}</td></tr>
    <tr><td>Estimated Value</td><td>{_esc(tender.get('estimated_value_display', ''))}</td></tr>
    <tr><td>Submission Deadline</td><td>{_esc(tender.get('submission_deadline', ''))}</td></tr>
    <tr><td>Report Generated</td><td>{gen_str}</td></tr>
  </table>

  <div class="section-title">Summary Statistics</div>
  <div class="stats-grid">
    <div class="stat-box"><div class="value" style="color:#003380">{stats['total_bidders']}</div><div class="label">Total Bidders</div></div>
    <div class="stat-box"><div class="value" style="color:#146c2e">{stats['compliant']}</div><div class="label">Compliant</div></div>
    <div class="stat-box"><div class="value" style="color:#b87300">{stats['under_review']}</div><div class="label">Under Review</div></div>
    <div class="stat-box"><div class="value" style="color:#a3180a">{stats['non_compliant']}</div><div class="label">Non-Compliant</div></div>
    <div class="stat-box"><div class="value" style="color:#3d4a5c">{stats['pending']}</div><div class="label">Pending</div></div>
    <div class="stat-box"><div class="value" style="color:#003380">{stats['average_score']}%</div><div class="label">Average Score</div></div>
    <div class="stat-box"><div class="value" style="color:#146c2e">{stats['highest_score']}%</div><div class="label">Highest Score</div></div>
  </div>

  <div class="section-title">Bidder Comparison</div>
  <table>
    <thead>
      <tr>
        <th>S.No</th><th>Bidder</th><th>Docs</th><th>Missing Items</th><th>Compliance</th>
        <th>Verified</th><th>Review</th><th>Non-Compl.</th><th>Missing</th>
        <th>Score</th><th>Risk</th><th>Issues</th>
      </tr>
    </thead>
    <tbody>
      {''.join(comparison_rows)}
    </tbody>
  </table>

  <div class="section-title">Missing / Pending Information</div>
  {''.join(missing_sections)}

  <div class="section-title">Evaluation Summary — Category Scores</div>
  <table>
    <thead><tr><th>Bidder</th><th>Category Breakdown</th></tr></thead>
    <tbody>{''.join(cat_rows)}</tbody>
  </table>

  <div class="section-title">Key Observations</div>
  {''.join(observation_blocks)}

  <div class="footer">
    This report was generated by PARAKH AI — Team Aevora · SIH 2026 #26100 · Demo Build.<br>
    AI-assisted compliance verification does not replace final officer review and approval.<br>
    <strong>AI verifies · AI identifies risks · AI recommends · Officer decides.</strong><br>
    Generated: {gen_str}
  </div>
</div>
</body>
</html>"""
    return html


@officer_summary_bp.route('/api/officer/tenders/<tender_id>/summary/report', methods=['GET'])
@require_role('OFFICER')
def tender_summary_report(tender_id):
    """Generate a print-ready HTML consolidated bidder report."""
    tender = get_tender_by_id(tender_id)
    if not tender:
        return jsonify({'error': 'Tender not found'}), 404

    bidders = _load_bidders()
    tender_bidders = [b for b in bidders if b.get('tender_id') == tender_id]
    requirements = get_requirements_for_tender(tender_id)
    all_requirement_map = {r['id']: r for r in requirements}

    bidder_summaries = [
        _build_bidder_summary(b, requirements, all_requirement_map)
        for b in tender_bidders
    ]
    bidder_summaries.sort(key=lambda x: x['overall_score'], reverse=True)

    total = len(bidder_summaries)
    scored = [b['overall_score'] for b in bidder_summaries if b['status'] == 'analyzed']
    statistics = {
        'total_bidders': total,
        'compliant': sum(1 for b in bidder_summaries if b['compliance_status'] == 'COMPLIANT'),
        'under_review': sum(1 for b in bidder_summaries if b['compliance_status'] == 'UNDER_REVIEW'),
        'non_compliant': sum(1 for b in bidder_summaries if b['compliance_status'] == 'NON_COMPLIANT'),
        'pending': sum(1 for b in bidder_summaries if b['compliance_status'] == 'PENDING'),
        'with_missing_documents': sum(1 for b in bidder_summaries if b['missing_items']),
        'with_review_items': sum(1 for b in bidder_summaries if b['review_items']),
        'average_score': round(sum(scored) / len(scored), 1) if scored else 0,
        'highest_score': max(scored) if scored else 0,
    }

    html = _generate_summary_html(
        tender, requirements, bidder_summaries, statistics, datetime.now().isoformat()
    )
    return html
