"""
translate.py — HTTP surface for the self-hosted translation service.

The frontend talks only to this backend.  That keeps LibreTranslate off the
public internet entirely, avoids CORS problems, and means the durable cache is
shared by every user of the deployment.
"""
from flask import Blueprint, request, jsonify

from services import translate_service as svc

translate_bp = Blueprint('translate', __name__)

MAX_BATCH = 500
MAX_BUNDLE_KEYS = 2000


def _error(message, status=400):
    return jsonify({'error': message}), status


@translate_bp.route('/api/translate', methods=['POST'])
def translate():
    data = request.get_json(silent=True) or {}
    text = data.get('q', '')
    source = data.get('source', 'auto')
    target = data.get('target')

    if not isinstance(text, str) or not text.strip():
        return jsonify({'translatedText': text, 'source': 'passthrough'})
    if not target:
        return _error("Missing required field: 'target'")

    result = svc.translate(text, target, source)
    return jsonify({'translatedText': result})


@translate_bp.route('/api/translate/batch', methods=['POST'])
def translate_batch():
    data = request.get_json(silent=True) or {}
    texts = data.get('q')
    source = data.get('source', 'auto')
    target = data.get('target')

    if not isinstance(texts, list):
        return _error("Field 'q' must be an array of strings")
    if not target:
        return _error("Missing required field: 'target'")
    if len(texts) > MAX_BATCH:
        return _error(f'Batch too large — maximum is {MAX_BATCH} strings')

    return jsonify({'translatedTexts': svc.translate_many(texts, target, source)})


@translate_bp.route('/api/translate/bundle', methods=['POST'])
def translate_bundle():
    """Build a complete i18next resource bundle for one language.

    The client posts the English bundle it already has and gets back the same
    keys translated. Because every string is cached on the server, switching to
    a language is a single fast request the first time and free thereafter.
    """
    data = request.get_json(silent=True) or {}
    strings = data.get('strings')
    source = data.get('source', 'en')
    target = data.get('target')

    if not isinstance(strings, dict):
        return _error("Field 'strings' must be an object")
    if not target:
        return _error("Missing required field: 'target'")
    if len(strings) > MAX_BUNDLE_KEYS:
        return _error(f'Bundle too large — maximum is {MAX_BUNDLE_KEYS} keys')

    return jsonify({'bundle': svc.translate_bundle(strings, target, source)})


@translate_bp.route('/api/translate/languages', methods=['GET'])
def languages():
    return jsonify({'languages': svc.supported_languages()})


@translate_bp.route('/api/translate/status', methods=['GET'])
def status():
    online = svc.engine_status()
    primary_up = False
    try:
        import requests as req
        r = req.get(f'{svc.LIBRETRANSLATE_URL}/languages', timeout=3)
        primary_up = r.ok
    except Exception:
        pass
    return jsonify({
        'status': 'ok',
        'engine': 'libretranslate+mymemory',
        'engine_online': online,
        'primary_url': svc.LIBRETRANSLATE_URL,
        'primary_online': primary_up,
        'fallback': 'mymemory' if not primary_up else None,
        'cached_translations': svc.cached_count(),
        'free': True,
        'expirable': False,
        'api_key_required': False,
    })
