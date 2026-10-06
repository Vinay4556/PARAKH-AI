"""
Reset bidders table in PostgreSQL production database.
Sets all compliance scores to 0%, removes document references.
"""
import os
import sys
from dotenv import load_dotenv

load_dotenv()

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import app
from database.db import db
from sqlalchemy import text

def reset_bidders():
    """Reset all bidders to 0% compliance."""
    with app.app_context():
        try:
            # Update all bidders
            result = db.session.execute(text("""
                UPDATE bidders 
                SET 
                    compliance_score = 0,
                    risk_level = 'UNKNOWN',
                    status = 'pending',
                    analyzed_at = NULL,
                    document_ids = '[]'::jsonb,
                    officer_decision = NULL,
                    rejection_category = NULL,
                    rejection_stage = NULL,
                    rejection_reason = NULL,
                    officer_remarks = NULL,
                    decision_officer = NULL,
                    decision_officer_id = NULL,
                    decision_timestamp = NULL,
                    is_disqualified = NULL
                WHERE id IN ('BID-001', 'BID-002', 'BID-003', 'BID-004')
            """))
            
            db.session.commit()
            
            # Verify the update
            bidders = db.session.execute(text("""
                SELECT id, name, compliance_score, risk_level, status 
                FROM bidders 
                ORDER BY id
            """)).fetchall()
            
            print("\n✅ Bidders reset successfully!\n")
            print("Current bidders:")
            for b in bidders:
                print(f"  {b.id}: {b.name or '(unnamed)'} - {b.compliance_score}% - {b.risk_level} - {b.status}")
            
            return True
            
        except Exception as e:
            print(f"❌ Error: {e}")
            db.session.rollback()
            return False

if __name__ == '__main__':
    print("Resetting bidders in PostgreSQL database...")
    print(f"Database: {os.environ.get('DATABASE_URL', 'Not set')[:50]}...")
    
    success = reset_bidders()
    sys.exit(0 if success else 1)
