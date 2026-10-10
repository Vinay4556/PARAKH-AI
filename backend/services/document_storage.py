"""
Document Storage Service - Database-backed file storage
Stores document binary data in PostgreSQL/SQLite instead of filesystem
Works for both local development and cloud deployment
"""
import io
import time
import mimetypes
from datetime import datetime
from contextlib import contextmanager
from functools import wraps
from sqlalchemy.exc import OperationalError, DBAPIError
from database.db import db, Document


def retry_on_db_error(max_attempts=3, delay=1):
    """Retry decorator for database operations that may fail due to transient connection issues"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            last_error = None
            for attempt in range(max_attempts):
                try:
                    return func(*args, **kwargs)
                except (OperationalError, DBAPIError) as e:
                    last_error = e
                    if attempt < max_attempts - 1:
                        # Exponential backoff
                        wait_time = delay * (2 ** attempt)
                        print(f"[DB] Connection error on attempt {attempt + 1}, retrying in {wait_time}s: {str(e)[:100]}")
                        time.sleep(wait_time)
                        # Try to recover the session
                        try:
                            db.session.rollback()
                        except Exception:
                            pass
                    else:
                        print(f"[DB] Max retry attempts ({max_attempts}) reached: {str(e)}")
                        raise
            raise last_error
        return wrapper
    return decorator


@contextmanager
def session_scope():
    """Provide a transactional scope around a series of operations."""
    session = db.session
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        pass  # Don't close the session - Flask-SQLAlchemy manages it


@retry_on_db_error(max_attempts=3, delay=1)
def store_document_in_db(
    doc_id,
    bidder_id,
    filename,
    file_binary,
    file_size,
    mime_type=None,
    tender_id=None,
    requirement_id=None,
    classification=None,
    confidence=None,
    pages=None,
    extracted_text=None,
    extracted_entities=None,
    tampering_signals=None,
    tampered=False,
    suspicious=False,
    status='UPLOADED'
):
    """
    Store document binary data in database
    Handles both INSERT (new) and UPDATE (existing)
    
    Args:
        doc_id: Unique document ID
        bidder_id: Bidder ID
        filename: Original filename
        file_binary: Binary file data (bytes)
        file_size: File size in bytes
        mime_type: MIME type (e.g., 'application/pdf')
        ... (other document metadata)
    
    Returns:
        Document object
    """
    if not mime_type:
        mime_type, _ = mimetypes.guess_type(filename)
        if not mime_type:
            mime_type = 'application/octet-stream'
    
    with session_scope() as session:
        # Check if document already exists
        doc = session.query(Document).filter_by(id=doc_id).first()
        
        if doc:
            # UPDATE existing document with binary data
            doc.file_data = file_binary
            doc.file_size = file_size
            doc.mime_type = mime_type
            if bidder_id:
                doc.bidder_id = bidder_id
            if filename:
                doc.filename = filename
            if tender_id:
                doc.tender_id = tender_id
            if requirement_id:
                doc.requirement_id = requirement_id
            if classification:
                doc.classification = classification
                doc.doc_type = classification
            if confidence is not None:
                doc.confidence = confidence
            if pages is not None:
                doc.pages = pages
            if extracted_text is not None:
                doc.extracted_text = extracted_text
            if extracted_entities is not None:
                doc.extracted_entities = extracted_entities
            if tampering_signals is not None:
                doc.tampering_signals = tampering_signals
            if tampered is not None:
                doc.tampered = tampered
            if suspicious is not None:
                doc.suspicious = suspicious
            if status:
                doc.status = status
        else:
            # INSERT new document
            doc = Document(
                id=doc_id,
                bidder_id=bidder_id,
                tender_id=tender_id,
                requirement_id=requirement_id,
                filename=filename,
                doc_type=classification,
                classification=classification,
                confidence=confidence or 0.0,
                pages=pages or 1,
                extracted_text=extracted_text or '',
                status=status,
                uploaded_at=datetime.utcnow().isoformat(),
                saved_path=None,  # Not used anymore but kept for backward compatibility
                file_size=file_size,
                file_data=file_binary,  # Store binary data
                mime_type=mime_type,
                extracted_entities=extracted_entities or {},
                tampering_signals=tampering_signals or [],
                tampered=tampered,
                suspicious=suspicious,
                reprocessed=False
            )
            session.add(doc)
        
        session.flush()
        
        return {
            'id': doc.id,
            'bidder_id': doc.bidder_id,
            'tender_id': doc.tender_id,
            'requirement_id': doc.requirement_id,
            'filename': doc.filename,
            'classification': doc.classification,
            'confidence': doc.confidence,
            'pages': doc.pages,
            'extracted_text': doc.extracted_text,
            'status': doc.status,
            'uploaded_at': doc.uploaded_at,
            'file_size': doc.file_size,
            'mime_type': doc.mime_type,
            'extracted_entities': doc.extracted_entities,
            'tampering_signals': doc.tampering_signals,
            'tampered': doc.tampered,
            'suspicious': doc.suspicious
        }


def get_document_binary(doc_id):
    """
    Retrieve document binary data from database
    
    Args:
        doc_id: Document ID
    
    Returns:
        tuple: (file_binary, filename, mime_type) or (None, None, None) if not found
    """
    with session_scope() as session:
        doc = session.query(Document).filter_by(id=doc_id).first()
        
        if not doc:
            return None, None, None
        
        return doc.file_data, doc.filename, doc.mime_type


def get_document_stream(doc_id):
    """
    Get document as BytesIO stream for serving files
    
    Args:
        doc_id: Document ID
    
    Returns:
        tuple: (BytesIO stream, filename, mime_type) or (None, None, None)
    """
    file_data, filename, mime_type = get_document_binary(doc_id)
    
    if file_data is None:
        return None, None, None
    
    return io.BytesIO(file_data), filename, mime_type


def update_document_analysis(
    doc_id,
    classification=None,
    confidence=None,
    extracted_text=None,
    extracted_entities=None,
    tampering_signals=None,
    tampered=None,
    suspicious=None,
    gov_verification=None
):
    """
    Update document analysis results (after OCR/AI processing)
    
    Args:
        doc_id: Document ID
        classification: Document type classification
        confidence: Classification confidence score
        extracted_text: OCR-extracted text
        extracted_entities: Extracted entities dict
        tampering_signals: List of tampering signals
        tampered: Boolean flag
        suspicious: Boolean flag
        gov_verification: Government verification results
    
    Returns:
        bool: True if updated successfully
    """
    with session_scope() as session:
        doc = session.query(Document).filter_by(id=doc_id).first()
        
        if not doc:
            return False
        
        if classification is not None:
            doc.classification = classification
            doc.doc_type = classification
        
        if confidence is not None:
            doc.confidence = confidence
        
        if extracted_text is not None:
            doc.extracted_text = extracted_text
        
        if extracted_entities is not None:
            doc.extracted_entities = extracted_entities
        
        if tampering_signals is not None:
            doc.tampering_signals = tampering_signals
        
        if tampered is not None:
            doc.tampered = tampered
        
        if suspicious is not None:
            doc.suspicious = suspicious
        
        session.flush()
        return True


def delete_document(doc_id):
    """
    Delete document from database (both metadata and binary data)
    
    Args:
        doc_id: Document ID
    
    Returns:
        bool: True if deleted successfully
    """
    with session_scope() as session:
        doc = session.query(Document).filter_by(id=doc_id).first()
        
        if not doc:
            return False
        
        session.delete(doc)
        session.flush()
        return True


@retry_on_db_error(max_attempts=3, delay=1)
def get_documents_by_bidder(bidder_id):
    """
    Get all documents for a specific bidder (metadata only, no binary)
    
    Args:
        bidder_id: Bidder ID
    
    Returns:
        list: List of document metadata dicts
    """
    with session_scope() as session:
        docs = session.query(Document).filter_by(bidder_id=bidder_id).all()
        
        return [
            {
                'id': doc.id,
                'bidder_id': doc.bidder_id,
                'tender_id': doc.tender_id,
                'requirement_id': doc.requirement_id,
                'filename': doc.filename,
                'saved_path': doc.id,  # For database storage, use doc ID as saved_path indicator
                'classification': doc.classification,
                'confidence': doc.confidence,
                'pages': doc.pages,
                'extracted_text': doc.extracted_text[:2000] if doc.extracted_text else '',
                'status': doc.status,
                'uploaded_at': doc.uploaded_at,
                'file_size': doc.file_size,
                'mime_type': doc.mime_type,
                'extracted_entities': doc.extracted_entities or {},
                'tampering_signals': doc.tampering_signals or [],
                'tampered': doc.tampered,
                'suspicious': doc.suspicious,
                'tampering_signal_count': len(doc.tampering_signals or []),
                'tampering_risk': 'HIGH' if doc.tampered else 'MEDIUM' if doc.suspicious else None,
            }
            for doc in docs
        ]


def get_document_metadata(doc_id):
    """
    Get document metadata without binary data
    
    Args:
        doc_id: Document ID
    
    Returns:
        dict: Document metadata or None
    """
    with session_scope() as session:
        doc = session.query(Document).filter_by(id=doc_id).first()
        
        if not doc:
            return None
        
        return {
            'id': doc.id,
            'bidder_id': doc.bidder_id,
            'tender_id': doc.tender_id,
            'requirement_id': doc.requirement_id,
            'filename': doc.filename,
            'classification': doc.classification,
            'confidence': doc.confidence,
            'pages': doc.pages,
            'extracted_text': doc.extracted_text,
            'status': doc.status,
            'uploaded_at': doc.uploaded_at,
            'file_size': doc.file_size,
            'mime_type': doc.mime_type,
            'extracted_entities': doc.extracted_entities or {},
            'tampering_signals': doc.tampering_signals or [],
            'tampered': doc.tampered,
            'suspicious': doc.suspicious,
            'tampering_signal_count': len(doc.tampering_signals or []),
            'tampering_risk': 'HIGH' if doc.tampered else 'MEDIUM' if doc.suspicious else None,
        }


def document_exists(doc_id):
    """
    Check if document exists in database
    
    Args:
        doc_id: Document ID
    
    Returns:
        bool: True if exists
    """
    with session_scope() as session:
        return session.query(Document).filter_by(id=doc_id).first() is not None


def get_all_documents():
    """
    Get all documents (metadata only) - useful for cross-bidder analysis
    
    Returns:
        list: List of all document metadata dicts
    """
    with session_scope() as session:
        docs = session.query(Document).all()
        
        return [
            {
                'id': doc.id,
                'bidder_id': doc.bidder_id,
                'tender_id': doc.tender_id,
                'filename': doc.filename,
                'classification': doc.classification,
                'extracted_text': doc.extracted_text[:500] if doc.extracted_text else '',
                'extracted_entities': doc.extracted_entities or {},
            }
            for doc in docs
        ]
