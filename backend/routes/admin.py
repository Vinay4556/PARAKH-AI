"""
Admin Routes - Veritas AI
Administrative endpoints for maintenance and cleanup tasks.
"""
from flask import Blueprint, jsonify
from database.db import db
from database.db_utils import load_cached, save_cached, invalidate_all
from sqlalchemy import text
from routes.auth import require_role

admin_bp = Blueprint('admin', __name__)


@admin_bp.route('/api/admin/reset-all-compliance', methods=['POST'])
@require_role('OFFICER')
def reset_all_compliance():
    """
    FORCEFULLY reset ALL bidders to 0% compliance, regardless of documents.
    Use this to completely clear demo data.
    """
    try:
        results = {
            'json_reset': [],
            'db_reset': [],
            'compliance_cleared': [],
            'errors': []
        }
        
        # ── Reset ALL bidders in JSON ────────────────────────────
        try:
            bidders = load_cached('bidders.json')
            compliance = load_cached('compliance.json')
            
            for bidder in bidders:
                bidder_id = bidder.get('id')
                old_score = bidder.get('compliance_score', 0)
                
                if old_score > 0 or bidder.get('status') != 'pending':
                    bidder['compliance_score'] = 0
                    bidder['risk_level'] = 'UNKNOWN'
                    bidder['status'] = 'pending'
                    bidder['analyzed_at'] = None
                    bidder['document_ids'] = []
                    
                    results['json_reset'].append({
                        'id': bidder_id,
                        'name': bidder.get('name'),
                        'old_score': old_score,
                        'new_score': 0
                    })
            
            # Clear ALL compliance analysis
            cleared_ids = list(compliance.keys())
            compliance.clear()
            results['compliance_cleared'] = cleared_ids
            
            save_cached('bidders.json', bidders)
            save_cached('compliance.json', compliance)
                
        except Exception as e:
            results['errors'].append(f"JSON reset error: {str(e)}")
        
        # ── Reset ALL bidders in Database ────────────────────────
        try:
            bidders_db = db.session.execute(text("SELECT id, name, compliance_score FROM bidders")).fetchall()
            
            for bidder in bidders_db:
                bidder_id, bidder_name, old_score = bidder[0], bidder[1], bidder[2]
                
                db.session.execute(text("""
                    UPDATE bidders 
                    SET compliance_score = 0,
                        risk_level = 'UNKNOWN',
                        status = 'pending',
                        analyzed_at = NULL,
                        document_ids = '[]'::jsonb
                    WHERE id = :id
                """), {"id": bidder_id})
                
                results['db_reset'].append({
                    'id': bidder_id,
                    'name': bidder_name,
                    'old_score': old_score or 0,
                    'new_score': 0
                })
            
            db.session.commit()
            
        except Exception as e:
            db.session.rollback()
            results['errors'].append(f"Database reset error: {str(e)}")
        
        # Clear all caches
        invalidate_all()
        
        return jsonify({
            'success': True,
            'message': 'ALL compliance data forcefully reset to 0%',
            'json_bidders_reset': len(results['json_reset']),
            'db_bidders_reset': len(results['db_reset']),
            'compliance_cleared': len(results['compliance_cleared']),
            'details': results
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Reset failed: {str(e)}'
        }), 500


@admin_bp.route('/api/admin/reset-demo-compliance', methods=['POST'])
@require_role('OFFICER')  # Only officers can run admin tasks
def reset_demo_compliance():
    """
    Reset compliance scores to 0 for bidders with no uploaded documents.
    This cleans up demo data after deployment.
    """
    try:
        results = {
            'json_reset': [],
            'db_reset': [],
            'compliance_cleared': [],
            'errors': []
        }
        
        # ── Reset in JSON files ──────────────────────────────────
        try:
            bidders = load_cached('bidders.json')
            documents = load_cached('documents.json')
            compliance = load_cached('compliance.json')
            
            # Count uploaded documents per bidder
            docs_by_bidder = {}
            for doc in documents:
                if doc.get('saved_path'):
                    bidder_id = doc.get('bidder_id')
                    if bidder_id:
                        docs_by_bidder[bidder_id] = docs_by_bidder.get(bidder_id, 0) + 1
            
            for bidder in bidders:
                bidder_id = bidder.get('id')
                doc_count = docs_by_bidder.get(bidder_id, 0)
                
                if doc_count == 0:
                    old_score = bidder.get('compliance_score', 0)
                    bidder['compliance_score'] = 0
                    bidder['risk_level'] = 'UNKNOWN'
                    bidder['status'] = 'pending'
                    bidder['analyzed_at'] = None
                    bidder['document_ids'] = []
                    
                    # Clear compliance analysis results
                    if bidder_id in compliance:
                        del compliance[bidder_id]
                        results['compliance_cleared'].append(bidder_id)
                    
                    results['json_reset'].append({
                        'id': bidder_id,
                        'name': bidder.get('name'),
                        'old_score': old_score,
                        'new_score': 0
                    })
            
            if results['json_reset'] or results['compliance_cleared']:
                save_cached('bidders.json', bidders)
                save_cached('compliance.json', compliance)
                
        except Exception as e:
            results['errors'].append(f"JSON reset error: {str(e)}")
        
        # ── Reset in Database ────────────────────────────────────
        try:
            # Get all bidders
            bidders_db = db.session.execute(text("SELECT id, name, compliance_score FROM bidders")).fetchall()
            
            # Get document counts per bidder
            doc_counts = db.session.execute(text("""
                SELECT bidder_id, COUNT(*) as count 
                FROM documents 
                WHERE saved_path IS NOT NULL AND saved_path != ''
                GROUP BY bidder_id
            """)).fetchall()
            
            docs_by_bidder_db = {row[0]: row[1] for row in doc_counts}
            
            for bidder in bidders_db:
                bidder_id, bidder_name, old_score = bidder[0], bidder[1], bidder[2]
                doc_count = docs_by_bidder_db.get(bidder_id, 0)
                
                if doc_count == 0:
                    db.session.execute(text("""
                        UPDATE bidders 
                        SET compliance_score = 0,
                            risk_level = 'UNKNOWN',
                            status = 'pending',
                            analyzed_at = NULL
                        WHERE id = :id
                    """), {"id": bidder_id})
                    
                    results['db_reset'].append({
                        'id': bidder_id,
                        'name': bidder_name,
                        'old_score': old_score,
                        'new_score': 0
                    })
            
            db.session.commit()
            
        except Exception as e:
            db.session.rollback()
            results['errors'].append(f"Database reset error: {str(e)}")
        
        # ── Return results ───────────────────────────────────────
        return jsonify({
            'success': True,
            'message': 'Demo compliance data reset completed',
            'json_bidders_reset': len(results['json_reset']),
            'db_bidders_reset': len(results['db_reset']),
            'compliance_cleared': len(results['compliance_cleared']),
            'details': results,
            'note': 'Bidders with no uploaded documents now show 0% compliance'
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Reset failed: {str(e)}'
        }), 500


@admin_bp.route('/api/admin/cleanup-old-reports', methods=['POST'])
@require_role('OFFICER')
def cleanup_old_reports():
    """
    Delete old generated HTML reports.
    Reports are regenerated on demand, so old ones can be safely removed.
    """
    try:
        import os
        from config import REPORTS_DIR
        
        deleted = []
        for filename in os.listdir(REPORTS_DIR):
            if filename.endswith('.html'):
                filepath = os.path.join(REPORTS_DIR, filename)
                os.remove(filepath)
                deleted.append(filename)
        
        return jsonify({
            'success': True,
            'message': f'Deleted {len(deleted)} old reports',
            'deleted_files': deleted
        }), 200
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Cleanup failed: {str(e)}'
        }), 500


@admin_bp.route('/api/admin/status', methods=['GET'])
@require_role('OFFICER')
def admin_status():
    """
    Get administrative status and statistics.
    """
    try:
        bidders = load_cached('bidders.json')
        documents = load_cached('documents.json')
        
        # Count documents per bidder
        docs_by_bidder = {}
        uploaded_docs = [d for d in documents if d.get('saved_path')]
        for doc in uploaded_docs:
            bid = doc.get('bidder_id')
            if bid:
                docs_by_bidder[bid] = docs_by_bidder.get(bid, 0) + 1
        
        # Stats
        total_bidders = len(bidders)
        bidders_with_docs = len([b for b in bidders if docs_by_bidder.get(b['id'], 0) > 0])
        bidders_no_docs = total_bidders - bidders_with_docs
        
        bidders_with_scores = len([b for b in bidders if (b.get('compliance_score') or 0) > 0])
        bidders_pending = len([b for b in bidders if b.get('status') == 'pending'])
        
        return jsonify({
            'total_bidders': total_bidders,
            'bidders_with_documents': bidders_with_docs,
            'bidders_no_documents': bidders_no_docs,
            'bidders_with_scores': bidders_with_scores,
            'bidders_pending': bidders_pending,
            'total_uploaded_documents': len(uploaded_docs),
            'needs_reset': bidders_no_docs > 0 and bidders_with_scores > bidders_with_docs
        }), 200
        
    except Exception as e:
        return jsonify({
            'error': f'Status check failed: {str(e)}'
        }), 500
