import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')
UPLOAD_DIR = os.path.join(BASE_DIR, 'uploads')
REPORTS_DIR = os.path.join(BASE_DIR, 'reports')

AI_MODE = os.environ.get('AI_MODE', 'demo')  # 'demo' or 'live'
MAX_UPLOAD_SIZE_MB = 20
ALLOWED_EXTENSIONS = {'pdf', 'png', 'jpg', 'jpeg', 'docx'}

# Scoring weights
MANDATORY_WEIGHT = 5
OPTIONAL_WEIGHT = 2
