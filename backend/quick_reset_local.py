"""
Quick Reset - Local Database Only
Run this to reset compliance scores in your LOCAL database immediately.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import app
from database.db import db
from database.db_utils import load_cached, save_cached
from sqlalchemy import text

print("="*60)
print("QUICK RESET - Local Database")
print("="*60)
print("\nThis will reset compliance scores to 0 for bidders")
print("with no uploaded documents.\n")

with app.app_context():
    # Reset in JSON
    bidders = load_cached('bidders.json')
    documents = load_cached('documents.json')
    
    docs_by_bidder = {}
    for doc in documents:
        if doc.get('saved_path'):
            bid = doc.get('bidder_id')
            if bid:
                docs_by_bidder[bid] = docs_by_bidder.get(bid, 0) + 1
    
    json_reset = 0
    for bidder in bidders:
        if docs_by_bidder.get(bidder['id'], 0) == 0:
            bidder['compliance_score'] = 0
            bidder['risk_level'] = 'UNKNOWN'
            bidder['status'] = 'pending'
            bidder['analyzed_at'] = None
            json_reset += 1
            print(f"✓ Reset {bidder['id']}: {bidder.get('name')}")
    
    if json_reset > 0:
        save_cached('bidders.json', bidders)
        print(f"\n✅ Reset {json_reset} bidders in JSON")
    
    # Reset in DB
    db_reset = 0
    try:
        result = db.session.execute(text("""
            UPDATE bidders 
            SET compliance_score = 0,
                risk_level = 'UNKNOWN',
                status = 'pending',
                analyzed_at = NULL
            WHERE id NOT IN (
                SELECT DISTINCT bidder_id 
                FROM documents 
                WHERE saved_path IS NOT NULL AND saved_path != ''
            )
        """))
        db.session.commit()
        db_reset = result.rowcount
        print(f"✅ Reset {db_reset} bidders in database")
    except Exception as e:
        print(f"❌ Database error: {e}")
        db.session.rollback()

print("\n" + "="*60)
print("LOCAL RESET COMPLETE!")
print("="*60)
print(f"\nReset {json_reset} bidders in JSON, {db_reset} in database")
print("\nFor PRODUCTION (Render), wait for deployment to complete")
print("then use the reset_compliance.html tool.\n")
