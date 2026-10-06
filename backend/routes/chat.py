"""
Veritas AI — Groq-powered chatbot route.

POST /api/chat
Body: { "messages": [{"role": "user"|"model", "parts": "..."}],
        "context":  optional extra context string }

Uses Groq's inference API (OpenAI-compatible Chat Completions format).
  Endpoint : https://api.groq.com/openai/v1/chat/completions
  Auth     : Authorization: Bearer <GROK_API_KEY>  (key starts with gsk_)
  Model    : openai/gpt-oss-120b  (fast, capable — available on this key)

Conversation history is passed from the frontend on every request.
The backend is fully stateless — no session leakage between users.
"""
import os
import requests
from flask import Blueprint, jsonify, request
from routes.auth import get_session

chat_bp = Blueprint('chat', __name__)

# The env var is named GROK_API_KEY (as set in .env) but it is a Groq key (gsk_...)
GROK_API_KEY = os.environ.get('GROK_API_KEY', '')

# Groq inference — OpenAI-compatible endpoint
GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions'
# Best available chat model on this key (confirmed working)
GROQ_MODEL = 'openai/gpt-oss-120b'

# ── System prompt ─────────────────────────────────────────────────────────────
SYSTEM_PROMPT = """You are Veritas AI Assistant, an expert AI embedded inside the
Veritas AI platform — an AI-powered GeM (Government e-Marketplace) Bid Compliance
Verification System built for India's public procurement ecosystem.

Your role:
- Help Procurement Officers understand compliance results, bid scores, risk levels,
  tender requirements, and officer decisions.
- Help Bidders/Vendors understand what documents are needed, why their compliance
  score is what it is, and how to improve their bid.
- Explain GeM procurement rules, GFR (General Financial Rules) 2017, QCBS scoring,
  two-envelope systems, L1 selection, EMD, MSE preference, Make in India policy,
  OEM authorization requirements, and EPFO/ESIC/Udyam registration requirements.
- Answer questions about PAN, GSTIN, CIN, Udyam, ISO certifications, EPFO, ESIC,
  bank solvency certificates, BIS/CE certificates, and other bid documents.
- Explain Veritas AI features: compliance analysis, document OCR, tampering detection,
  government API verification, bid comparison, QCBS scoring, audit trail, etc.
- Be concise, professional, and accurate. Use bullet points for lists.
- When you don't know something specific to this user's data, say so clearly and
  suggest they check the relevant page (Compliance, Bidders, Documents, etc.).
- Never fabricate compliance results, bid scores, or document statuses.
- Always respond in the same language the user writes in (English or Hindi).
- Keep responses focused — 3-5 sentences or a short bullet list unless more is needed.

Platform context:
- Tenders are created by Procurement Officers and published on GeM.
- Bidders register, upload documents (GST, PAN, UDYAM, ISO, EPFO, ESIC, OEM, etc.).
- Veritas AI runs OCR, entity extraction, cross-document checks, and compliance scoring.
- Compliance scores are 0-100%. Risk: LOW (>=85%, 0 NON_COMPLIANT), MEDIUM, HIGH.
- Officers review results, open financial bids (two-envelope), run QCBS evaluation,
  and record QUALIFY/DISQUALIFY/CLARIFICATION decisions.
- Government API verification checks GSTIN (gstinapi.in), PAN (ITD via multiple providers),
  MCA21 (company registry), EPFO, ESIC, Udyam format."""


def _build_grok_payload(messages: list, extra_context: str = None) -> dict:
    """
    Convert frontend message history into Grok's OpenAI-compatible format.

    Frontend sends: [{"role": "user"|"model", "parts": "text"}, ...]
    Grok expects:   [{"role": "user"|"assistant", "content": "text"}, ...]

    The system prompt is prepended as the first message with role="system".
    Any extra context (user role, session info) is appended to the last user message.
    """
    grok_messages = [{'role': 'system', 'content': SYSTEM_PROMPT}]

    for msg in messages:
        role = msg.get('role', 'user')
        text = str(msg.get('parts', '')).strip()
        if not text:
            continue
        # Gemini uses "model" for assistant turns — map to OpenAI "assistant"
        if role == 'model':
            role = 'assistant'
        elif role not in ('user', 'assistant', 'system'):
            role = 'user'
        grok_messages.append({'role': role, 'content': text})

    # Inject live platform context into the last user message
    if extra_context:
        # Walk back to find the last user turn
        for i in range(len(grok_messages) - 1, -1, -1):
            if grok_messages[i]['role'] == 'user':
                grok_messages[i]['content'] = (
                    grok_messages[i]['content']
                    + '\n\n[Platform context]\n'
                    + extra_context
                )
                break

    return {
        'model':       GROQ_MODEL,
        'messages':    grok_messages,
        'temperature': 0.4,
        'max_tokens':  1024,
        'stream':      False,
    }


@chat_bp.route('/api/chat', methods=['POST'])
def chat():
    """
    Stateless Grok chat endpoint.
    The frontend sends the full conversation history on every request.
    """
    if not GROK_API_KEY:
        return jsonify({
            'error': 'Grok API key not configured. Set GROK_API_KEY in backend/.env.',
            'reply': (
                'The AI Assistant is not configured. '
                'Please set GROK_API_KEY in the server environment.'
            ),
        }), 503

    data          = request.get_json(silent=True) or {}
    messages      = data.get('messages', [])
    extra_context = data.get('context', '')

    if not messages or not any(m.get('parts') for m in messages):
        return jsonify({'error': 'messages array is required and must be non-empty'}), 400

    # Cap history to last 20 turns (system prompt is added separately)
    if len(messages) > 20:
        messages = messages[-20:]

    # Enrich context with the logged-in user's role
    session = get_session(request)
    if session:
        role_ctx = (
            f"The user is logged in as role={session.get('role')} "
            f"({session.get('name', '')})."
        )
        extra_context = (role_ctx + '\n' + extra_context) if extra_context else role_ctx

    payload = _build_grok_payload(messages, extra_context)

    try:
        resp = requests.post(
            GROQ_URL,
            json=payload,
            headers={
                'Authorization': f'Bearer {GROK_API_KEY}',
                'Content-Type':  'application/json',
            },
            timeout=30,
        )
    except requests.exceptions.Timeout:
        return jsonify({
            'error': 'Groq API timed out.',
            'reply': 'Sorry, the AI is taking too long to respond. Please try again.',
        }), 504
    except requests.exceptions.RequestException as e:
        return jsonify({
            'error': str(e),
            'reply': 'Could not reach the AI service. Please check your connection.',
        }), 502

    if resp.status_code != 200:
        try:
            err_body = resp.json()
            err_msg  = (
                err_body.get('error', {}).get('message')
                or err_body.get('message')
                or resp.text[:300]
            )
        except Exception:
            err_msg = resp.text[:300]
        return jsonify({
            'error': f'Groq API error {resp.status_code}: {err_msg}',
            'reply': 'The AI Assistant encountered an error. Please try again in a moment.',
        }), resp.status_code

    try:
        body    = resp.json()
        choices = body.get('choices', [])
        if not choices:
            return jsonify({
                'reply':   'No response generated. Please try rephrasing your question.',
                'blocked': True,
            })

        reply = choices[0].get('message', {}).get('content', '').strip()
        if not reply:
            reply = 'I did not generate a response. Please try rephrasing your question.'

        return jsonify({
            'reply':        reply,
            'model':        body.get('model', GROQ_MODEL),
            'finish_reason': choices[0].get('finish_reason', ''),
        })

    except (KeyError, IndexError, ValueError) as e:
        return jsonify({
            'error': f'Failed to parse Grok response: {e}',
            'reply': 'Unexpected response from AI. Please try again.',
        }), 500
