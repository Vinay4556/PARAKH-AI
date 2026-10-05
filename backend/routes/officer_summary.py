"""
Officer Summary — PARAKH AI
Consolidated bidder summary endpoint and print-ready HTML report generation.
Reuses the existing compliance engine (compliance_service) as the single
source of truth — no duplicate scoring logic.
"""
import base64
import io
from datetime import datetime
from flask import Blueprint, jsonify

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

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


def _load_activity_for_tender(tender_id):
    """
    Collect every event related to a tender from all data sources and return
    them as a unified timeline sorted newest-first.

    Sources:
      - audit.json            → officer decisions, analysis runs, corrigenda, bids, etc.
      - documents.json        → every document upload for bidders in this tender
      - rejection_feedback.json → rejection feedback records & sent-feedback events
      - bids.json             → bid submissions, stage changes
      - clarifications.json   → clarification requests and responses
    """
    import json as _json
    import os as _os
    from config import DATA_DIR

    def _load(fname):
        from database.db_utils import load_cached
        return load_cached(fname)

    events = []

    # ── 1. Audit trail ────────────────────────────────────────────
    for entry in _load('audit.json'):
        if entry.get('tender_id') != tender_id:
            continue
        events.append({
            'timestamp':   entry.get('timestamp', ''),
            'source':      'audit',
            'actor':       entry.get('actor', '—'),
            'action':      entry.get('action', ''),
            'detail':      entry.get('detail', ''),
            'bidder_id':   entry.get('bidder_id'),
            'severity':    entry.get('severity', 'info'),
            # Rejection-specific structured fields (present on DISQUALIFY entries)
            'rejection_category': entry.get('rejection_category'),
            'rejection_stage':    entry.get('rejection_stage'),
            'rejection_reason':   entry.get('rejection_reason'),
        })

    # ── 2. Document uploads ───────────────────────────────────────
    # Resolve which bidder IDs belong to this tender
    tender_bidder_ids = {
        b['id'] for b in _load('bidders.json')
        if b.get('tender_id') == tender_id
    }
    for doc in _load('documents.json'):
        if doc.get('bidder_id') not in tender_bidder_ids:
            continue
        if not doc.get('saved_path'):
            continue  # skip demo seed docs
        events.append({
            'timestamp':  doc.get('uploaded_at', ''),
            'source':     'document',
            'actor':      doc.get('bidder_id', '—'),
            'action':     'Document Uploaded',
            'detail':     f"{doc.get('filename', 'file')} ({doc.get('classification', 'UNKNOWN')}) — {doc.get('pages', '?')} pages, confidence {round((doc.get('confidence') or 0) * 100)}%",
            'bidder_id':  doc.get('bidder_id'),
            'severity':   'info',
            'doc_id':     doc.get('id'),
            'doc_name':   doc.get('filename'),
            'doc_type':   doc.get('classification'),
        })

    # ── 3. Rejection feedback ─────────────────────────────────────
    for fb in _load('rejection_feedback.json'):
        if fb.get('tender_id') != tender_id:
            continue
        # Creation event (auto-created on DISQUALIFY)
        events.append({
            'timestamp':  fb.get('created_at', ''),
            'source':     'rejection',
            'actor':      fb.get('officer', '—'),
            'action':     'Bidder Disqualified',
            'detail':     (
                f"{fb.get('bidder_name', fb.get('bidder_id'))} — "
                f"Stage: {fb.get('rejection_stage')}. "
                f"Category: {fb.get('rejection_category')}. "
                f'Reason: "{fb.get("rejection_reason", "")}"'
            ),
            'bidder_id':  fb.get('bidder_id'),
            'severity':   'error',
            'rejection_category': fb.get('rejection_category'),
            'rejection_stage':    fb.get('rejection_stage'),
            'rejection_reason':   fb.get('rejection_reason'),
        })
        # Optional follow-up feedback message
        if fb.get('additional_feedback') and fb.get('feedback_sent_at'):
            events.append({
                'timestamp': fb['feedback_sent_at'],
                'source':    'rejection_feedback',
                'actor':     fb.get('officer', '—'),
                'action':    'Rejection Feedback Sent to Bidder',
                'detail':    f'To {fb.get("bidder_name", fb.get("bidder_id"))}: "{fb["additional_feedback"]}"',
                'bidder_id': fb.get('bidder_id'),
                'severity':  'info',
            })

    # ── 4. Bids ───────────────────────────────────────────────────
    for bid in _load('bids.json'):
        if bid.get('tender_id') != tender_id:
            continue
        events.append({
            'timestamp': bid.get('submitted_at', ''),
            'source':    'bid',
            'actor':     bid.get('bidder_name', bid.get('bidder_id', '—')),
            'action':    'Bid Submitted',
            'detail':    (
                f"Bid {bid.get('id')} from {bid.get('bidder_name', bid.get('bidder_id'))}. "
                f"Status: {bid.get('status', '—')}. "
                + (f"Quoted: {bid.get('quoted_price_display', '—')}." if bid.get('quoted_price_display') else '')
            ),
            'bidder_id': bid.get('bidder_id'),
            'severity':  'info',
            'bid_id':    bid.get('id'),
        })
        # Stage changes
        for stage_event in bid.get('stage_history', []):
            events.append({
                'timestamp': stage_event.get('changed_at', ''),
                'source':    'bid_stage',
                'actor':     stage_event.get('changed_by', '—'),
                'action':    f"Bid Stage → {stage_event.get('to_stage', '—')}",
                'detail':    f"Bid {bid.get('id')} moved to {stage_event.get('to_stage')}.",
                'bidder_id': bid.get('bidder_id'),
                'severity':  'info',
            })

    # ── 5. Clarifications ─────────────────────────────────────────
    for clr in _load('clarifications.json'):
        if clr.get('tender_id') != tender_id:
            continue
        events.append({
            'timestamp': clr.get('created_at', ''),
            'source':    'clarification',
            'actor':     'Procurement Officer',
            'action':    'Clarification Requested',
            'detail':    f'To {clr.get("bidder_id", "bidder")}: {clr.get("subject", clr.get("message", "")[:120])}',
            'bidder_id': clr.get('bidder_id'),
            'severity':  'warning',
        })
        if clr.get('response') and clr.get('responded_at'):
            events.append({
                'timestamp': clr['responded_at'],
                'source':    'clarification_response',
                'actor':     clr.get('bidder_id', '—'),
                'action':    'Clarification Responded',
                'detail':    f'{clr.get("bidder_id")}: "{clr.get("response", "")[:120]}"',
                'bidder_id': clr.get('bidder_id'),
                'severity':  'info',
            })

    # Sort newest first, remove events with no timestamp
    events = [e for e in events if e.get('timestamp')]
    events.sort(key=lambda e: e['timestamp'], reverse=True)
    return events


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

    # ── Activity timeline ────────────────────────────────────────
    activity = _load_activity_for_tender(tender_id)

    # ── All tenders list (for the selector dropdown) ─────────────
    from services.tender_service import get_all_tenders
    all_tenders = [
        {'id': t['id'], 'title': t.get('title', t['id']), 'status': t.get('status', '—')}
        for t in get_all_tenders()
    ]

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
        'activity': activity,
        'all_tenders': all_tenders,
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


def _generate_chart_base64(chart_func):
    """Generate a chart and return as base64-encoded PNG."""
    fig, ax = plt.subplots(figsize=(8, 4))
    chart_func(ax)
    buf = io.BytesIO()
    fig.savefig(buf, format='png', dpi=100, bbox_inches='tight', facecolor='white')
    plt.close(fig)
    buf.seek(0)
    return base64.b64encode(buf.read()).decode('utf-8')


def _score_distribution_chart(ax, bidder_summaries):
    names = [b['name'][:18] for b in bidder_summaries]
    scores = [b['overall_score'] for b in bidder_summaries]
    colors = ['#146c2e' if s >= 85 else '#d97706' if s >= 70 else '#a3180a' for s in scores]
    ax.barh(names, scores, color=colors, height=0.6)
    ax.set_xlim(0, 100)
    ax.set_xlabel('Overall Score (%)', fontsize=10)
    ax.set_title('Bidder Score Distribution', fontsize=12, fontweight='bold')
    ax.grid(axis='x', alpha=0.3)


def _compliance_chart(ax, statistics):
    labels = ['Compliant', 'Under Review', 'Non-Compliant', 'Pending']
    values = [statistics['compliant'], statistics['under_review'], statistics['non_compliant'], statistics['pending']]
    colors = ['#146c2e', '#d97706', '#a3180a', '#6b7a8d']
    non_zero = [(l, v, c) for l, v, c in zip(labels, values, colors) if v > 0]
    if non_zero:
        labels_nz, values_nz, colors_nz = zip(*non_zero)
        ax.pie(values_nz, labels=labels_nz, colors=colors_nz, autopct='%1.0f%%', startangle=90)
    ax.set_title('Bidder Compliance Overview', fontsize=12, fontweight='bold')


def _doc_status_chart(ax, bidder_summaries):
    totals = {'Verified': 0, 'Review': 0, 'Non-Compliant': 0, 'Missing': 0}
    for b in bidder_summaries:
        sc = b.get('status_counts', {})
        totals['Verified'] += sc.get('VERIFIED', 0)
        totals['Review'] += sc.get('REVIEW', 0)
        totals['Non-Compliant'] += sc.get('NON_COMPLIANT', 0)
        totals['Missing'] += sc.get('MISSING', 0)
    labels = list(totals.keys())
    values = list(totals.values())
    colors = ['#146c2e', '#d97706', '#a3180a', '#6b7a8d']
    ax.bar(labels, values, color=colors, width=0.6)
    ax.set_ylabel('Count', fontsize=10)
    ax.set_title('Document Submission Status', fontsize=12, fontweight='bold')
    ax.grid(axis='y', alpha=0.3)


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

    # ── Executive summary ────────────────────────────────────────
    total = statistics['total_bidders']
    compliant = statistics['compliant']
    non_compliant = statistics['non_compliant']
    under_review = statistics['under_review']
    pending = statistics['pending']
    with_missing = statistics['with_missing_documents']
    avg_score = statistics['average_score']
    highest_score = statistics['highest_score']

    all_missing = []
    for b in bidder_summaries:
        for m in b['missing_items']:
            all_missing.append({'bidder': b['name'], 'item': m['title'], 'mandatory': m['mandatory']})
    mandatory_missing = [m for m in all_missing if m['mandatory']]
    recurring = {}
    for m in mandatory_missing:
        recurring[m['item']] = recurring.get(m['item'], 0) + 1
    recurring_str = ', '.join(f"{item} ({count} bidder{'s' if count > 1 else ''})" for item, count in recurring.items())

    all_issues = []
    for b in bidder_summaries:
        for i in b['issues']:
            all_issues.append({'bidder': b['name'], **i})
    high_severity = [i for i in all_issues if i.get('severity') == 'HIGH']

    summary_lines = []
    summary_lines.append(f"{total} bidders have been received.")
    summary_lines.append(f"{compliant} bidders are fully compliant.")
    summary_lines.append(f"{under_review} bidders require additional review.")
    if non_compliant > 0:
        summary_lines.append(f"{non_compliant} bidder{'s are' if non_compliant > 1 else ' is'} non-compliant.")
    if pending > 0:
        summary_lines.append(f"{pending} bidder{'s are' if pending > 1 else ' is'} pending analysis.")
    if with_missing > 0:
        summary_lines.append(f"{with_missing} bidder{'s have' if with_missing > 1 else ' has'} outstanding documentation.")
    if mandatory_missing:
        summary_lines.append(f"Mandatory documents missing across {len(mandatory_missing)} bidder(s).")
        if recurring_str:
            summary_lines.append(f"Most common missing items: {recurring_str}.")
    if high_severity:
        summary_lines.append(f"High-severity issues flagged: {len(high_severity)} (cross-document mismatches or non-compliant mandatory requirements).")
    summary_lines.append(f"Average overall score: {avg_score}%. Highest score: {highest_score}%.")
    if non_compliant > 0:
        nc_names = [b['name'] for b in bidder_summaries if b['compliance_status'] == 'NON_COMPLIANT']
        summary_lines.append(f"Non-compliant bidders: {', '.join(nc_names)}.")

    exec_summary_html = '<br>'.join(_esc(line) for line in summary_lines)

    # ── Generate charts as base64 images ──────────────────────────
    score_chart_b64 = _generate_chart_base64(lambda ax: _score_distribution_chart(ax, bidder_summaries))
    compliance_chart_b64 = _generate_chart_base64(lambda ax: _compliance_chart(ax, statistics))
    doc_chart_b64 = _generate_chart_base64(lambda ax: _doc_status_chart(ax, bidder_summaries))

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

  <div class="section-title">Executive Summary</div>
  <div style="background:#f8f9fc;border:1px solid #c8d0db;padding:14px 16px;font-size:12px;line-height:1.7;color:#3d4a5c">{exec_summary_html}</div>

  <div class="section-title">Charts</div>
  <table style="width:100%;border-collapse:collapse">
    <tr>
      <td style="width:50%;padding:8px;vertical-align:top;text-align:center">
        <img src="data:image/png;base64,{score_chart_b64}" style="width:100%;max-width:400px" />
      </td>
      <td style="width:50%;padding:8px;vertical-align:top;text-align:center">
        <img src="data:image/png;base64,{compliance_chart_b64}" style="width:100%;max-width:400px" />
      </td>
    </tr>
    <tr>
      <td colspan="2" style="padding:8px;text-align:center">
        <img src="data:image/png;base64,{doc_chart_b64}" style="width:100%;max-width:500px" />
      </td>
    </tr>
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


@officer_summary_bp.route('/api/officer/tenders/<tender_id>/summary/excel', methods=['GET'])
@require_role('OFFICER')
def tender_summary_excel(tender_id):
    """Generate an Excel workbook with charts for the consolidated bidder summary."""
    import openpyxl
    from openpyxl.chart import BarChart, PieChart, Reference
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

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

    wb = openpyxl.Workbook()

    # ── Styles ────────────────────────────────────────────────────
    header_font = Font(bold=True, color='FFFFFF')
    header_fill = PatternFill(start_color='003380', end_color='003380', fill_type='solid')
    title_font = Font(bold=True, size=14, color='003380')
    thin_border = Border(
        left=Side(style='thin'), right=Side(style='thin'),
        top=Side(style='thin'), bottom=Side(style='thin')
    )

    # ── Sheet 1: Dashboard Summary ────────────────────────────────
    ws1 = wb.active
    ws1.title = 'Dashboard Summary'
    ws1['A1'] = 'PARAKH AI — Consolidated Bidder Summary'
    ws1['A1'].font = title_font
    ws1['A3'] = 'Tender ID'
    ws1['B3'] = tender.get('id', '')
    ws1['A4'] = 'Tender Name'
    ws1['B4'] = tender.get('title', '')
    ws1['A5'] = 'Department'
    ws1['B5'] = tender.get('department', '')
    ws1['A6'] = 'Report Generated'
    ws1['B6'] = datetime.now().strftime('%Y-%m-%d %H:%M')

    ws1['A8'] = 'Total Bidders'
    ws1['B8'] = statistics['total_bidders']
    ws1['A9'] = 'Compliant'
    ws1['B9'] = statistics['compliant']
    ws1['A10'] = 'Under Review'
    ws1['B10'] = statistics['under_review']
    ws1['A11'] = 'Non-Compliant'
    ws1['B11'] = statistics['non_compliant']
    ws1['A12'] = 'Pending'
    ws1['B12'] = statistics['pending']
    ws1['A13'] = 'With Missing Documents'
    ws1['B13'] = statistics['with_missing_documents']
    ws1['A14'] = 'Average Score'
    ws1['B14'] = statistics['average_score']
    ws1['A15'] = 'Highest Score'
    ws1['B15'] = statistics['highest_score']

    for row in range(8, 16):
        ws1[f'A{row}'].font = Font(bold=True)
        ws1[f'A{row}'].border = thin_border
        ws1[f'B{row}'].border = thin_border

    # Executive Summary in Sheet 1
    ws1['A17'] = 'EXECUTIVE SUMMARY'
    ws1['A17'].font = Font(bold=True, size=12, color='003380')

    summary_text = []
    summary_text.append(f"{total} bidders have been received.")
    summary_text.append(f"{statistics['compliant']} bidders are fully compliant.")
    summary_text.append(f"{statistics['under_review']} bidders require additional review.")
    if statistics['non_compliant'] > 0:
        summary_text.append(f"{statistics['non_compliant']} bidder(s) non-compliant.")
    if statistics['pending'] > 0:
        summary_text.append(f"{statistics['pending']} bidder(s) pending analysis.")
    if statistics['with_missing_documents'] > 0:
        summary_text.append(f"{statistics['with_missing_documents']} bidder(s) have outstanding documentation.")
    summary_text.append(f"Average overall score: {statistics['average_score']}%. Highest score: {statistics['highest_score']}%.")

    for i, line in enumerate(summary_text):
        ws1[f'A{18+i}'] = line

    # ── Sheet 2: Bidder Comparison ────────────────────────────────
    ws2 = wb.create_sheet('Bidder Comparison')
    headers = ['S.No', 'Bidder Name', 'Bidder ID', 'GSTIN', 'Documents', 'Missing Items', 'Compliance', 'Verified', 'Review', 'Non-Compliant', 'Missing', 'Overall Score', 'Risk', 'Officer Decision', 'Issues']
    for col, h in enumerate(headers, 1):
        cell = ws2.cell(row=1, column=col, value=h)
        cell.font = header_font
        cell.fill = header_fill
        cell.border = thin_border

    for idx, b in enumerate(bidder_summaries, 1):
        sc = b.get('status_counts', {})
        missing = ', '.join(m['title'] for m in b.get('missing_items', [])) or 'None'
        row_data = [
            idx, b['name'], b['id'], b.get('gstin', '—'),
            f"{b['document_count']}/{b['total_requirements']}", missing,
            b['compliance_status'], sc.get('VERIFIED', 0), sc.get('REVIEW', 0),
            sc.get('NON_COMPLIANT', 0), sc.get('MISSING', 0),
            b['overall_score'], b['risk_level'], b.get('officer_decision', '—'),
            len(b.get('issues', []))
        ]
        for col, val in enumerate(row_data, 1):
            cell = ws2.cell(row=idx+1, column=col, value=val)
            cell.border = thin_border

    # Add bar chart for scores
    chart = BarChart()
    chart.type = 'col'
    chart.title = 'Bidder Overall Scores'
    chart.y_axis.title = 'Score (%)'
    chart.x_axis.title = 'Bidder'
    data_ref = Reference(ws2, min_col=12, min_row=1, max_row=len(bidder_summaries)+1)
    cats_ref = Reference(ws2, min_col=2, min_row=2, max_row=len(bidder_summaries)+1)
    chart.add_data(data_ref, titles_from_data=True)
    chart.set_categories(cats_ref)
    chart.shape = 4
    ws2.add_chart(chart, 'A' + str(len(bidder_summaries) + 4))

    # ── Sheet 3: Missing Documents ────────────────────────────────
    ws3 = wb.create_sheet('Missing Documents')
    miss_headers = ['Bidder Name', 'Bidder ID', 'Requirement', 'Category', 'Mandatory', 'Status', 'Detail']
    for col, h in enumerate(miss_headers, 1):
        cell = ws3.cell(row=1, column=col, value=h)
        cell.font = header_font
        cell.fill = header_fill
        cell.border = thin_border

    row_num = 2
    for b in bidder_summaries:
        for item in b.get('missing_items', []):
            ws3.cell(row=row_num, column=1, value=b['name']).border = thin_border
            ws3.cell(row=row_num, column=2, value=b['id']).border = thin_border
            ws3.cell(row=row_num, column=3, value=item['title']).border = thin_border
            ws3.cell(row=row_num, column=4, value=item.get('category', '')).border = thin_border
            ws3.cell(row=row_num, column=5, value='Yes' if item.get('mandatory') else 'No').border = thin_border
            ws3.cell(row=row_num, column=6, value='Missing').border = thin_border
            ws3.cell(row=row_num, column=7, value=item.get('concern', item.get('found_value', '—'))).border = thin_border
            row_num += 1
        for item in b.get('review_items', []):
            ws3.cell(row=row_num, column=1, value=b['name']).border = thin_border
            ws3.cell(row=row_num, column=2, value=b['id']).border = thin_border
            ws3.cell(row=row_num, column=3, value=item['title']).border = thin_border
            ws3.cell(row=row_num, column=4, value=item.get('category', '')).border = thin_border
            ws3.cell(row=row_num, column=5, value='Yes' if item.get('mandatory') else 'No').border = thin_border
            ws3.cell(row=row_num, column=6, value='Pending Verification').border = thin_border
            ws3.cell(row=row_num, column=7, value=item.get('concern', item.get('found_value', '—'))).border = thin_border
            row_num += 1

    # ── Sheet 4: Evaluation Scores ─────────────────────────────────
    ws4 = wb.create_sheet('Evaluation Scores')
    eval_headers = ['Bidder Name', 'Bidder ID', 'Category', 'Score %']
    for col, h in enumerate(eval_headers, 1):
        cell = ws4.cell(row=1, column=col, value=h)
        cell.font = header_font
        cell.fill = header_fill
        cell.border = thin_border

    row_num = 2
    for b in bidder_summaries:
        cats = b.get('category_scores', {})
        if cats:
            for cat, pct in cats.items():
                ws4.cell(row=row_num, column=1, value=b['name']).border = thin_border
                ws4.cell(row=row_num, column=2, value=b['id']).border = thin_border
                ws4.cell(row=row_num, column=3, value=cat).border = thin_border
                ws4.cell(row=row_num, column=4, value=pct).border = thin_border
                row_num += 1
        else:
            ws4.cell(row=row_num, column=1, value=b['name']).border = thin_border
            ws4.cell(row=row_num, column=2, value=b['id']).border = thin_border
            ws4.cell(row=row_num, column=3, value='—').border = thin_border
            ws4.cell(row=row_num, column=4, value='Not evaluated').border = thin_border
            row_num += 1

    # Add pie chart for compliance
    ws5 = wb.create_sheet('Compliance Chart')
    ws5['A1'] = 'Compliance Status'
    ws5['B1'] = 'Count'
    ws5['A1'].font = header_font
    ws5['B1'].font = header_font
    ws5['A1'].fill = header_fill
    ws5['B1'].fill = header_fill

    comp_data = [
        ('Compliant', statistics['compliant']),
        ('Under Review', statistics['under_review']),
        ('Non-Compliant', statistics['non_compliant']),
        ('Pending', statistics['pending']),
    ]
    for i, (label, val) in enumerate(comp_data, 2):
        ws5[f'A{i}'] = label
        ws5[f'B{i}'] = val

    pie = PieChart()
    pie.title = 'Bidder Compliance Overview'
    labels = Reference(ws5, min_col=1, min_row=2, max_row=5)
    data_ref = Reference(ws5, min_col=2, min_row=1, max_row=5)
    pie.add_data(data_ref, titles_from_data=True)
    pie.set_categories(labels)
    ws5.add_chart(pie, 'D2')

    # Save to bytes
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    from flask import send_file
    date_str = datetime.now().strftime('%Y%m%d')
    filename = f'ParakhAI_Bidder_Summary_{tender_id}_{date_str}.xlsx'
    return send_file(buf, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                     as_attachment=True, download_name=filename)
