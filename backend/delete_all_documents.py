"""
Delete ALL documents from PostgreSQL database.
This removes all uploaded documents to reset to clean state.
"""
import os
import sys
from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import app
from database.db import db
from sqlalchemy import text

def delete_all_documents():
    """Delete all documents from database."""
    with app.app_context():
        try:
            # Count documents before
            count_before = db.session.execute(text("SELECT COUNT(*) FROM documents")).scalar()
            print(f"\n📄 Documents before: {count_before}")
            
            # Delete all documents
            result = db.session.execute(text("DELETE FROM documents"))
            db.session.commit()
            
            # Count after
            count_after = db.session.execute(text("SELECT COUNT(*) FROM documents")).scalar()
            print(f"📄 Documents after: {count_after}")
            
            print(f"\n✅ Deleted {count_before - count_after} documents")
            
            # Also update bidders to remove document references
            db.session.execute(text("""
                UPDATE bidders 
                SET document_ids = '[]'::jsonb
            """))
            db.session.commit()
            
            print("✅ Cleared document_ids from all bidders")
            
            return True
            
        except Exception as e:
            print(f"❌ Error: {e}")
            db.session.rollback()
            return False

if __name__ == '__main__':
    print("🗑️ Deleting ALL documents from database...")
    success = delete_all_documents()
    sys.exit(0 if success else 1)
