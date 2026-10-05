"""
Document Service - BidGuard AI
Handles file upload, text extraction, classification, and tampering detection.
"""
import os
import re
import json
import uuid
from datetime import datetime
from config import DATA_DIR, UPLOAD_DIR, ALLOWED_EXTENSIONS

try:
    import pymupdf as fitz
    PYMUPDF_AVAILABLE = True
except ImportError:
    try:
        import fitz
        PYMUPDF_AVAILABLE = True
    except ImportError:
        PYMUPDF_AVAILABLE = False


class DuplicatePANError(Exception):
    """Raised when a bidder already has a PAN document and attempts to upload another.

    `str(err)` returns the user-facing message so existing generic
    `except Exception as e: ... 'error': str(e)` handlers surface a clean
    message with no code changes required at the call site.
    """
    def __init__(self, existing_doc, new_pan=None):
        self.existing_doc = existing_doc
        self.new_pan = new_pan
        self.error_code = 'PAN_ALREADY_EXISTS'
        message = "PAN document already exists. A PAN document has already been added to this bidder's details. You cannot upload another PAN document."
        if existing_doc.get('filename'):
            message += f" (Existing: {existing_doc['filename']})"
        super().__init__(message)

# Tesseract OCR via pytesseract + Pillow
try:
    import pytesseract
    from PIL import Image as PILImage
    # Try common Tesseract install paths on Windows
    import shutil
    _tess = shutil.which('tesseract')
    if not _tess:
        _win_path = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
        if os.path.exists(_win_path):
            pytesseract.pytesseract.tesseract_cmd = _win_path
            _tess = _win_path
    TESSERACT_AVAILABLE = bool(_tess)
except ImportError:
    TESSERACT_AVAILABLE = False

from services.ai_service import classify_document
from services.tampering_service import run_tampering_analysis


# ── Gov API verification after classification ──────────────────────────────

def _run_gov_verification(doc_type: str, extracted_text: str, bidder_name: str = None) -> dict:
    """
    After classifying a document, extract the identifier from OCR text
    and run a live government API verification.
    Returns a verification result dict or None if not applicable.

    IMPORTANT: this function never fabricates data.
    - If OCR text contains no recognisable identifier → returns None.
    - If the extracted identifier fails format validation → returns a
      NEEDS_REVIEW result (not a pass).
    - entity_name in the result comes ONLY from the government API response
      (or is set to None when the KYC subscription is inactive and we are
      operating in FORMAT_VALID offline mode — the reflected submitted_name
      is explicitly cleared so callers cannot mistake it for verified data).
    """
    import re
    from services.gov_adapters import GSTNAdapter, PANAdapter, run_verification

    # PAN format constant — must match exactly
    _PAN_PATTERN = re.compile(r'\b([A-Z]{5}[0-9]{4}[A-Z])\b')
    # GSTIN: 15-char per GST Council spec
    _GSTIN_PATTERN = re.compile(
        r'\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])\b'
    )

    try:
        if doc_type == 'PAN':
            pan_match = _PAN_PATTERN.search(extracted_text.upper())
            if not pan_match:
                # OCR produced no PAN-shaped token — do not fabricate
                return {
                    'adapter':        'PAN',
                    'verified':       False,
                    'status':         'NOT_FOUND',
                    'confidence':     0.0,
                    'entity_name':    None,
                    'identifier':     None,
                    'source':         'OCR — no PAN pattern found in extracted text',
                    'mode':           'OCR',
                    'mismatch_flags': ['PAN number not detected in uploaded document'],
                    'notes':          'Ensure the uploaded image is clear and contains a visible PAN number.',
                }

            pan = pan_match.group(1)
            result = PANAdapter().verify(pan, bidder_name)

            # When KYC subscription is not active the adapter returns
            # entity_name = submitted_name (a reflection, not a database lookup).
            # Clear it here so the UI cannot display it as government-verified.
            entity_name = result.entity_name
            if result.status in ('FORMAT_VALID',) and entity_name == bidder_name:
                entity_name = None   # not verified by government — do not show

            return {
                'adapter':        result.adapter,
                'verified':       result.verified,
                'status':         result.status,
                'confidence':     result.confidence,
                'entity_name':    entity_name,
                'identifier':     result.identifier,
                'source':         result.source,
                'mode':           result.mode,
                'mismatch_flags': result.mismatch_flags,
                'notes':          result.notes,
            }

        elif doc_type == 'GST':
            gstin_match = _GSTIN_PATTERN.search(extracted_text.upper())
            if not gstin_match:
                return {
                    'adapter':        'GSTN',
                    'verified':       False,
                    'status':         'NOT_FOUND',
                    'confidence':     0.0,
                    'entity_name':    None,
                    'identifier':     None,
                    'source':         'OCR — no GSTIN pattern found in extracted text',
                    'mode':           'OCR',
                    'mismatch_flags': ['GSTIN not detected in uploaded document'],
                    'notes':          'Ensure the uploaded image shows the GSTIN clearly.',
                }

            gstin = gstin_match.group(1)
            result = GSTNAdapter().verify(gstin, bidder_name)

            entity_name = result.entity_name
            if result.status in ('FORMAT_VALID',) and entity_name == bidder_name:
                entity_name = None

            return {
                'adapter':        result.adapter,
                'verified':       result.verified,
                'status':         result.status,
                'confidence':     result.confidence,
                'entity_name':    entity_name,
                'identifier':     result.identifier,
                'source':         result.source,
                'mode':           result.mode,
                'mismatch_flags': result.mismatch_flags,
                'notes':          result.notes,
            }

    except Exception as e:
        logger.warning(f"Gov verification skipped after classification: {e}")

    return None


import logging
logger = logging.getLogger(__name__)


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def extract_text_from_image(filepath):
    """
    Extract text from PNG/JPG using pytesseract with preprocessing.
    Uses multiple techniques to maximize text extraction from ID cards,
    certificates and scanned documents.
    """
    # ── Method 1: pytesseract with preprocessing ──────────────────────────
    if TESSERACT_AVAILABLE:
        try:
            from PIL import ImageEnhance, ImageFilter, ImageOps
            img_orig = PILImage.open(filepath)

            # Convert to RGB
            if img_orig.mode not in ('RGB', 'RGBA'):
                img_orig = img_orig.convert('RGB')
            elif img_orig.mode == 'RGBA':
                img_orig = img_orig.convert('RGB')

            best_text = ''

            # Try multiple preprocessing strategies — take the longest result
            def ocr_image(img, psm=3, lang='eng+hin'):
                config = f'--psm {psm} --oem 3'
                try:
                    t = pytesseract.image_to_string(img, lang=lang, config=config)
                    return t.strip()
                except Exception:
                    try:
                        return pytesseract.image_to_string(img, lang='eng', config=config).strip()
                    except Exception:
                        return ''

            # Strategy 1: upscale 2x + grayscale + contrast boost (best for ID cards)
            w, h = img_orig.size
            img_up = img_orig.resize((w * 2, h * 2), PILImage.LANCZOS)
            img_gray = img_up.convert('L')
            img_contrast = ImageEnhance.Contrast(img_gray).enhance(2.5)
            img_sharp = ImageEnhance.Sharpness(img_contrast).enhance(2.0)
            t1 = ocr_image(img_sharp, psm=3)

            # Strategy 2: original size, grayscale, stronger contrast
            img_gray2 = img_orig.convert('L')
            img_c2 = ImageEnhance.Contrast(img_gray2).enhance(3.0)
            t2 = ocr_image(img_c2, psm=6)  # psm 6 = assume single block of text

            # Strategy 3: upscale 3x, no extra processing (for small cards)
            img_up3 = img_orig.resize((w * 3, h * 3), PILImage.LANCZOS)
            t3 = ocr_image(img_up3, psm=11)  # psm 11 = sparse text

            # Strategy 4: original image, PSM 4 (single column)
            t4 = ocr_image(img_orig, psm=4)

            # Pick the result with the most useful content
            all_results = [t for t in [t1, t2, t3, t4] if t]
            if all_results:
                # Merge all results — deduplicate lines, keep the richest content
                seen = set()
                merged_lines = []
                for text in all_results:
                    for line in text.splitlines():
                        line = line.strip()
                        if line and line not in seen and len(line) > 2:
                            seen.add(line)
                            merged_lines.append(line)
                best_text = '\n'.join(merged_lines)

            if best_text:
                return {'text': best_text, 'pages': 1, 'method': 'tesseract_ocr'}
            return {
                'text': '[Image uploaded — no readable text detected. Check image quality.]',
                'pages': 1, 'method': 'tesseract_ocr'
            }
        except Exception as e:
            logger.warning(f"Tesseract OCR failed: {e}")

    # ── Method 2: PyMuPDF built-in OCR ───────────────────────────────────
    if PYMUPDF_AVAILABLE:
        try:
            doc = fitz.open(filepath)
            full_text = ''
            for page_num in range(len(doc)):
                page = doc[page_num]
                page_text = page.get_text().strip()
                if page_text:
                    full_text += f'\n--- Page {page_num + 1} ---\n{page_text}'
                else:
                    try:
                        tp = page.get_textpage_ocr(flags=0, dpi=300, full=True, language='eng')
                        ocr_text = page.get_text(textpage=tp).strip()
                        if ocr_text:
                            full_text += f'\n--- Page {page_num + 1} (OCR) ---\n{ocr_text}'
                    except Exception:
                        full_text += f'\n[Page {page_num + 1} — OCR failed]'
            page_count = len(doc)
            doc.close()
            if full_text.strip():
                return {'text': full_text.strip(), 'pages': page_count, 'method': 'pymupdf_ocr'}
        except Exception as e:
            pass

    # ── Method 3: No OCR available ────────────────────────────────────────
    return {
        'text': (
            '[OCR not available. Install Tesseract to extract text from images.\n'
            'Windows: https://github.com/UB-Mannheim/tesseract/wiki\n'
            'Then restart the backend.]'
        ),
        'pages': 1,
        'method': 'no_ocr'
    }


def extract_text_from_pdf(filepath):
    """Extract text from PDF using PyMuPDF."""
    if not PYMUPDF_AVAILABLE:
        return {'text': '[PDF text extraction not available - PyMuPDF not installed]', 'pages': 0, 'method': 'none'}

    try:
        doc = fitz.open(filepath)
        full_text = ''
        for page_num in range(len(doc)):
            page = doc[page_num]
            page_text = page.get_text()
            if page_text.strip():
                full_text += f'\n--- Page {page_num + 1} ---\n{page_text}'
        # IMPORTANT: capture page_count BEFORE doc.close() — after close, len(doc) returns 0
        page_count = len(doc) if len(doc) > 0 else 1
        doc.close()
        if full_text.strip():
            return {'text': full_text, 'pages': page_count, 'method': 'pymupdf'}
        else:
            return {'text': '[Scanned PDF - OCR required for text extraction]', 'pages': page_count, 'method': 'ocr_required'}
    except Exception as e:
        return {'text': f'[Text extraction failed: {str(e)}]', 'pages': 0, 'method': 'error'}


def process_uploaded_file(file, bidder_id, tender_id=None, requirement_id=None):
    """Process an uploaded file: save, extract text, classify."""
    if not allowed_file(file.filename):
        raise ValueError(f"File type not supported: {file.filename}")

    # bidder_id becomes a folder name — it must not be able to escape UPLOAD_DIR
    if not bidder_id or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', str(bidder_id)):
        raise ValueError('Invalid bidder_id')

    # Create bidder-specific upload folder
    bidder_upload_dir = os.path.join(UPLOAD_DIR, bidder_id)
    os.makedirs(bidder_upload_dir, exist_ok=True)

    # Save file — strip any directory components a client may have put in the filename
    doc_id = f"DOC-UPLOAD-{str(uuid.uuid4())[:8].upper()}"
    base_name = os.path.basename(file.filename.replace('\\', '/')).strip()
    if not base_name:
        raise ValueError(f"File type not supported: {file.filename}")
    safe_filename = f"{doc_id}_{base_name}"
    filepath = os.path.join(bidder_upload_dir, safe_filename)
    file.save(filepath)

    # Extract text
    ext = file.filename.rsplit('.', 1)[1].lower()
    extraction = {'text': '', 'pages': 1, 'method': 'none'}
    if ext == 'pdf':
        extraction = extract_text_from_pdf(filepath)
    elif ext in ('png', 'jpg', 'jpeg'):
        extraction = extract_text_from_image(filepath)
    elif ext == 'docx':
        extraction = {'text': '[DOCX file - text extraction requires python-docx]', 'pages': 1, 'method': 'docx'}

    # Classify
    classification = classify_document(file.filename, extraction['text'])

    # Extract entities from text
    from services.ai_service import extract_entities
    entities = extract_entities(extraction['text'], classification['type'])

    # ── Duplicate PAN prevention ────────────────────────────────────────
    # Load the document list ONCE here and reuse it for both the duplicate
    # check and the tampering analysis — eliminates two extra disk reads.
    all_existing_docs = load_documents()

    if classification['type'] == 'PAN':
        existing_pan = next(
            (d for d in all_existing_docs
             if d.get('bidder_id') == bidder_id
             and d.get('classification') == 'PAN'),
            None
        )
        if existing_pan:
            try:
                os.remove(filepath)
            except OSError:
                pass
            raise DuplicatePANError(existing_pan, new_pan=entities.get('pan'))

    # ── PAN confidence / extraction quality check ───────────────────────
    # If OCR extracted a PAN but classification confidence is below threshold,
    # mark the extracted PAN as NEEDS_REVIEW rather than silently treating it
    # as correct. This prevents a blurry or partially-read PAN from being
    # displayed as authoritative.
    _PAN_CONF_THRESHOLD = 0.70
    if classification['type'] == 'PAN':
        import re as _re
        raw_pan = entities.get('pan')
        if raw_pan:
            clean_pan = raw_pan.strip().upper()
            if not _re.match(r'^[A-Z]{5}[0-9]{4}[A-Z]$', clean_pan):
                # OCR produced a PAN-shaped token that fails strict validation
                entities['pan'] = None
                entities['pan_extraction_status'] = 'INVALID_FORMAT'
            elif classification.get('confidence', 1.0) < _PAN_CONF_THRESHOLD:
                entities['pan_extraction_status'] = 'NEEDS_REVIEW'
            else:
                entities['pan_extraction_status'] = 'OK'
        else:
            entities['pan_extraction_status'] = 'NOT_FOUND'

    # Run live gov API verification based on classification
    # Use the cache to read bidders.json — no extra disk read
    from services.json_cache import load_cached
    bidders_data = load_cached('bidders.json')
    bidder_obj  = next((b for b in bidders_data if b['id'] == bidder_id), {})
    bidder_name = bidder_obj.get('name', '')
    gov_verification = _run_gov_verification(classification['type'], extraction['text'], bidder_name)

    # Run tampering analysis — reuse all_existing_docs loaded above
    tampering = run_tampering_analysis(
        filepath=filepath,
        doc_id=doc_id,
        bidder_id=bidder_id,
        extracted_text=extraction['text'],
        doc_type=classification['type'],
        all_docs=all_existing_docs,
    )

    doc_record = {
        'id': doc_id,
        'bidder_id': bidder_id,
        'tender_id': tender_id,
        'requirement_id': requirement_id,
        'filename': file.filename,
        'saved_path': safe_filename,
        'doc_type': classification['type'],
        'classification': classification['type'],
        'confidence': classification['confidence'],
        'pages': extraction['pages'],
        'extracted_text': extraction['text'][:2000],
        'extraction_method': extraction['method'],
        'extracted_entities': entities,
        'gov_verification': gov_verification,
        'status': 'processed',
        'uploaded_at': datetime.now().isoformat(),
        # Tampering detection fields
        'file_hash': tampering.get('file_hash'),
        'tampered': tampering.get('tampered', False),
        'suspicious': tampering.get('suspicious', False),
        'tampering_risk': tampering.get('tampering_risk'),
        'tampering_signals': tampering.get('signals', []),
        'tampering_signal_count': tampering.get('signal_count', 0),
    }

    # Persist to documents.json
    docs = load_documents()
    docs.append(doc_record)
    save_documents(docs)

    return doc_record


def load_documents():
    """Load all documents from disk (cached in memory after first read)."""
    from services.json_cache import load_cached
    return load_cached('documents.json')


def save_documents(docs):
    """Write documents to disk and update the in-memory cache."""
    from services.json_cache import save_cached
    save_cached('documents.json', docs)


def get_documents_for_bidder(bidder_id):
    """Return uploaded documents for a bidder — one cache lookup, zero disk reads.
    Filters out documents where the physical file no longer exists (ephemeral storage)."""
    import os
    all_docs = load_documents()
    valid_docs = []
    for d in all_docs:
        if d['bidder_id'] != bidder_id:
            continue
        # If document has a saved_path, verify the file still exists
        if d.get('saved_path'):
            if os.path.exists(d['saved_path']):
                valid_docs.append(d)
            # else: file was deleted/lost (ephemeral storage), skip it
        else:
            # Demo/seed documents without saved_path are always valid
            valid_docs.append(d)
    return valid_docs


def get_document_by_id(doc_id):
    """Return a single document by ID — one cache lookup, zero disk reads."""
    return next((d for d in load_documents() if d['id'] == doc_id), None)
