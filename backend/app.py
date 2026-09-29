"""
BidGuard AI / PARAKH AI - Flask Backend
SIH26100 Demo — v2.1 Full Procurement Ecosystem
"""
import os
from flask import Flask, request
from flask_cors import CORS
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

from config import UPLOAD_DIR, REPORTS_DIR, DATA_DIR
from routes.dashboard import dashboard_bp
from routes.tenders import tenders_bp
from routes.bidders import bidders_bp
from routes.documents import documents_bp
from routes.reports import reports_bp
from routes.auth import auth_bp
from routes.bidder_portal import bidder_portal_bp
from routes.officer_portal import officer_portal_bp
from routes.officer_summary import officer_summary_bp
from routes.public_portal import public_portal_bp
from routes.contracts import contracts_bp
from routes.verification import verification_bp
from routes.grievance import grievance_bp
from routes.chat import chat_bp

# Ensure directories exist
for d in [UPLOAD_DIR, REPORTS_DIR, DATA_DIR]:
    os.makedirs(d, exist_ok=True)

app = Flask(__name__)
CORS(app, origins='*')

app.config['MAX_CONTENT_LENGTH'] = 20 * 1024 * 1024  # 20MB max upload

# ── Performance settings ──────────────────────────────────────
# Compact JSON — strip unnecessary whitespace from every API response
app.config['JSONIFY_PRETTYPRINT_REGULAR'] = False
app.config['JSON_SORT_KEYS'] = False            # skip per-response key sorting

# Compress responses ≥ 1 KB with gzip/deflate — cuts JSON payload by ~70 %
# Uses only stdlib, no extra pip package required.
from functools import wraps
import gzip as _gzip
import io as _io

@app.after_request
def compress_response(response):
    """Gzip compress JSON/text responses larger than 1 KB if the client accepts it."""
    accept_enc = request.headers.get('Accept-Encoding', '')
    if 'gzip' not in accept_enc:
        return response
    if response.status_code < 200 or response.status_code >= 300:
        return response
    content_type = response.content_type or ''
    if not any(ct in content_type for ct in ('json', 'text', 'javascript')):
        return response
    data = response.get_data()
    if len(data) < 1024:          # don't bother compressing tiny responses
        return response
    buf = _io.BytesIO()
    with _gzip.GzipFile(mode='wb', fileobj=buf, compresslevel=6) as gz:
        gz.write(data)
    compressed = buf.getvalue()
    if len(compressed) >= len(data):  # compression made it bigger — skip
        return response
    response.set_data(compressed)
    response.headers['Content-Encoding'] = 'gzip'
    response.headers['Content-Length']   = len(compressed)
    response.headers.add('Vary', 'Accept-Encoding')
    return response

# Register blueprints
app.register_blueprint(auth_bp)
app.register_blueprint(dashboard_bp)
app.register_blueprint(tenders_bp)
app.register_blueprint(bidders_bp)
app.register_blueprint(documents_bp)
app.register_blueprint(reports_bp)
app.register_blueprint(bidder_portal_bp)
app.register_blueprint(officer_portal_bp)
app.register_blueprint(officer_summary_bp)
app.register_blueprint(public_portal_bp)
app.register_blueprint(contracts_bp)
app.register_blueprint(verification_bp)
app.register_blueprint(grievance_bp)
app.register_blueprint(chat_bp)


@app.route('/api/health', methods=['GET'])
def health():
    return {'status': 'ok', 'service': 'PARAKH AI', 'version': '2.1.0-demo'}


@app.errorhandler(404)
def not_found(e):
    return {'error': 'Endpoint not found'}, 404


@app.errorhandler(500)
def server_error(e):
    return {'error': 'Internal server error', 'detail': str(e)}, 500


@app.errorhandler(413)
def too_large(e):
    return {'error': 'File too large. Maximum upload size is 20MB.'}, 413


# ── Warm the in-memory cache on startup ──────────────────────
# Pre-load the most-read JSON files so the very first request hits memory,
# not disk.  Failures are non-fatal — the cache will load lazily on demand.
def _warm_cache():
    from services.json_cache import load_cached
    for fname in ('bidders.json', 'documents.json', 'tenders.json',
                  'requirements.json', 'audit.json', 'clarifications.json',
                  'compliance.json', 'bids.json'):
        try:
            load_cached(fname)
        except Exception:
            pass  # file may not exist yet in a fresh install

with app.app_context():
    _warm_cache()


if __name__ == '__main__':
    print("=" * 55)
    print("  PARAKH AI — SIH26100 · Team Aevora · v2.1")
    print("  Backend running at http://localhost:5000")
    print("=" * 55)
    app.run(debug=False, port=5000, host='0.0.0.0', threaded=True)
