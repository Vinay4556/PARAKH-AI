"""
Document Service with Database Storage
Wrapper around document_service.py that stores files in database instead of filesystem
"""
import os
import re
import uuid
import tempfile
from datetime import datetime
from config import ALLOWED_EXTENSIONS
from services.document_storage import (
    store_document_in_db,
    get_document_binary,
    get_document_stream,
    get_documents_by_bidder as db_get_documents_by_bidder,
    get_document_metadata,
    delete_document as db_delete_document,
    update_document_analysis
)
from services.document_service import (
    extract_text_from_pdf,
    extract_text_from_image,
    allowed_file,
    DuplicatePANError
)
from services.ai_service import classify_document, extract_entities
from services.tampering_service import run_tampering_analysis
from services.gov_adapters import run_verification
from services.json_cache import load_cached


def _run_gov_verification(doc_type: str, extracted_text: str, bidder_name: str = None) -> dict:
    """Wrapper for gov verification - imported from document_service"""
    from services.document_service import _run_gov_verification as _orig_verification
    return _orig_verification(doc_type, extracted_text, bidder_name)


def process_uploaded_file_db(file, bidder_id, tender_id=None, requirement_id=None):
    """
    Process an uploaded file and store in DATABASE instead of filesystem
    
    Flow:
    1. Validate file
    2. Save to temporary file for processing
    3. Extract text (OCR)
    4. Classify document
    5. Run tampering detection
    6. Store binary in database
    7. Clean up temp file
    """
    if not allowed_file(file.filename):
        raise ValueError(f"File type not supported: {file.filename}")

    # Validate bidder_id
    if not bidder_id or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', str(bidder_id)):
        raise ValueError('Invalid bidder_id')

    # Generate document ID
    doc_id = f"DOC-{str(uuid.uuid4())[:8].upper()}"
    
    # Read file binary data
    file.seek(0)
    file_binary = file.read()
    file_size = len(file_binary)
    
    # Get MIME type
    import mimetypes
    mime_type, _ = mimetypes.guess_type(file.filename)
    if not mime_type:
        mime_type = 'application/octet-stream'
    
    # Save to TEMPORARY file for processing (OCR needs filesystem access)
    ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=f'.{ext}')
    temp_filepath = temp_file.name
    
    try:
        # Write binary to temp file
        temp_file.write(file_binary)
        temp_file.close()
        
        # Extract text based on file type
        extraction = {'text': '', 'pages': 1, 'method': 'none'}
        if ext == 'pdf':
            extraction = extract_text_from_pdf(temp_filepath)
        elif ext in ('png', 'jpg', 'jpeg'):
            extraction = extract_text_from_image(temp_filepath)
        elif ext == 'docx':
            extraction = {
                'text': '[DOCX file - text extraction requires python-docx]',
                'pages': 1,
                'method': 'docx'
            }
        
        # Classify document
        classification = classify_document(file.filename, extraction['text'])
        
        # Extract entities from text
        entities = extract_entities(extraction['text'], classification['type'])
        
        # ── Duplicate PAN prevention ────────────────────────────────────────
        all_existing_docs = db_get_documents_by_bidder(bidder_id)
        
        if classification['type'] == 'PAN':
            existing_pan = next(
                (d for d in all_existing_docs
                 if d.get('classification') == 'PAN'),
                None
            )
            if existing_pan:
                raise DuplicatePANError(existing_pan, new_pan=entities.get('pan'))
        
        # ── PAN confidence check ───────────────────────────────────────────
        _PAN_CONF_THRESHOLD = 0.70
        if classification['type'] == 'PAN':
            import re as _re
            raw_pan = entities.get('pan')
            if raw_pan:
                clean_pan = raw_pan.strip().upper()
                if not _re.match(r'^[A-Z]{5}[0-9]{4}[A-Z]$', clean_pan):
                    entities['pan'] = None
                    entities['pan_extraction_status'] = 'INVALID_FORMAT'
                elif classification.get('confidence', 1.0) < _PAN_CONF_THRESHOLD:
                    entities['pan_extraction_status'] = 'NEEDS_REVIEW'
                else:
                    entities['pan_extraction_status'] = 'OK'
            else:
                entities['pan_extraction_status'] = 'NOT_FOUND'
        
        # Run gov API verification
        bidders_data = load_cached('bidders.json')
        bidder_obj = next((b for b in bidders_data if b['id'] == bidder_id), {})
        bidder_name = bidder_obj.get('name', '')
        gov_verification = _run_gov_verification(
            classification['type'],
            extraction['text'],
            bidder_name
        )
        
        # Run tampering analysis
        tampering = run_tampering_analysis(
            filepath=temp_filepath,
            doc_id=doc_id,
            bidder_id=bidder_id,
            extracted_text=extraction['text'],
            doc_type=classification['type'],
            all_docs=all_existing_docs,
        )
        
        # Store in database
        doc_record = store_document_in_db(
            doc_id=doc_id,
            bidder_id=bidder_id,
            filename=file.filename,
            file_binary=file_binary,
            file_size=file_size,
            mime_type=mime_type,
            tender_id=tender_id,
            requirement_id=requirement_id,
            classification=classification['type'],
            confidence=classification['confidence'],
            pages=extraction['pages'],
            extracted_text=extraction['text'][:5000],  # Store more text in DB
            extracted_entities=entities,
            tampering_signals=tampering.get('tampering_signals', []),
            tampered=tampering.get('tampered', False),
            suspicious=tampering.get('suspicious', False),
            status='processed'
        )
        
        # Add additional fields for response
        doc_record.update({
            'extraction_method': extraction['method'],
            'gov_verification': gov_verification,
            'file_hash': tampering.get('file_hash'),
            'tampering_risk': tampering.get('tampering_risk'),
            'tampering_signal_count': len(tampering.get('tampering_signals', [])),
        })
        
        return doc_record
        
    finally:
        # Clean up temporary file
        try:
            os.unlink(temp_filepath)
        except Exception:
            pass


def get_documents_for_bidder(bidder_id):
    """Get all documents for a bidder from database"""
    return db_get_documents_by_bidder(bidder_id)


def get_document_by_id(doc_id):
    """Get document metadata by ID"""
    return get_document_metadata(doc_id)


def delete_document(doc_id):
    """Delete document from database"""
    return db_delete_document(doc_id)


def serve_document_file(doc_id):
    """
    Get document binary for serving via Flask send_file
    Returns: (BytesIO stream, filename, mime_type) or (None, None, None)
    """
    return get_document_stream(doc_id)
