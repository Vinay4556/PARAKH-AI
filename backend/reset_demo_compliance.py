"""
Reset Demo Compliance Data - Veritas AI
This script resets compliance scores for all bidders to 0 when they have no uploaded documents.
Run this on production to clean up demo data after deployment.
"""
import json
import os
import sys

# Add backend directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import app
from database.db import db
from database.db_utils import load_cached, save_cached
from sqlalchemy import text


def reset_bidder_compliance_in_json():
    """Reset compliance scores in bidders.json for bidders with no uploaded documents."""
    with app.app_context():
        print("\n" + "="*60)
        print("Resetting Bidder Compliance Scores (JSON Files)")
        print("="*60 + "\n")
        
        bidders = load_cached('bidders.json')
        documents = load_cached('documents.json')
        
        # Count uploaded documents per bidder
        docs_by_bidder = {}
        for doc in documents:
            if doc.get('saved_path'):  # Only count actually uploaded documents
                bidder_id = doc.get('bidder_id')
                if bidder_id:
                    docs_by_bidder[bidder_id] = docs_by_bidder.get(bidder_id, 0) + 1
        
        reset_count = 0
        for bidder in bidders:
            bidder_id = bidder.get('id')
            doc_count = docs_by_bidder.get(bidder_id, 0)
            
            if doc_count == 0:
                # Reset to pending state
                old_score = bidder.get('compliance_score', 0)
                bidder['compliance_score'] = 0
                bidder['risk_level'] = 'UNKNOWN'
                bidder['status'] = 'pending'
                bidder['analyzed_at'] = None
                reset_count += 1
                print(f"  ✓ Reset {bidder_id} ({bidder.get('name', 'Unknown')})")
                print(f"    Old score: {old_score}% → New: 0% (No documents uploaded)")
        
        if reset_count > 0:
            save_cached('bidders.json', bidders)
            print(f"\n✅ Reset {reset_count} bidders in bidders.json")
        else:
            print("✓ No bidders needed resetting in JSON")


def reset_bidder_compliance_in_db():
    """Reset compliance scores in database for bidders with no uploaded documents."""
    with app.app_context():
        print("\n" + "="*60)
        print("Resetting Bidder Compliance Scores (Database)")
        print("="*60 + "\n")
        
        try:
            # Get all bidders
            bidders = db.session.execute(text("SELECT id, name FROM bidders")).fetchall()
            
            # Get document counts per bidder (only uploaded docs with saved_path)
            doc_counts = db.session.execute(text("""
                SELECT bidder_id, COUNT(*) as count 
                FROM documents 
                WHERE saved_path IS NOT NULL AND saved_path != ''
                GROUP BY bidder_id
            """)).fetchall()
            
            docs_by_bidder = {row[0]: row[1] for row in doc_counts}
            
            reset_count = 0
            for bidder in bidders:
                bidder_id, bidder_name = bidder[0], bidder[1]
                doc_count = docs_by_bidder.get(bidder_id, 0)
                
                if doc_count == 0:
                    # Reset compliance to 0
                    result = db.session.execute(text("""
                        UPDATE bidders 
                        SET compliance_score = 0,
                            risk_level = 'UNKNOWN',
                            status = 'pending',
                            analyzed_at = NULL
                        WHERE id = :id
                    """), {"id": bidder_id})
                    
                    reset_count += 1
                    print(f"  ✓ Reset {bidder_id} ({bidder_name or 'Unknown'})")
                    print(f"    → Compliance: 0%, Status: pending (No documents)")
            
            db.session.commit()
            
            if reset_count > 0:
                print(f"\n✅ Reset {reset_count} bidders in database")
            else:
                print("✓ No bidders needed resetting in database")
                
        except Exception as e:
            db.session.rollback()
            print(f"❌ Error: {e}")
            return


def main():
    print("\n" + "="*60)
    print("Veritas AI - Reset Demo Compliance Data")
    print("="*60)
    print("\nThis script will reset compliance scores to 0 for bidders")
    print("that have no uploaded documents (only demo data).\n")
    
    # Reset in both JSON and database
    reset_bidder_compliance_in_json()
    reset_bidder_compliance_in_db()
    
    print("\n" + "="*60)
    print("✅ Cleanup Complete!")
    print("="*60)
    print("\nBidders with no uploaded documents now show:")
    print("  • Compliance Score: 0%")
    print("  • Risk Level: UNKNOWN")
    print("  • Status: pending")
    print("\n")


if __name__ == '__main__':
    main()
