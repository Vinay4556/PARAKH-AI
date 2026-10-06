"""
Load All Data to Database - Veritas AI
This script reads all JSON data files and loads them into the database.
Includes: tenders, bidders, bids, documents, requirements, compliance, etc.
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
from sqlalchemy import text


def load_tenders():
    """Load tenders into database."""
    tenders = load_cached('tenders.json')
    print(f"\n📋 Loading {len(tenders)} tenders...")
    
    loaded, updated = 0, 0
    for tender in tenders:
        tender_id = tender.get('id')
        existing = db.session.execute(
            text("SELECT id FROM tenders WHERE id = :id"),
            {"id": tender_id}
        ).first()
        
        if existing:
            db.session.execute(text("""
                UPDATE tenders SET
                    title = :title, department = :department, description = :description,
                    estimated_value = :estimated_value, estimated_value_display = :estimated_value_display,
                    category = :category, submission_deadline = :submission_deadline,
                    status = :status, created_by = :created_by, created_at = :created_at
                WHERE id = :id
            """), {
                "id": tender_id,
                "title": tender.get('title'),
                "department": tender.get('department'),
                "description": tender.get('description'),
                "estimated_value": tender.get('estimated_value'),
                "estimated_value_display": tender.get('estimated_value_display'),
                "category": tender.get('category'),
                "submission_deadline": tender.get('submission_deadline'),
                "status": tender.get('status'),
                "created_by": tender.get('created_by'),
                "created_at": tender.get('created_at')
            })
            updated += 1
        else:
            db.session.execute(text("""
                INSERT INTO tenders (
                    id, title, department, description, estimated_value, estimated_value_display,
                    category, submission_deadline, status, created_by, created_at
                ) VALUES (
                    :id, :title, :department, :description, :estimated_value, :estimated_value_display,
                    :category, :submission_deadline, :status, :created_by, :created_at
                )
            """), {
                "id": tender_id,
                "title": tender.get('title'),
                "department": tender.get('department'),
                "description": tender.get('description'),
                "estimated_value": tender.get('estimated_value'),
                "estimated_value_display": tender.get('estimated_value_display'),
                "category": tender.get('category'),
                "submission_deadline": tender.get('submission_deadline'),
                "status": tender.get('status'),
                "created_by": tender.get('created_by'),
                "created_at": tender.get('created_at')
            })
            loaded += 1
    
    db.session.commit()
    print(f"  ✓ Inserted: {loaded}, Updated: {updated}")


def load_bids():
    """Load bids into database."""
    bids = load_cached('bids.json')
    print(f"\n💰 Loading {len(bids)} bids...")
    
    loaded, updated = 0, 0
    for bid in bids:
        bid_id = bid.get('id')
        existing = db.session.execute(
            text("SELECT id FROM bids WHERE id = :id"),
            {"id": bid_id}
        ).first()
        
        if existing:
            db.session.execute(text("""
                UPDATE bids SET
                    tender_id = :tender_id, bidder_id = :bidder_id,
                    technical_bid = :technical_bid, financial_bid = :financial_bid,
                    bid_amount = :bid_amount, bid_amount_display = :bid_amount_display,
                    bid_security = :bid_security, submitted_at = :submitted_at,
                    stage = :stage, status = :status, is_withdrawn = :is_withdrawn
                WHERE id = :id
            """), {
                "id": bid_id,
                "tender_id": bid.get('tender_id'),
                "bidder_id": bid.get('bidder_id'),
                "technical_bid": json.dumps(bid.get('technical_bid', {})),
                "financial_bid": json.dumps(bid.get('financial_bid', {})),
                "bid_amount": bid.get('bid_amount'),
                "bid_amount_display": bid.get('bid_amount_display'),
                "bid_security": bid.get('bid_security'),
                "submitted_at": bid.get('submitted_at'),
                "stage": bid.get('stage'),
                "status": bid.get('status'),
                "is_withdrawn": bid.get('is_withdrawn', False)
            })
            updated += 1
        else:
            db.session.execute(text("""
                INSERT INTO bids (
                    id, tender_id, bidder_id, technical_bid, financial_bid,
                    bid_amount, bid_amount_display, bid_security, submitted_at,
                    stage, status, is_withdrawn
                ) VALUES (
                    :id, :tender_id, :bidder_id, :technical_bid, :financial_bid,
                    :bid_amount, :bid_amount_display, :bid_security, :submitted_at,
                    :stage, :status, :is_withdrawn
                )
            """), {
                "id": bid_id,
                "tender_id": bid.get('tender_id'),
                "bidder_id": bid.get('bidder_id'),
                "technical_bid": json.dumps(bid.get('technical_bid', {})),
                "financial_bid": json.dumps(bid.get('financial_bid', {})),
                "bid_amount": bid.get('bid_amount'),
                "bid_amount_display": bid.get('bid_amount_display'),
                "bid_security": bid.get('bid_security'),
                "submitted_at": bid.get('submitted_at'),
                "stage": bid.get('stage'),
                "status": bid.get('status'),
                "is_withdrawn": bid.get('is_withdrawn', False)
            })
            loaded += 1
    
    db.session.commit()
    print(f"  ✓ Inserted: {loaded}, Updated: {updated}")


def load_main_data():
    """Load main data into database."""
    with app.app_context():
        print("="*60)
        print("Loading All Data to Database")
        print("="*60)
        
        # Load data in order (respecting foreign keys)
        load_tenders()
        
        # Bidders are already loaded, but let's reload to ensure consistency
        from load_bidders_to_db import load_bidders_to_database
        print("\n👥 Reloading bidders...")
        load_bidders_to_database()
        
        load_bids()
        
        print("\n" + "="*60)
        print("Summary:")
        print("="*60)
        tenders_count = db.session.execute(text("SELECT COUNT(*) FROM tenders")).scalar()
        bidders_count = db.session.execute(text("SELECT COUNT(*) FROM bidders")).scalar()
        bids_count = db.session.execute(text("SELECT COUNT(*) FROM bids")).scalar()
        docs_count = db.session.execute(text("SELECT COUNT(*) FROM documents")).scalar()
        
        print(f"  • Tenders: {tenders_count}")
        print(f"  • Bidders: {bidders_count}")
        print(f"  • Bids: {bids_count}")
        print(f"  • Documents: {docs_count}")
        print("="*60)


if __name__ == '__main__':
    load_main_data()
    print("\n✅ All data loaded successfully!")
