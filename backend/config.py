import os

# Configuration for Veritas AI - PostgreSQL Integration Ready
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# On cloud platforms (Render, Railway), the container filesystem may be read-only.
# Use /tmp for writable storage (ephemeral) or configure persistent volumes.
# Set environment variables to override defaults:
#   - UPLOAD_DIR=/tmp/uploads (or /mnt/data/uploads for persistent volume)
#   - REPORTS_DIR=/tmp/reports
#   - DATA_DIR=/tmp/data (for JSON cache)

# Use /tmp on Render/cloud platforms for writable storage
_is_cloud = os.environ.get('RENDER') or os.environ.get('RAILWAY_ENVIRONMENT')
_default_upload = '/tmp/uploads' if _is_cloud else os.path.join(BASE_DIR, 'uploads')
_default_reports = '/tmp/reports' if _is_cloud else os.path.join(BASE_DIR, 'reports')
_default_data = '/tmp/data' if _is_cloud else os.path.join(BASE_DIR, 'data')

UPLOAD_DIR = os.environ.get('UPLOAD_DIR') or _default_upload
REPORTS_DIR = os.environ.get('REPORTS_DIR') or _default_reports
DATA_DIR = os.environ.get('DATA_DIR') or _default_data

AI_MODE = os.environ.get('AI_MODE', 'demo')  # 'demo' or 'live'
USE_DATABASE_STORAGE = os.environ.get('USE_DATABASE_STORAGE', 'true').lower() == 'true'  # Store documents in DB
MAX_UPLOAD_SIZE_MB = 20
ALLOWED_EXTENSIONS = {'pdf', 'png', 'jpg', 'jpeg', 'docx'}

# Scoring weights
MANDATORY_WEIGHT = 5
OPTIONAL_WEIGHT = 2
