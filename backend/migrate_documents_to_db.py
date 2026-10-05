"""
Migration Script: Move documents from filesystem to database
Run this once to migrate existing documents
"""
import os
import sys
from database.db import db
from database.connection import get_database_url
from flask import Flask
from services.document_storage import store_document_in_db
from services.json_cache import load_cached
from config import UPLOAD_DIR

def migrate_documents():
    """Migrate all documents from filesystem to database"""
    
    # Initialize Flask app
    app = Flask(__name__)
    app.config['SQLALCHEMY_DATABASE_URI'] = get_database_url()
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    db.init_app(app)
    
    with app.app_context():
        # Create tables if they don't exist
        db.create_all()
        
        # Load existing documents from JSON
        try:
            documents = load_cached('documents.json')
        except Exception as e:
            print(f"Error loading documents.json: {e}")
            return
        
        total = len(documents)
        migrated = 0
        skipped = 0
        errors = 0
        
        print(f"Found {total} documents to migrate...")
        
        for doc in documents:
            doc_id = doc.get('id')
            bidder_id = doc.get('bidder_id')
            saved_path = doc.get('saved_path')
            
            if not saved_path:
                print(f"  [SKIP] {doc_id}: No saved_path (demo document)")
                skipped += 1
                continue
            
            # Build file path
            file_path = os.path.join(UPLOAD_DIR, bidder_id, saved_path)
            
            if not os.path.exists(file_path):
                print(f"  [SKIP] {doc_id}: File not found at {file_path}")
                skipped += 1
                continue
            
            try:
                # Read file binary
                with open(file_path, 'rb') as f:
                    file_binary = f.read()
                
                file_size = len(file_binary)
                
                # Determine MIME type
                import mimetypes
                mime_type, _ = mimetypes.guess_type(doc.get('filename', ''))
                if not mime_type:
                    mime_type = 'application/octet-stream'
                
                # Store in database
                store_document_in_db(
                    doc_id=doc_id,
                    bidder_id=bidder_id,
                    filename=doc.get('filename', ''),
                    file_binary=file_binary,
                    file_size=file_size,
                    mime_type=mime_type,
                    tender_id=doc.get('tender_id'),
                    requirement_id=doc.get('requirement_id'),
                    classification=doc.get('classification'),
                    confidence=doc.get('confidence', 0.0),
                    pages=doc.get('pages', 1),
                    extracted_text=doc.get('extracted_text', ''),
                    extracted_entities=doc.get('extracted_entities', {}),
                    tampering_signals=doc.get('tampering_signals', []),
                    tampered=doc.get('tampered', False),
                    suspicious=doc.get('suspicious', False),
                    status=doc.get('status', 'processed')
                )
                
                print(f"  [OK] {doc_id}: {doc.get('filename')} ({file_size} bytes)")
                migrated += 1
                
            except Exception as e:
                print(f"  [ERROR] {doc_id}: {e}")
                errors += 1
        
        print(f"\n=== Migration Complete ===")
        print(f"Total: {total}")
        print(f"Migrated: {migrated}")
        print(f"Skipped: {skipped}")
        print(f"Errors: {errors}")
        print(f"\nDocuments are now stored in the database!")
        print(f"You can optionally delete the {UPLOAD_DIR} directory to free up space.")

if __name__ == '__main__':
    migrate_documents()
