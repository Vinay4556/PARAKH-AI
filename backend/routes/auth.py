"""
Auth routes - PARAKH AI
Token-based auth. Passwords stored as SHA-256 hashes in production;
demo users have plaintext passwords that are auto-migrated on first login.
"""
import json
import os
import secrets
import hashlib
from datetime import datetime
from flask import Blueprint, jsonify, request
from config import DATA_DIR

auth_bp = Blueprint('auth', __name__)

# In-memory session store — suitable for demo / single-process.
# Replace with Redis or DB-backed sessions for multi-process production deployment.
SESSIONS = {}


def load_users():
    path = os.path.join(DATA_DIR, 'users.json')
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_users(users):
    path = os.path.join(DATA_DIR, 'users.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(users, f, indent=2, ensure_ascii=False)


def _hash_password(password: str) -> str:
    """SHA-256 hash for demo. Use bcrypt/argon2 in production."""
    return hashlib.sha256(password.encode('utf-8')).hexdigest()


def _check_password(user: dict, password: str) -> bool:
    """Check password — supports both plaintext demo passwords and hashed ones."""
    stored = user.get('password', '')
    # If stored is a 64-char hex string it's already hashed
    if len(stored) == 64 and all(c in '0123456789abcdef' for c in stored):
        return stored == _hash_password(password)
    # Plaintext fallback for existing demo data
    return stored == password


@auth_bp.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400

    users = load_users()
    user = next((u for u in users if u['email'].lower() == email), None)

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

    token = secrets.token_hex(32)
    SESSIONS[token] = {
        'user_id': user['id'],
        'email': user['email'],
        'name': user['name'],
        'role': user['role'],
        'organization_id': user.get('organization_id'),
        'organization_name': user.get('organization_name'),
        'department': user.get('department'),
        'employee_id': user.get('employee_id'),
        'logged_in_at': datetime.now().isoformat(),
    }

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
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    SESSIONS.pop(token, None)
    return jsonify({'status': 'logged_out'})


@auth_bp.route('/api/auth/me', methods=['GET'])
def me():
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    session = SESSIONS.get(token)
    if not session:
        return jsonify({'error': 'Not authenticated'}), 401
    return jsonify(session)


@auth_bp.route('/api/auth/change-password', methods=['POST'])
def change_password():
    """Allow users to update their password."""
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    session = SESSIONS.get(token)
    if not session:
        return jsonify({'error': 'Authentication required'}), 401

    data = request.get_json() or {}
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
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    return SESSIONS.get(token)


def require_role(*roles):
    """Decorator factory for role-based access control."""
    def decorator(f):
        from functools import wraps
        @wraps(f)
        def wrapped(*args, **kwargs):
            token = request.headers.get('Authorization', '').replace('Bearer ', '')
            session = SESSIONS.get(token)
            if not session:
                return jsonify({'error': 'Authentication required'}), 401
            if roles and session.get('role') not in roles:
                return jsonify({'error': 'Insufficient permissions', 'required': list(roles), 'current': session.get('role')}), 403
            return f(*args, **kwargs)
        return wrapped
    return decorator
