"""
Scoring Service - BidGuard AI
Provides scoring summaries and comparative analysis.
"""
from services.compliance_service import calculate_score, get_compliance_results, get_cross_document_checks
from services.tender_service import get_requirements_for_tender
from services.document_service import get_documents_for_bidder


def get_bidder_score_summary(bidder_id, tender_id):
    """Get complete scoring summary for a bidder."""
    requirements = get_requirements_for_tender(tender_id)
    documents = get_documents_for_bidder(bidder_id)
    compliance_results = get_compliance_results(bidder_id, requirements, documents)
    score_data = calculate_score(compliance_results, requirements)
    return score_data


def get_tender_leaderboard(tender_id, bidder_ids):
    """Compare all bidders for a tender."""
    leaderboard = []
    for bidder_id in bidder_ids:
        score = get_bidder_score_summary(bidder_id, tender_id)
        leaderboard.append({'bidder_id': bidder_id, **score})
    leaderboard.sort(key=lambda x: x['overall_score'], reverse=True)
    return leaderboard
