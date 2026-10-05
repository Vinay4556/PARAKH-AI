"""
Update Database Schema: Add file_data and mime_type columns to documents table
Run this BEFORE migrating documents
"""
from database.db import db
from database.connection import resolve_database
from flask import Flask

def update_schema():
    """Add new columns to documents table"""
    
    # Initialize Flask app
    app = Flask(__name__)
    db_info = resolve_database()
    app.config['SQLALCHEMY_DATABASE_URI'] = db_info['url']
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    db.init_app(app)
    
    print(f"Database: {db_info['mode']}")
    print(f"URL: {db_info['url'][:50]}...")
    
    with app.app_context():
        # Get the database engine
        engine = db.engine
        
        # Check if columns already exist
        from sqlalchemy import inspect
        inspector = inspect(engine)
        columns = [col['name'] for col in inspector.get_columns('documents')]
        
        print(f"\nExisting columns: {len(columns)}")
        
        needs_file_data = 'file_data' not in columns
        needs_mime_type = 'mime_type' not in columns
        
        if not needs_file_data and not needs_mime_type:
            print("✅ Schema already up to date! file_data and mime_type columns exist.")
            return
        
        # Add columns using raw SQL
        with engine.connect() as conn:
            if needs_file_data:
                print("\nAdding file_data column...")
                if db_info['mode'] == 'sqlite' or db_info['mode'] == 'sqlite-fallback':
                    conn.execute(db.text("ALTER TABLE documents ADD COLUMN file_data BLOB"))
                else:  # PostgreSQL
                    conn.execute(db.text("ALTER TABLE documents ADD COLUMN file_data BYTEA"))
                conn.commit()
                print("✅ Added file_data column")
            
            if needs_mime_type:
                print("\nAdding mime_type column...")
                conn.execute(db.text("ALTER TABLE documents ADD COLUMN mime_type VARCHAR(100)"))
                conn.commit()
                print("✅ Added mime_type column")
        
        print("\n🎉 Database schema updated successfully!")
        print("\nYou can now run: python migrate_documents_to_db.py")

if __name__ == '__main__':
    update_schema()
