"""
Load Bidder Data to Database - Veritas AI
This script reads bidder data from JSON files and loads it into the database.
"""
import json
import os
import sys
from datetime import datetime

# Add backend directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import app
from database.db import db
from database.db_utils import load_cached

def load_bidders_to_database():
    """Load all bidders from bidders.json into the database."""
    with app.app_context():
        from sqlalchemy import text
        
        # Load bidders from JSON
        bidders = load_cached('bidders.json')
        print(f"Found {len(bidders)} bidders in bidders.json")
        
        loaded_count = 0
        updated_count = 0
        skipped_count = 0
        
        for bidder in bidders:
            bidder_id = bidder.get('id')
            
            # Check if bidder already exists in database
            existing = db.session.execute(
                text("SELECT id FROM bidders WHERE id = :id"),
                {"id": bidder_id}
            ).first()
            
            if existing:
                # Update existing bidder
                update_sql = text("""
                    UPDATE bidders SET
                        tender_id = :tender_id,
                        name = :name,
                        short_name = :short_name,
                        gstin = :gstin,
                        pan = :pan,
                        email = :email,
                        phone = :phone,
                        address = :address,
                        state = :state,
                        incorporation_year = :incorporation_year,
                        type = :type,
                        status = :status,
                        compliance_score = :compliance_score,
                        risk_level = :risk_level,
                        submitted_at = :submitted_at,
                        analyzed_at = :analyzed_at,
                        document_ids = :document_ids
                    WHERE id = :id
                """)
                
                db.session.execute(update_sql, {
                    "id": bidder_id,
                    "tender_id": bidder.get('tender_id'),
                    "name": bidder.get('name'),
                    "short_name": bidder.get('short_name'),
                    "gstin": bidder.get('gstin'),
                    "pan": bidder.get('pan'),
                    "email": bidder.get('email'),
                    "phone": bidder.get('phone'),
                    "address": bidder.get('address'),
                    "state": bidder.get('state'),
                    "incorporation_year": bidder.get('incorporation_year'),
                    "type": bidder.get('type'),
                    "status": bidder.get('status', 'pending'),
                    "compliance_score": bidder.get('compliance_score'),
                    "risk_level": bidder.get('risk_level'),
                    "submitted_at": bidder.get('submitted_at'),
                    "analyzed_at": bidder.get('analyzed_at'),
                    "document_ids": json.dumps(bidder.get('document_ids', []))
                })
                updated_count += 1
                print(f"  ✓ Updated bidder: {bidder_id} - {bidder.get('name')}")
            else:
                # Insert new bidder
                insert_sql = text("""
                    INSERT INTO bidders (
                        id, tender_id, name, short_name, gstin, pan, email, phone,
                        address, state, incorporation_year, type, status,
                        compliance_score, risk_level, submitted_at, analyzed_at, document_ids
                    ) VALUES (
                        :id, :tender_id, :name, :short_name, :gstin, :pan, :email, :phone,
                        :address, :state, :incorporation_year, :type, :status,
                        :compliance_score, :risk_level, :submitted_at, :analyzed_at, :document_ids
                    )
                """)
                
                db.session.execute(insert_sql, {
                    "id": bidder_id,
                    "tender_id": bidder.get('tender_id'),
                    "name": bidder.get('name'),
                    "short_name": bidder.get('short_name'),
                    "gstin": bidder.get('gstin'),
                    "pan": bidder.get('pan'),
                    "email": bidder.get('email'),
                    "phone": bidder.get('phone'),
                    "address": bidder.get('address'),
                    "state": bidder.get('state'),
                    "incorporation_year": bidder.get('incorporation_year'),
                    "type": bidder.get('type'),
                    "status": bidder.get('status', 'pending'),
                    "compliance_score": bidder.get('compliance_score'),
                    "risk_level": bidder.get('risk_level'),
                    "submitted_at": bidder.get('submitted_at'),
                    "analyzed_at": bidder.get('analyzed_at'),
                    "document_ids": json.dumps(bidder.get('document_ids', []))
                })
                loaded_count += 1
                print(f"  ✓ Inserted bidder: {bidder_id} - {bidder.get('name')}")
        
        db.session.commit()
        
        print(f"\n{'='*60}")
        print(f"Migration Summary:")
        print(f"  • New bidders inserted: {loaded_count}")
        print(f"  • Existing bidders updated: {updated_count}")
        print(f"  • Total processed: {loaded_count + updated_count}")
        print(f"{'='*60}\n")
        
        # Verify the data
        count = db.session.execute(text("SELECT COUNT(*) FROM bidders")).scalar()
        print(f"Total bidders in database: {count}")


if __name__ == '__main__':
    print("Loading bidders from JSON to database...\n")
    load_bidders_to_database()
    print("\n✅ Done!")
