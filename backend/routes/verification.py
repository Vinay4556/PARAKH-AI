"""
Government Verification API Routes — BIDVERIFY 360
Exposes government adapter layer via REST endpoints.
"""
import json
import os
from flask import Blueprint, jsonify, request
from config import DATA_DIR
from services.gov_adapters import (
    run_verification, run_full_verification,
    ADAPTER_METADATA, ADAPTER_MODE,
    GSTINAPI_KEY, DATA_GOV_API_KEY,
    SANDBOX_API_KEY, SANDBOX_API_SECRET,
    PROTEAN_OPV_TOKEN, PROTEAN_OPV_SUBAGENTID, DIDIT_API_KEY,
    APISATHI_API_KEY, SUREPASS_TOKEN,
)

verification_bp = Blueprint('verification', __name__)


from database.db_utils import load_cached as load_json, save_cached as save_json


@verification_bp.route('/api/verification/adapters', methods=['GET'])
def list_adapters():
    """List all configured government verification adapters — used by frontend GovVerification page."""
    # Determine which adapters are truly active (key set + live_available)
    # PAN uses a five-tier cascade — active if ANY tier is configured
    pan_active = bool(
        SUREPASS_TOKEN or APISATHI_API_KEY or
        (PROTEAN_OPV_TOKEN and PROTEAN_OPV_SUBAGENTID) or
        DIDIT_API_KEY or
        (SANDBOX_API_KEY and SANDBOX_API_SECRET)
    )
    key_map = {
        'GSTN':       bool(GSTINAPI_KEY),
        'PAN':        pan_active,
        'MCA21':      bool(DATA_GOV_API_KEY),
        'BLACKLIST':  True,   # always active (internal list)
        'DIGILOCKER': False,  # requires NIC MoU
        'UDYAM':      False,  # no free API
        'EPFO':       False,  # no free API
        'ESIC':       False,  # no free API
    }
    configured = [k for k, v in ADAPTER_METADATA.items() if key_map.get(k, False)]
    mock_only  = [k for k, v in ADAPTER_METADATA.items() if not key_map.get(k, False)]

    return jsonify({
        'mode':       ADAPTER_MODE,
        'adapters':   ADAPTER_METADATA,
        'total':      len(ADAPTER_METADATA),
        'configured': configured,
        'mock_only':  mock_only,
        'note':       'LIVE adapters require authorized API credentials.',
    })


@verification_bp.route('/api/verification/status', methods=['GET'])
def verification_status():
    """
    Shows exactly which adapters are LIVE vs MOCK and whether API keys are set.
    Use this to confirm live mode is active.
    """
    adapters_status = {
        'GSTN': {
            'mode':        'LIVE' if (ADAPTER_MODE == 'LIVE' and GSTINAPI_KEY) else 'MOCK',
            'key_set':     bool(GSTINAPI_KEY),
            'api':         'gstinapi.in (GSP Network)',
            'description': 'Real GSTIN verification against GST Network',
        },
        'MCA21': {
            'mode':        'LIVE (best-effort)' if (ADAPTER_MODE == 'LIVE' and DATA_GOV_API_KEY) else 'MOCK',
            'key_set':     bool(DATA_GOV_API_KEY),
            'api':         'MCA V3 Portal',
            'description': 'CIN verification against Ministry of Corporate Affairs',
        },
        'PAN': {
            'mode': (
                'LIVE (Surepass — ITD database)'           if (ADAPTER_MODE == 'LIVE' and SUREPASS_TOKEN)
                else 'LIVE (API Sathi — ITD database)'     if (ADAPTER_MODE == 'LIVE' and APISATHI_API_KEY)
                else 'LIVE (Protean OPV — ITD authorised)' if (ADAPTER_MODE == 'LIVE' and PROTEAN_OPV_TOKEN and PROTEAN_OPV_SUBAGENTID)
                else 'LIVE (Didit.me — ITD database)'      if (ADAPTER_MODE == 'LIVE' and DIDIT_API_KEY)
                else 'LIVE (sandbox.co.in — ITD DB)'       if (ADAPTER_MODE == 'LIVE' and SANDBOX_API_KEY and SANDBOX_API_SECRET)
                else 'MOCK'
            ),
            'key_set': bool(
                SUREPASS_TOKEN or APISATHI_API_KEY or
                (PROTEAN_OPV_TOKEN and PROTEAN_OPV_SUBAGENTID) or DIDIT_API_KEY or
                (SANDBOX_API_KEY and SANDBOX_API_SECRET)
            ),
            'api': 'Cascade: Surepass → API Sathi → Protean OPV → Didit.me → sandbox.co.in',
            'description': (
                'Real-time PAN verification against Income Tax Department. '
                'Active tier: ' + (
                    'Surepass (live ITD)' if SUREPASS_TOKEN
                    else 'API Sathi (live)' if APISATHI_API_KEY
                    else 'Protean eGov OPV (ITD-authorised)' if (PROTEAN_OPV_TOKEN and PROTEAN_OPV_SUBAGENTID)
                    else 'Didit.me (ITD database, $0.84/query)' if DIDIT_API_KEY
                    else 'sandbox.co.in (Quicko KYC)' if (SANDBOX_API_KEY and SANDBOX_API_SECRET)
                    else 'None — format validation only'
                )
            ),
        },
        'UDYAM': {
            'mode':        'OFFLINE',
            'key_set':     True,
            'api':         'Offline format + state code validator',
            'description': 'Udyam format validation (no free public API)',
        },
        'EPFO': {
            'mode':        'OFFLINE',
            'key_set':     True,
            'api':         'Offline format validator',
            'description': 'EPFO number format validation (no free public API)',
        },
        'ESIC': {
            'mode':        'OFFLINE',
            'key_set':     True,
            'api':         'Offline format validator',
            'description': 'ESIC number format validation (no free public API)',
        },
        'BLACKLIST': {
            'mode':        'LIVE',
            'key_set':     True,
            'api':         'Internal debarment list',
            'description': 'GeM/CPSE debarment check',
        },
    }

    live_count = sum(1 for v in adapters_status.values() if 'LIVE' in v['mode'])

    return jsonify({
        'overall_mode':   ADAPTER_MODE,
        'gstn_live':      bool(ADAPTER_MODE == 'LIVE' and GSTINAPI_KEY),
        'mca_live':       bool(ADAPTER_MODE == 'LIVE' and DATA_GOV_API_KEY),
        'live_adapters':  live_count,
        'total_adapters': len(adapters_status),
        'adapters':       adapters_status,
        'message': (
            'System is running in LIVE mode — GSTN + PAN hitting real government databases.'
            if (ADAPTER_MODE == 'LIVE' and GSTINAPI_KEY and SANDBOX_API_KEY)
            else 'System is running in LIVE mode — GSTN calls hit real GSP network.'
            if (ADAPTER_MODE == 'LIVE' and GSTINAPI_KEY)
            else 'System is running in MOCK mode — set GOV_ADAPTER_MODE=LIVE in backend/.env'
        ),
    })


@verification_bp.route('/api/verification/verify', methods=['POST'])
def single_verify():
    """Run a single government source verification."""
    data = request.get_json() or {}
    adapter = data.get('adapter', '').upper()
    identifier = data.get('identifier', '')
    submitted_name = data.get('submitted_name')

    if not adapter or not identifier:
        return jsonify({'error': 'adapter and identifier are required'}), 400

    result = run_verification(adapter, identifier, submitted_name)
    return jsonify(result)


@verification_bp.route('/api/verification/bidder/<bidder_id>', methods=['GET'])
def verify_bidder(bidder_id):
    """Run full government verification for a bidder.

    Uses registered identity fields (gstin, pan, cin…) when available.
    Falls back to identifiers extracted from the bidder's uploaded documents
    (OCR'd entities) when registration fields are null — this covers new
    bidders whose registration data was wiped as placeholder, but who have
    since uploaded real documents containing their GSTIN / PAN.
    """
    bidders = load_json('bidders.json')
    bidder = next((b for b in bidders if b['id'] == bidder_id), None)
    if not bidder:
        return jsonify({'error': 'Bidder not found'}), 404

    # Load the bidder's uploaded documents so run_full_verification can fall
    # back to OCR-extracted identifiers when registration fields are null.
    from services.document_service import get_documents_for_bidder
    documents = get_documents_for_bidder(bidder_id)

    # If the bidder has no registered name but has uploaded documents, try to
    # derive a display name from OCR-extracted entities.
    effective_bidder = dict(bidder)
    if not effective_bidder.get('name'):
        for doc in documents:
            if doc.get('saved_path'):
                ents = doc.get('extracted_entities') or {}
                extracted_name = ents.get('company_name') or ents.get('name')
                if extracted_name:
                    effective_bidder['name'] = extracted_name
                    break

    results = run_full_verification(effective_bidder, documents=documents)

    # Classify results into three buckets:
    #  verified  — live ITD check passed
    #  pending   — format valid but no live check ran (no API key / subscription gap)
    #  failed    — actual mismatch, not found, or error
    verified_count = sum(1 for r in results if r.get('verified'))
    pending_count  = sum(1 for r in results
                         if not r.get('verified')
                         and (r.get('status') in (
                             'FORMAT_VALID_ONLY', 'FORMAT_VALID',
                             'STRUCTURALLY_VALID',   # offline validator — pending live ITD check
                             'NOT_SUBMITTED', 'PENDING_USER_AUTH',
                         ) or r.get('mode') == 'OFFLINE')
                         and not r.get('mismatch_flags'))
    mismatches = [f for r in results
                  for f in r.get('mismatch_flags', [])
                  if r.get('status') not in (
                      'FORMAT_VALID_ONLY', 'FORMAT_VALID',
                      'STRUCTURALLY_VALID', 'NOT_SUBMITTED',
                  ) and r.get('mode') != 'OFFLINE']

    # Overall status:
    #  CLEAR         — all checks that ran passed, nothing flagged
    #  PENDING       — some checks could not run (no live key), none failed
    #  ISSUES_FOUND  — at least one real mismatch or failure
    if mismatches:
        overall = 'ISSUES_FOUND'
    elif pending_count > 0 and verified_count + pending_count == len(results):
        overall = 'PENDING'
    elif results and not mismatches and verified_count == len(results):
        overall = 'CLEAR'
    else:
        overall = 'ISSUES_FOUND'

    return jsonify({
        'bidder_id':          bidder_id,
        'bidder_name':        effective_bidder.get('name'),
        'overall_status':     overall,
        'verified_count':     verified_count,
        'pending_count':      pending_count,
        'total_checks':       len(results),
        'mismatches_detected': len(mismatches),
        'mismatch_details':   mismatches,
        'results':            results,
        'verified_at':        __import__('datetime').datetime.now().isoformat(),
        'note': (
            'PAN structural validation passed (free, offline). '
            'Live ITD confirmation pending — subscribe sandbox.co.in KYC marketplace '
            'or top up your Didit account to enable real-time ITD database check.'
            if pending_count > 0 else None
        ),
    })


@verification_bp.route('/api/verification/gstn/<gstin>', methods=['GET'])
def verify_gstn(gstin):
    submitted_name = request.args.get('name')
    result = run_verification('GSTN', gstin, submitted_name)
    return jsonify(result)


@verification_bp.route('/api/verification/blacklist/<identifier>', methods=['GET'])
def check_blacklist(identifier):
    result = run_verification('BLACKLIST', identifier)
    return jsonify(result)
