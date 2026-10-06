"""
Auth routes - Veritas AI
Token-based auth with SIGNED, STATELESS tokens.

The previous version kept sessions in a process-local dict.  On Railway (several
gunicorn workers, restarts on every deploy) a token issued by one worker was
unknown to the next one, so a successful login was followed by 401 "Not
authenticated" and the user bounced back to the login page.  A signed token is
verifiable by any worker without shared state and survives restarts.

Passwords: stored as SHA-256 hashes; the demo users' plaintext passwords are
accepted for login (kept for the demo build).
"""
import hashlib
import os
import threading
from datetime import datetime

from flask import Blueprint, current_app, jsonify, request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

auth_bp = Blueprint('auth', __name__)

TOKEN_TTL_SECONDS = int(float(os.environ.get('TOKEN_TTL_HOURS', '12')) * 3600)

from database.db_utils import load_cached as load_json, save_cached as save_json  # noqa: E402


# ── Signed-token session store ──────────────────────────────────────────────

def _serializer():
    return URLSafeTimedSerializer(current_app.config['SECRET_KEY'], salt='veritas-auth-v1')


def issue_token(session: dict) -> str:
    return _serializer().dumps(session)


class _SessionStore:
    """Dict-like facade so existing ``SESSIONS.get(token)`` call sites keep working.
    Tokens are verified cryptographically instead of looked up in memory."""

    def __init__(self):
        self._revoked = set()          # best-effort logout list (per process)
        self._lock = threading.Lock()

    def get(self, token, default=None):
        if not token or token in self._revoked:
            return default
        try:
            return _serializer().loads(token, max_age=TOKEN_TTL_SECONDS)
        except (BadSignature, SignatureExpired):
            return default

    def pop(self, token, default=None):
        session = self.get(token)
        if token:
            with self._lock:
                if len(self._revoked) > 5000:      # keep memory bounded
                    self._revoked.clear()
                self._revoked.add(token)
        return session if session is not None else default

    def __contains__(self, token):
        return self.get(token) is not None

    def __getitem__(self, token):
        session = self.get(token)
        if session is None:
            raise KeyError(token)
        return session


SESSIONS = _SessionStore()


def _token_from_request(req=None) -> str:
    req = req or request
    header = req.headers.get('Authorization', '')
    if header.lower().startswith('bearer '):
        header = header[7:]
    return header.strip()


def load_users():
    return load_json('users.json')


def save_users(users):
    save_json('users.json', users)


def _hash_password(password: str) -> str:
    """SHA-256 hash for demo. Use bcrypt/argon2 in production."""
    return hashlib.sha256(password.encode('utf-8')).hexdigest()


def _check_password(user: dict, password: str) -> bool:
    """Check password — supports both plaintext demo passwords and hashed ones."""
    stored = user.get('password') or ''
    # If stored is a 64-char hex string it's already hashed
    if len(stored) == 64 and all(c in '0123456789abcdef' for c in stored):
        return stored == _hash_password(password)
    # Plaintext fallback for existing demo data
    return stored == password


@auth_bp.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400

    users = load_users()
    user = next((u for u in users if (u.get('email') or '').lower() == email), None)

    if not user or not _check_password(user, password):
        return jsonify({'error': 'Invalid credentials'}), 401

    if not user.get('active', True):
        return jsonify({'error': 'Account is inactive. Contact administrator.'}), 403

    # Update last login
    for u in users:
        if u['id'] == user['id']:
            u['last_login'] = datetime.now().isoformat()
    try:
        save_users(users)
    except Exception:
        pass  # Non-fatal

    session = {
        'id': user['id'],              # alias: several routes read session['id']
        'user_id': user['id'],
        'email': user['email'],
        'name': user.get('name'),
        'role': user.get('role'),
        'organization_id': user.get('organization_id'),
        'organization_name': user.get('organization_name'),
        'department': user.get('department'),
        'employee_id': user.get('employee_id'),
        'logged_in_at': datetime.now().isoformat(),
    }
    token = issue_token(session)

    return jsonify({
        'token': token,
        'user': {
            'id': user['id'],
            'email': user['email'],
            'name': user['name'],
            'role': user['role'],
            'organization_id': user.get('organization_id'),
            'organization_name': user.get('organization_name'),
            'department': user.get('department'),
            'employee_id': user.get('employee_id'),
        }
    })


@auth_bp.route('/api/auth/logout', methods=['POST'])
def logout():
    SESSIONS.pop(_token_from_request(), None)
    return jsonify({'status': 'logged_out'})


@auth_bp.route('/api/auth/me', methods=['GET'])
def me():
    session = SESSIONS.get(_token_from_request())
    if not session:
        return jsonify({'error': 'Not authenticated'}), 401
    # Re-check the account so a deactivated user is locked out immediately.
    user = next((u for u in load_users() if u.get('id') == session.get('user_id')), None)
    if not user or not user.get('active', True):
        return jsonify({'error': 'Account not found or inactive'}), 401
    return jsonify(session)


@auth_bp.route('/api/auth/change-password', methods=['POST'])
def change_password():
    """Allow users to update their password."""
    session = SESSIONS.get(_token_from_request())
    if not session:
        return jsonify({'error': 'Authentication required'}), 401

    data = request.get_json(silent=True) or {}
    current = data.get('current_password', '')
    new_pw = data.get('new_password', '')

    if not new_pw or len(new_pw) < 8:
        return jsonify({'error': 'New password must be at least 8 characters'}), 400

    users = load_users()
    user = next((u for u in users if u['id'] == session['user_id']), None)
    if not user or not _check_password(user, current):
        return jsonify({'error': 'Current password is incorrect'}), 401

    for u in users:
        if u['id'] == session['user_id']:
            u['password'] = _hash_password(new_pw)
    save_users(users)
    return jsonify({'status': 'password_changed'})


def get_session(request):
    """Helper to get current session from request."""
    return SESSIONS.get(_token_from_request(request))


def require_role(*roles):
    """Decorator factory for role-based access control."""
    def decorator(f):
        from functools import wraps
        @wraps(f)
        def wrapped(*args, **kwargs):
            session = SESSIONS.get(_token_from_request())
            if not session:
                return jsonify({'error': 'Authentication required'}), 401
            if roles and session.get('role') not in roles:
                return jsonify({'error': 'Insufficient permissions', 'required': list(roles), 'current': session.get('role')}), 403
            return f(*args, **kwargs)
        return wrapped
    return decorator
