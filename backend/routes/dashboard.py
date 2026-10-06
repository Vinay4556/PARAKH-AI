from flask import Blueprint, jsonify
from services.json_cache import load_cached
import os
from config import DATA_DIR

dashboard_bp = Blueprint('dashboard', __name__)

@dashboard_bp.route('/api/dashboard', methods=['GET'])
def get_dashboard():
    # ── Load ALL data files once, via cache ───────────────────
    # Before: documents.json was read N times (once per bidder) — N+1 pattern.
    # Now: each file is read at most once per process (cached in memory).
    tenders        = load_cached('tenders.json')
    bidders        = load_cached('bidders.json')
    all_docs       = load_cached('documents.json')   # one read, reused everywhere below
    audit          = load_cached('audit.json')
    clarifications = load_cached('clarifications.json')

    # ── Stats ────────────────────────────────────────────────
    active_tenders        = sum(1 for t in tenders if t.get('status') in ('active', 'OPEN'))
    bids_analyzed         = sum(1 for b in bidders if b.get('status') == 'analyzed')
    pending_clarifications = sum(1 for c in clarifications if c.get('status') == 'PENDING_BIDDER')

    # Count uploaded documents in ONE pass over all_docs — no per-bidder loop
    total_docs = sum(1 for d in all_docs if d.get('saved_path'))
    
    # Build a lookup of document counts per bidder (only uploaded docs)
    docs_by_bidder: dict = {}
    for d in all_docs:
        if d.get('saved_path'):
            bid = d.get('bidder_id')
            if bid:
                docs_by_bidder[bid] = docs_by_bidder.get(bid, 0) + 1
    
    # Reset compliance scores for bidders with no uploaded documents
    for b in bidders:
        if docs_by_bidder.get(b['id'], 0) == 0:
            b['compliance_score'] = 0
            b['risk_level'] = 'UNKNOWN'
            b['status'] = 'pending'

    scored_bidders = [b for b in bidders
                      if b.get('compliance_score') is not None
                      and b.get('compliance_score', 0) > 0]
    avg_compliance = round(
        sum(b.get('compliance_score', 0) for b in scored_bidders) / max(len(scored_bidders), 1)
    )

    # ── Compliance distribution ───────────────────────────────
    score_distribution = {
        'VERIFIED':      sum(1 for b in bidders if (b.get('compliance_score') or 0) >= 85),
        'NEEDS_REVIEW':  sum(1 for b in bidders if 70 <= (b.get('compliance_score') or 0) < 85),
        'NON_COMPLIANT': sum(1 for b in bidders if 0 <  (b.get('compliance_score') or 0) < 70),
    }

    # ── Recent activity ───────────────────────────────────────
    recent_audit = sorted(audit, key=lambda x: x.get('timestamp', ''), reverse=True)[:10]
    recent_activity = [
        {
            'id':     e.get('id'),
            'bidder': e.get('bidder_id', ''),
            'action': e.get('action', ''),
            'detail': e.get('detail', ''),
            'time':   e.get('timestamp', ''),
            'type':   e.get('severity', 'info'),
        }
        for e in recent_audit
    ]

    # ── Compliance chart ──────────────────────────────────────
    compliance_chart = [
        {
            'name':  (b.get('name') or b['id'])[:22],
            'score': b.get('compliance_score', 0),
            'risk':  b.get('risk_level', 'UNKNOWN'),
        }
        for b in sorted(bidders,
                        key=lambda x: (x.get('compliance_score') or 0),
                        reverse=True)
        if b.get('compliance_score') is not None
    ]

    # ── Risk breakdown ────────────────────────────────────────
    risk_counts = {
        'LOW':    sum(1 for b in bidders if b.get('risk_level') == 'LOW'),
        'MEDIUM': sum(1 for b in bidders if b.get('risk_level') == 'MEDIUM'),
        'HIGH':   sum(1 for b in bidders if b.get('risk_level') == 'HIGH'),
    }

    # ── Top tenders — bidder count via dict lookup (O(N) not O(N²)) ──
    bidder_count_by_tender: dict = {}
    for b in bidders:
        tid = b.get('tender_id')
        if tid:
            bidder_count_by_tender[tid] = bidder_count_by_tender.get(tid, 0) + 1

    top_tenders = [
        {**t, 'bidder_count': bidder_count_by_tender.get(t['id'], 0)}
        for t in tenders[:5]
    ]

    return jsonify({
        'stats': {
            'active_tenders':        active_tenders,
            'bids_analyzed':         bids_analyzed,
            'documents_processed':   total_docs,
            'avg_compliance':        avg_compliance,
            'pending_clarifications': pending_clarifications,
            'total_bidders':         len(bidders),
        },
        'compliance_chart':   compliance_chart,
        'score_distribution': score_distribution,
        'risk_counts':        risk_counts,
        'recent_activity':    recent_activity,
        'tenders':            top_tenders,
    })
