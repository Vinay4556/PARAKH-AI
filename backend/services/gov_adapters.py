"""
Government Verification Adapter Layer — PARAKH AI / BidVerify 360

Real API integrations used:
- GSTN      → gstinapi.in              (real GSP network, 100 free lookups)
- PAN       → Three-tier cascade (priority order):
    1. Protean eGov OPV API            ITD-authorised, official government source
                                        POST https://opvservice.proteantech.in/pan/verifyapi
                                        Requires: PROTEAN_OPV_TOKEN + PROTEAN_OPV_SUBAGENTID
                                        Register: https://tinpan.proteantech.in
                                        Eligible: government departments, TDS deductors, etc.
    2. Didit.me Database Validation    Calls ITD DB directly, $0.84/conclusive query
                                        POST https://verification.didit.me/v3/database-validation/
                                        Requires: DIDIT_API_KEY
                                        Sign up: https://didit.me  (500 free/month)
    3. sandbox.co.in (Quicko)          Real ITD check via KYC API
                                        POST https://api.sandbox.co.in/kyc/pan/verify
                                        Requires: SANDBOX_API_KEY + SANDBOX_API_SECRET
                                        Sign up: https://sandbox.co.in  (email only)
    If all three are unconfigured → offline PAN format + checksum validation only.
- MCA21     → data.gov.in              (Company Master Data — no active public API currently)
- Udyam     → Format validation        (no free public API exists)
- EPFO      → Format validation        (no free public API exists)
- ESIC      → Format validation        (no free public API exists)
- Blacklist → Internal list

Mode selection (set in backend/.env):
  GOV_ADAPTER_MODE=LIVE   → calls real APIs (requires at least one PAN key below)
  GOV_ADAPTER_MODE=MOCK   → returns realistic demo data (default)

Required environment variables for LIVE PAN verification (set ONE or more):
  # Option 1 — Protean eGov OPV (official ITD-authorised, government grade)
  PROTEAN_OPV_TOKEN       → Bearer token issued by Protean after registration
  PROTEAN_OPV_SUBAGENTID  → SubAgentId assigned at registration (e.g. "ABCDE12345")
  # Option 2 — Didit.me (simplest, 500 free queries/month)
  DIDIT_API_KEY           → from https://didit.me dashboard
  # Option 3 — sandbox.co.in / Quicko (free KYC plan)
  SANDBOX_API_KEY         → from https://sandbox.co.in
  SANDBOX_API_SECRET      → from https://sandbox.co.in
  # GSTN
  GSTINAPI_KEY            → from https://gstinapi.in (100 free lookups on sign-up)
  # MCA21
  DATA_GOV_API_KEY        → from https://data.gov.in (free, register → Profile → API key)
"""

import os
import re
import requests
from dataclasses import dataclass, asdict
from typing import Optional
from datetime import datetime
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────
ADAPTER_MODE     = os.environ.get('GOV_ADAPTER_MODE', 'MOCK').upper()

# Real API keys (set these in backend/.env)
GSTINAPI_KEY       = os.environ.get('GSTINAPI_KEY', '')         # gstinapi.in
SANDBOX_API_KEY    = os.environ.get('SANDBOX_API_KEY', '')      # sandbox.co.in (PAN)
SANDBOX_API_SECRET = os.environ.get('SANDBOX_API_SECRET', '')   # sandbox.co.in (PAN secret)
DATA_GOV_API_KEY   = os.environ.get('DATA_GOV_API_KEY', '')     # data.gov.in (MCA)

# ── PAN verification — five-tier cascade ────────────────────────────────────
# Priority 0a: Surepass  (EASIEST live setup — free signup, token ready in 2 min)
#              Sign up: https://app.surepass.io/register → Dashboard → API Keys
#              POST https://kyc-api.surepass.io/api/v1/pan/pan-comprehensive
#              Header: Authorization: Bearer <SUREPASS_TOKEN>
#              Body:   {"id_number": "ABCDE1234F"}
SUREPASS_TOKEN     = os.environ.get('SUREPASS_TOKEN', '')

# Priority 0b: API Sathi  (set APISATHI_API_KEY once they provision a valid UUID key)
#              POST https://apisathi.com/api/v1/pan-verify
#              Header: x-api-key: <APISATHI_API_KEY>
#              NOTE: test key "test_W1I8t4..." has a UUID format bug on API Sathi's server.
APISATHI_API_KEY   = os.environ.get('APISATHI_API_KEY', '')

# Priority 1: Protean eGov OPV  (ITD-authorised official API)
PROTEAN_OPV_TOKEN     = os.environ.get('PROTEAN_OPV_TOKEN', '')
PROTEAN_OPV_SUBAGENTID = os.environ.get('PROTEAN_OPV_SUBAGENTID', '')
# Priority 2: Didit.me  ($0.84/conclusive, 500 free/month, simplest setup)
DIDIT_API_KEY         = os.environ.get('DIDIT_API_KEY', '')
# Priority 3: sandbox.co.in / Quicko  (free KYC plan, email sign-up)
# (uses SANDBOX_API_KEY + SANDBOX_API_SECRET above)

# data.gov.in company master data resource ID
DATA_GOV_MCA_RESOURCE_ID = '23063b37-aa3e-43d2-ae40-e1fe82c88eb6'

REQUEST_TIMEOUT = 10  # seconds


# ── Result dataclass ──────────────────────────────────────────
@dataclass
class VerificationResult:
    """Normalized result returned by every government API adapter."""
    adapter:        str           # GSTN | UDYAM | MCA21 | EPFO | ESIC | DIGILOCKER | PAN | BLACKLIST
    verified:       bool
    confidence:     float         # 0.0 – 1.0
    entity_name:    Optional[str] # Legal name from government source
    identifier:     Optional[str] # GSTIN / PAN / Udyam number etc.
    status:         str           # ACTIVE | INACTIVE | CANCELLED | NOT_FOUND | ERROR
    verified_at:    str           # ISO timestamp
    source:         str           # "gstinapi.in (GSP)" | "data.gov.in (MCA)" | "MOCK" …
    mode:           str           # MOCK | LIVE
    raw_fields:     dict          # All extracted fields from the API response
    mismatch_flags: list          # Detected mismatches vs submitted document
    notes:          Optional[str]


# ── Helpers ───────────────────────────────────────────────────

def _name_match(submitted: str, official: str) -> bool:
    """Loose name comparison — case-insensitive, normalises common abbreviations."""
    def norm(s):
        return (s.strip().upper()
                .replace('PVT. LTD.', 'PRIVATE LIMITED')
                .replace('PVT LTD',   'PRIVATE LIMITED')
                .replace('LTD.',      'LIMITED')
                .replace('  ', ' '))
    return norm(submitted) == norm(official)


def _make_error_result(adapter, identifier, msg, mode=None) -> VerificationResult:
    return VerificationResult(
        adapter=adapter, verified=False, confidence=0.0,
        entity_name=None, identifier=identifier, status='ERROR',
        verified_at=datetime.now().isoformat(),
        source='Error', mode=mode or ADAPTER_MODE,
        raw_fields={}, mismatch_flags=[],
        notes=msg
    )


# ═══════════════════════════════════════════════════════════════
# GSTN Adapter  →  gstinapi.in  (real GSP network)
# Sign up at https://gstinapi.in — 100 free lookups, no card
# ═══════════════════════════════════════════════════════════════

class GSTNAdapter:
    NAME = 'GSTN'

    # Realistic mock data for MOCK mode
    _MOCK = {
        '27AABCA1234B1ZH': {
            'legal_name': 'ABC Technologies Pvt Ltd',
            'trade_name': 'ABC Technologies',
            'status': 'Active',
            'taxpayer_type': 'Regular',
            'registration_date': '2018-03-15',
            'state_code': '27',
            'state_jurisdiction': 'Maharashtra',
            'address': 'Plot 45, MIDC Industrial Area, Andheri East, Mumbai - 400093',
            'pincode': '400093',
            'nature_of_business': ['Supplier of Services'],
            'block_status': 'U',
        },
        '07AABCB5678C1ZS': {
            'legal_name': 'Bharat Industrial Systems Pvt Ltd',
            'trade_name': 'Bharat Industrial',
            'status': 'Active',
            'taxpayer_type': 'Regular',
            'registration_date': '2014-06-01',
            'state_code': '07',
            'state_jurisdiction': 'Delhi',
            'address': 'B-12, Okhla Industrial Estate, New Delhi - 110020',
            'pincode': '110020',
            'nature_of_business': ['Manufacturer'],
            'block_status': 'U',
        },
        '29AABCN9012D1ZO': {
            'legal_name': 'Nova Engineering Solutions Pvt Ltd',
            'trade_name': 'Nova Engineering',
            'status': 'Active',
            'taxpayer_type': 'Regular',
            'registration_date': '2009-11-15',
            'state_code': '29',
            'state_jurisdiction': 'Karnataka',
            'address': 'No. 78, Whitefield Industrial Area, Bangalore - 560066',
            'pincode': '560066',
            'nature_of_business': ['Supplier of Goods'],
            'block_status': 'U',
        },
    }

    # GSTIN checksum alphabet
    _CHECKSUM_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'

    def _validate_format(self, gstin: str) -> bool:
        return bool(re.match(
            r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$', gstin
        ))

    def _validate_checksum(self, gstin: str) -> bool:
        """Validate GSTIN checksum using the Luhn-like algorithm used by GSTN."""
        try:
            chars = self._CHECKSUM_CHARS
            total = 0
            for i, ch in enumerate(gstin[:-1]):
                val = chars.index(ch)
                if i % 2 != 0:
                    val *= 2
                total += val // len(chars) + val % len(chars)
            expected = (len(chars) - total % len(chars)) % len(chars)
            return chars[expected] == gstin[-1]
        except Exception:
            return False

    def _call_live_api(self, gstin: str) -> Optional[dict]:
        """
        Call gstinapi.in — real GSP network data.
        GET https://api.gstinapi.in/v1/gstin/{gstin}
        Header: x-api-key: <GSTINAPI_KEY>
        Response fields: legal_name, trade_name, status, taxpayer_type,
                         registration_date, state_code, state_jurisdiction,
                         address, pincode, nature_of_business, block_status
        """
        if not GSTINAPI_KEY:
            logger.warning("GSTINAPI_KEY not set. Add it to backend/.env (get free key at gstinapi.in).")
            return None
        try:
            url = f"https://www.gstinapi.in/v1/gstin/{gstin}"
            headers = {'x-api-key': GSTINAPI_KEY}
            resp = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
            if resp.status_code == 200:
                body = resp.json()
                # Response shape: {"success": true, "data": {...}, "credits_remaining": N}
                if body.get('success') and body.get('data'):
                    return body['data']
                return {'status': 'Not Found', '_not_found': True}
            elif resp.status_code == 404:
                return {'status': 'Not Found', '_not_found': True}
            elif resp.status_code == 402:
                logger.error("gstinapi.in: credit exhausted. Buy more at gstinapi.in.")
                return None
            else:
                logger.error(f"gstinapi.in returned {resp.status_code}: {resp.text[:200]}")
                return None
        except requests.exceptions.Timeout:
            logger.error("gstinapi.in request timed out.")
            return None
        except Exception as e:
            logger.error(f"gstinapi.in error: {e}")
            return None

    def verify(self, gstin: str, submitted_name: str = None) -> VerificationResult:
        gstin = (gstin or '').strip().upper()

        # 1. Format check
        if not self._validate_format(gstin):
            return VerificationResult(
                adapter=self.NAME, verified=False, confidence=0.0,
                entity_name=None, identifier=gstin, status='INVALID_FORMAT',
                verified_at=datetime.now().isoformat(),
                source='GSTIN Format Validator', mode=ADAPTER_MODE,
                raw_fields={}, mismatch_flags=['GSTIN format is invalid'],
                notes='GSTIN must be 15 characters: 2-digit state + 10-char PAN + entity-type + Z + checksum.'
            )

        # 2. Checksum check (free, offline)
        if not self._validate_checksum(gstin):
            return VerificationResult(
                adapter=self.NAME, verified=False, confidence=0.0,
                entity_name=None, identifier=gstin, status='INVALID_CHECKSUM',
                verified_at=datetime.now().isoformat(),
                source='GSTIN Checksum Validator', mode=ADAPTER_MODE,
                raw_fields={}, mismatch_flags=['GSTIN checksum digit is invalid'],
                notes='The last character of the GSTIN failed checksum validation. The GSTIN may be fabricated or mistyped.'
            )

        # 3. LIVE mode → call real API
        if ADAPTER_MODE == 'LIVE':
            data = self._call_live_api(gstin)
            if data is None:
                return _make_error_result(
                    self.NAME, gstin,
                    'Live API call failed. Check GSTINAPI_KEY in backend/.env or service availability.',
                    mode='LIVE'
                )
            if data.get('_not_found'):
                return VerificationResult(
                    adapter=self.NAME, verified=False, confidence=0.95,
                    entity_name=None, identifier=gstin, status='NOT_FOUND',
                    verified_at=datetime.now().isoformat(),
                    source='gstinapi.in (GSP Network)', mode='LIVE',
                    raw_fields={}, mismatch_flags=[],
                    notes='GSTIN not found on GST Network. May be invalid or recently cancelled.'
                )

            api_status = data.get('status', '')
            is_active  = api_status.lower() == 'active'
            # block_status: live API returns "Unblocked"/"Blocked", mock uses "U"/"B"
            block_status = data.get('block_status', '')
            is_blocked = block_status.lower() in ('b', 'blocked')
            mismatches = []
            if submitted_name and data.get('legal_name'):
                if not _name_match(submitted_name, data['legal_name']):
                    mismatches.append(
                        f"Name mismatch: submitted '{submitted_name}' vs GST Network '{data['legal_name']}'"
                    )

            return VerificationResult(
                adapter=self.NAME,
                verified=is_active and not is_blocked,
                confidence=0.99 if is_active else 0.95,
                entity_name=data.get('legal_name'),
                identifier=gstin,
                status=api_status.upper() if api_status else 'UNKNOWN',
                verified_at=datetime.now().isoformat(),
                source='gstinapi.in (GSP Network — live)',
                mode='LIVE',
                raw_fields=data,
                mismatch_flags=mismatches,
                notes='Blocked on GST portal.' if is_blocked else None
            )

        # 4. MOCK mode
        data = self._MOCK.get(gstin, {
            'legal_name': 'Unknown Entity',
            'status': 'Not Found',
        })
        is_active  = data.get('status', '').lower() == 'active'
        mismatches = []
        if submitted_name and data.get('legal_name') and data.get('legal_name') != 'Unknown Entity':
            if not _name_match(submitted_name, data['legal_name']):
                mismatches.append(
                    f"Name mismatch: submitted '{submitted_name}' vs GST record '{data['legal_name']}'"
                )

        return VerificationResult(
            adapter=self.NAME,
            verified=is_active,
            confidence=0.97 if is_active else 0.3,
            entity_name=data.get('legal_name'),
            identifier=gstin,
            status='ACTIVE' if is_active else 'NOT_FOUND',
            verified_at=datetime.now().isoformat(),
            source='MOCK — set GSTINAPI_KEY + GOV_ADAPTER_MODE=LIVE for real data',
            mode='MOCK',
            raw_fields=data,
            mismatch_flags=mismatches,
            notes='Demo data. Get a free key at https://gstinapi.in and set GOV_ADAPTER_MODE=LIVE.'
        )


# ═══════════════════════════════════════════════════════════════
# MCA21 Adapter  →  data.gov.in  (Open Government Data)
# Free API key: register at https://data.gov.in → Profile → API key
# Dataset: Company Master Data (MCA, 3.6M+ companies)
# ═══════════════════════════════════════════════════════════════

class MCA21Adapter:
    NAME = 'MCA21'

    _MOCK = {
        'U72200MH2009PTC195432': {
            'company_name': 'ABC TECHNOLOGIES PRIVATE LIMITED',
            'cin': 'U72200MH2009PTC195432',
            'company_status': 'Active',
            'date_of_incorporation': '12/06/2009',
            'roc_code': 'RoC-Mumbai',
            'registered_state': 'Maharashtra',
            'registered_office_address': 'Plot 45, MIDC Industrial Area, Mumbai - 400093',
            'company_category': 'Company limited by Shares',
            'company_subcategory': 'Non-govt company',
            'class_of_company': 'Private',
            'authorized_capital': '10000000',
            'paidup_capital': '7500000',
            'listing_status': 'Unlisted',
        },
        'U29130KA2007PTC087654': {
            'company_name': 'NOVA ENGINEERING SOLUTIONS PRIVATE LIMITED',
            'cin': 'U29130KA2007PTC087654',
            'company_status': 'Active',
            'date_of_incorporation': '15/11/2007',
            'roc_code': 'RoC-Bangalore',
            'registered_state': 'Karnataka',
            'registered_office_address': 'No. 78, Whitefield Industrial Area, Bangalore - 560066',
            'company_category': 'Company limited by Shares',
            'company_subcategory': 'Non-govt company',
            'class_of_company': 'Private',
            'authorized_capital': '50000000',
            'paidup_capital': '35000000',
            'listing_status': 'Unlisted',
        },
    }

    def _validate_format(self, cin: str) -> bool:
        return bool(re.match(r'^[A-Z]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$', cin))

    def _call_live_api(self, cin: str) -> Optional[dict]:
        """
        data.gov.in Open Government Data API — "RoC-wise Company Master Data" resource.
        GET https://api.data.gov.in/resource/{DATA_GOV_MCA_RESOURCE_ID}
            ?api-key=<key>&format=json&filters[CORPORATE_IDENTIFICATION_NUMBER]=<cin>

        IMPORTANT: as of this writing, data.gov.in's own resource page for this dataset
        states "The API for this resource does not exist" — i.e. there is currently no
        live public API for MCA company master data, only the human-facing captcha-gated
        search form on mca.gov.in (which this adapter used to silently hit and always
        misreport as NOT_FOUND — that was the real bug: every single CIN, valid or not,
        came back "not found" because the endpoint never returned JSON, and the code
        swallowed that failure into a false-sounding NOT_FOUND result instead of an
        honest error).

        This method now calls the correct, documented data.gov.in endpoint. If/when
        data.gov.in turns the API on for this resource, or the resource ID changes,
        this will start returning real data automatically. Until then it reports a
        distinct LIVE_UNAVAILABLE status rather than pretending the company wasn't
        found or that it was verified.
        """
        if not DATA_GOV_API_KEY:
            logger.warning("DATA_GOV_API_KEY not set — MCA live lookup skipped.")
            return None
        try:
            url = f"https://api.data.gov.in/resource/{DATA_GOV_MCA_RESOURCE_ID}"
            params = {
                'api-key': DATA_GOV_API_KEY,
                'format': 'json',
                'filters[CORPORATE_IDENTIFICATION_NUMBER]': cin,
            }
            resp = requests.get(url, params=params, timeout=REQUEST_TIMEOUT)

            if resp.status_code == 200:
                try:
                    body = resp.json()
                except Exception:
                    logger.error("data.gov.in MCA: response was not valid JSON.")
                    return {'_live_unavailable': True, 'reason': 'Non-JSON response from data.gov.in'}

                records = body.get('records') if isinstance(body, dict) else None
                if records is None:
                    # data.gov.in returns a normal 200 with an error message body when a
                    # resource has no active API — that must NOT be read as "not found".
                    logger.error(f"data.gov.in MCA: unexpected response shape: {str(body)[:200]}")
                    return {'_live_unavailable': True, 'reason': body.get('message') if isinstance(body, dict) else 'Unexpected response'}

                if not records:
                    return {'_not_found': True}

                rec = records[0]
                return {
                    'company_name':          rec.get('COMPANY_NAME', ''),
                    'company_status':        rec.get('COMPANY_STATUS', ''),
                    'date_of_incorporation': rec.get('DATE_OF_REGISTRATION', ''),
                    'roc_code':              rec.get('REGISTRAR_OF_COMPANIES', ''),
                    'registered_state':      rec.get('REGISTERED_STATE', ''),
                    'class_of_company':      rec.get('COMPANY_CLASS', ''),
                    'authorized_capital':    rec.get('AUTHORIZED_CAPITAL', ''),
                    'paidup_capital':        rec.get('PAID_UP_CAPITAL', ''),
                    'cin':                   cin,
                }

            elif resp.status_code in (401, 403):
                logger.error(f"data.gov.in MCA: auth rejected ({resp.status_code}). Check DATA_GOV_API_KEY.")
                return None
            elif resp.status_code == 404:
                return {'_live_unavailable': True, 'reason': 'Resource has no active API on data.gov.in (HTTP 404)'}
            else:
                logger.error(f"data.gov.in MCA returned {resp.status_code}: {resp.text[:200]}")
                return {'_live_unavailable': True, 'reason': f'HTTP {resp.status_code} from data.gov.in'}

        except requests.exceptions.Timeout:
            logger.error("data.gov.in MCA request timed out.")
            return None
        except Exception as e:
            logger.error(f"data.gov.in MCA error: {e}")
            return None

    def verify(self, cin: str, submitted_name: str = None) -> VerificationResult:
        cin = (cin or '').strip().upper()

        if not self._validate_format(cin):
            return VerificationResult(
                adapter=self.NAME, verified=False, confidence=0.0,
                entity_name=None, identifier=cin, status='INVALID_FORMAT',
                verified_at=datetime.now().isoformat(),
                source='CIN Format Validator', mode=ADAPTER_MODE,
                raw_fields={}, mismatch_flags=['CIN format is invalid'],
                notes='CIN must be 21 characters: L/U + 5 digits + 2 letters + 4 digits + 3 letters + 6 digits.'
            )

        # LIVE mode → data.gov.in
        if ADAPTER_MODE == 'LIVE':
            data = self._call_live_api(cin)
            if data is None:
                return _make_error_result(
                    self.NAME, cin,
                    'Live API call failed. Check DATA_GOV_API_KEY in backend/.env.',
                    mode='LIVE'
                )
            if data.get('_live_unavailable'):
                # The live check itself could not run (no active API, bad response shape,
                # etc.) — this must NEVER be reported as NOT_FOUND, since that would wrongly
                # imply the company doesn't exist. It's an unresolved check, not a negative.
                return _make_error_result(
                    self.NAME, cin,
                    'MCA live lookup is currently unavailable: ' + str(data.get('reason', 'unknown reason')) +
                    '. As of now, data.gov.in has not published a working API for the Company '
                    'Master Data resource, so this cannot be confirmed automatically — verify '
                    'manually at mca.gov.in (View Company Master Data).',
                    mode='LIVE'
                )

            if data.get('_not_found'):
                return VerificationResult(
                    adapter=self.NAME, verified=False, confidence=0.95,
                    entity_name=None, identifier=cin, status='NOT_FOUND',
                    verified_at=datetime.now().isoformat(),
                    source='MCA Company Master Data (data.gov.in)', mode='LIVE',
                    raw_fields={}, mismatch_flags=[],
                    notes='CIN not found in MCA Company Master Data on data.gov.in.'
                )

            company_status = data.get('company_status', data.get('company_status_(for_efiling)', ''))
            is_active = 'active' in company_status.lower() if company_status else False
            company_name = data.get('company_name', '')
            mismatches = []
            if submitted_name and company_name:
                if not _name_match(submitted_name, company_name):
                    mismatches.append(
                        f"Name mismatch: submitted '{submitted_name}' vs MCA '{company_name}'"
                    )

            return VerificationResult(
                adapter=self.NAME,
                verified=is_active,
                confidence=0.98 if is_active else 0.9,
                entity_name=company_name or None,
                identifier=cin,
                status=company_status.upper() if company_status else 'UNKNOWN',
                verified_at=datetime.now().isoformat(),
                source='MCA Company Master Data (data.gov.in — live)',
                mode='LIVE',
                raw_fields=data,
                mismatch_flags=mismatches,
                notes=None
            )

        # MOCK mode
        data = self._MOCK.get(cin, {'company_name': 'Unknown Company', 'company_status': 'Not Found'})
        is_active  = data.get('company_status', '').lower() == 'active'
        mismatches = []
        if submitted_name and data.get('company_name') and data.get('company_name') != 'Unknown Company':
            if not _name_match(submitted_name, data['company_name']):
                mismatches.append(
                    f"Name mismatch: submitted '{submitted_name}' vs MCA '{data['company_name']}'"
                )

        return VerificationResult(
            adapter=self.NAME,
            verified=is_active,
            confidence=0.96 if is_active else 0.0,
            entity_name=data.get('company_name'),
            identifier=cin,
            status='ACTIVE' if is_active else 'NOT_FOUND',
            verified_at=datetime.now().isoformat(),
            source='MOCK — set DATA_GOV_API_KEY + GOV_ADAPTER_MODE=LIVE for real data',
            mode='MOCK',
            raw_fields=data,
            mismatch_flags=mismatches,
            notes='Demo data. Set GOV_ADAPTER_MODE=LIVE to query MCA V3 portal.'
        )


# ═══════════════════════════════════════════════════════════════
# PAN Adapter  →  sandbox.co.in (Quicko) — real ITD database
# Sign up at https://sandbox.co.in — email only, no bank/company needed
# Endpoint: POST https://api.sandbox.co.in/kyc/pan/verify
# Auth: Authorization: Bearer <SANDBOX_API_KEY>
#       x-api-key: <SANDBOX_API_KEY>
# ═══════════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════════
# PAN Adapter — three-tier cascade
#
#  Tier 1: Protean eGov OPV API (ITD-authorised, official government)
#           POST https://opvservice.proteantech.in/pan/verifyapi
#           Requires PROTEAN_OPV_TOKEN + PROTEAN_OPV_SUBAGENTID
#           Register at: https://tinpan.proteantech.in
#           Eligible entities: government depts, TDS deductors, banks, etc.
#           Response: panStatus, panHolderTitle, nameMatchStatus,
#                     aadhaarPanLinkStatus, gender
#
#  Tier 2: Didit.me Database Validation (calls ITD DB, $0.84/conclusive)
#           POST https://verification.didit.me/v3/database-validation/
#           Requires DIDIT_API_KEY  (sign up at didit.me, 500 free/month)
#           Response: match_type, validation.date_of_birth,
#                     validation.identification_number
#
#  Tier 3: sandbox.co.in / Quicko (real ITD DB via KYC API, free signup)
#           POST https://api.sandbox.co.in/kyc/pan/verify
#           Requires SANDBOX_API_KEY + SANDBOX_API_SECRET
#
#  Offline: Format + structural checksum only (no live check)
#
# Source: https://tinpan.proteantech.in  (Protean OPV, ITD-authorised)
# Source: https://docs.didit.me/api-reference/database-validation/india/pan-permanent-account-number
# Source: https://sandbox.co.in (Quicko KYC)
# ═══════════════════════════════════════════════════════════════

class PANAdapter:
    NAME = 'PAN'

    _ENTITY_TYPES = {
        'P': 'Individual', 'C': 'Company',    'H': 'HUF',
        'F': 'Firm',       'A': 'AOP',        'B': 'BOI',
        'G': 'Government', 'J': 'AJP',        'L': 'LLP',
        'T': 'Trust',
    }

    def _validate_format(self, pan: str) -> tuple:
        if not re.match(r'^[A-Z]{5}[0-9]{4}[A-Z]$', pan):
            return False, 'PAN must be 10 characters: 5 letters + 4 digits + 1 letter.'
        if pan[3] not in self._ENTITY_TYPES:
            return False, f"4th character '{pan[3]}' is not a valid PAN entity type."
        return True, 'OK'

    # ── Tier 0a: Surepass ─────────────────────────────────────────────────
    def _call_surepass(self, pan: str) -> Optional[dict]:
        """
        Surepass PAN Comprehensive API — fastest live option, free signup.

        Sign up at https://app.surepass.io/register (email only, instant token)
        Dashboard → API Keys → copy the Bearer token → set SUREPASS_TOKEN in .env

        POST https://kyc-api.surepass.io/api/v1/pan/pan-comprehensive
        Header: Authorization: Bearer <SUREPASS_TOKEN>
        Body:   { "id_number": "ABCDE1234F" }

        Response (success):
          {
            "data": {
              "pan_number":      "ABCDE1234F",
              "registered_name": "ABC TECHNOLOGIES PVT LTD",
              "valid":           true,
              "type":            "COMPANY",
              "aadhaar_linked":  true | false | null,
              "gender":          "M" | "F" | null
            },
            "status_code": 200,
            "success": true,
            "message": "Success",
            "message_code": "success"
          }

        Error responses:
          401 invalid_token — token wrong or expired
          404 id_not_found  — PAN not in ITD database
          422 invalid_id    — PAN format invalid
        """
        if not SUREPASS_TOKEN:
            return None

        try:
            resp = requests.post(
                'https://kyc-api.surepass.io/api/v1/pan/pan-comprehensive',
                json={'id_number': pan},
                headers={
                    'Authorization': f'Bearer {SUREPASS_TOKEN}',
                    'Content-Type':  'application/json',
                },
                timeout=REQUEST_TIMEOUT,
            )

            if resp.status_code == 200:
                body = resp.json()
                if body.get('success'):
                    return {'_source': 'surepass', **body}
                # success=false with 200 means not found / inactive
                return {'_source': 'surepass', '_not_found': True, **body}

            elif resp.status_code == 401:
                logger.error(
                    'Surepass: SUREPASS_TOKEN is invalid or expired. '
                    'Refresh at https://app.surepass.io → Dashboard → API Keys.'
                )
                return None
            elif resp.status_code == 404:
                try:
                    return {'_source': 'surepass', '_not_found': True, **resp.json()}
                except Exception:
                    return {'_source': 'surepass', '_not_found': True}
            elif resp.status_code == 422:
                logger.warning(f'Surepass: PAN format rejected — {resp.text[:150]}')
                return None
            else:
                logger.error(f'Surepass returned {resp.status_code}: {resp.text[:200]}')
                return None

        except requests.exceptions.Timeout:
            logger.error('Surepass request timed out.')
            return None
        except Exception as e:
            logger.error(f'Surepass error: {e}')
            return None

    def _parse_surepass_result(
        self, data: dict, pan: str, submitted_name: str
    ) -> VerificationResult:
        """Normalise a Surepass response into a VerificationResult."""
        if data.get('_not_found'):
            msg_code = data.get('message_code', '')
            return VerificationResult(
                adapter=self.NAME, verified=False, confidence=0.95,
                entity_name=None, identifier=pan, status='NOT_FOUND',
                verified_at=datetime.now().isoformat(),
                source='Surepass — ITD database (live)',
                mode='LIVE', raw_fields=data,
                mismatch_flags=['PAN not found in ITD database — may be invalid or recently deactivated'],
                notes=data.get('message'),
            )

        inner   = data.get('data') or {}
        is_valid = inner.get('valid', False)
        itd_name = inner.get('registered_name') or inner.get('name')
        pan_type = inner.get('type', '')          # INDIVIDUAL | COMPANY | etc.
        aadhaar  = inner.get('aadhaar_linked')    # True | False | None

        mismatches = []
        if submitted_name and itd_name:
            def _norm(s):
                return re.sub(r'\s+', ' ', s.strip().upper()
                    .replace('PVT. LTD.', 'PRIVATE LIMITED')
                    .replace('PVT LTD', 'PRIVATE LIMITED')
                    .replace('LTD.', 'LIMITED'))
            if _norm(submitted_name) != _norm(itd_name):
                mismatches.append(
                    f"Name mismatch: submitted '{submitted_name}' vs ITD record '{itd_name}'"
                )

        notes_parts = []
        if aadhaar is True:
            notes_parts.append('Aadhaar linked to PAN.')
        elif aadhaar is False:
            notes_parts.append('Aadhaar NOT linked to PAN.')
        if pan_type:
            notes_parts.append(f'PAN type: {pan_type}.')

        return VerificationResult(
            adapter=self.NAME,
            verified=is_valid and not mismatches,
            confidence=0.98 if is_valid else 0.95,
            entity_name=itd_name,
            identifier=pan,
            status='VALID' if is_valid else 'INVALID',
            verified_at=datetime.now().isoformat(),
            source='Surepass — ITD database (live)',
            mode='LIVE',
            raw_fields=data,
            mismatch_flags=mismatches,
            notes=' '.join(notes_parts) if notes_parts else None,
        )

    # ── Tier 0b: API Sathi ────────────────────────────────────────────────
    def _call_apisathi(self, pan: str, submitted_name: str = None) -> Optional[dict]:
        """
        API Sathi PAN Verification — Tier 0 (fastest, activate with APISATHI_API_KEY).

        POST https://apisathi.com/api/v1/pan-verify
        Header: x-api-key: <APISATHI_API_KEY>
        Body:   { "pan": "ABCDE1234F", "name": "Entity Name" }

        Discovered response shape (from live probing):
          Success 200:
            { "status": "VALID" | "INVALID",
              "pan": "ABCDE1234F",
              "name": "...",          # name from ITD database
              "name_match": true | false,
              "message": "..." }
          Error 400/401/403: { "message": "..." }

        Auth note: header must be exactly 'x-api-key' (case-sensitive on their server).
        The test key test_W1I8t4heiMUdQ8t1wFz4FsmhWKmAeWRo fails with
        "invalid input syntax for type uuid" — their DB expects UUID format.
        Replace with the production key they issue after account activation.
        """
        if not APISATHI_API_KEY:
            return None

        try:
            payload = {'pan': pan}
            if submitted_name:
                payload['name'] = submitted_name.strip()

            resp = requests.post(
                'https://apisathi.com/api/v1/pan-verify',
                json=payload,
                headers={
                    'x-api-key':    APISATHI_API_KEY,
                    'Content-Type': 'application/json',
                },
                timeout=REQUEST_TIMEOUT,
            )

            if resp.status_code == 200:
                return {'_source': 'apisathi', **resp.json()}
            elif resp.status_code == 401:
                logger.error('API Sathi: APISATHI_API_KEY is invalid or expired.')
                return None
            elif resp.status_code == 403:
                logger.error('API Sathi: Access forbidden — check plan/quota at apisathi.com.')
                return None
            elif resp.status_code == 500:
                try:
                    err = resp.json().get('message', '')
                except Exception:
                    err = resp.text[:200]
                if 'uuid' in err.lower():
                    logger.error(
                        'API Sathi: Key format rejected — server expects a UUID-format key. '
                        'The test key test_W1I8t4... is not yet provisioned. '
                        'Contact API Sathi support to activate your production key.'
                    )
                else:
                    logger.error(f'API Sathi 500: {err}')
                return None
            else:
                logger.error(f'API Sathi returned {resp.status_code}: {resp.text[:200]}')
                return None

        except requests.exceptions.Timeout:
            logger.error('API Sathi request timed out.')
            return None
        except Exception as e:
            logger.error(f'API Sathi error: {e}')
            return None

    def _parse_apisathi_result(
        self, data: dict, pan: str, submitted_name: str
    ) -> VerificationResult:
        """Normalise an API Sathi response into a VerificationResult."""
        status_raw   = (data.get('status') or '').upper()
        is_active    = status_raw in ('VALID', 'ACTIVE', 'SUCCESS', 'EXISTS')
        itd_name     = data.get('name') or data.get('full_name') or data.get('pan_name')
        name_matched = data.get('name_match')    # True | False | None
        message      = data.get('message', '')

        mismatches = []
        if name_matched is False and submitted_name and itd_name:
            mismatches.append(
                f"Name mismatch: submitted '{submitted_name}' vs ITD record '{itd_name}'"
            )
        if not is_active and message:
            mismatches.append(message)

        notes = message if message and is_active else None

        return VerificationResult(
            adapter=self.NAME,
            verified=is_active and not mismatches,
            confidence=0.97 if is_active else 0.95,
            entity_name=itd_name,
            identifier=pan,
            status=status_raw if status_raw else 'UNKNOWN',
            verified_at=datetime.now().isoformat(),
            source='API Sathi — PAN Verification (ITD database — live)',
            mode='LIVE',
            raw_fields=data,
            mismatch_flags=mismatches,
            notes=notes,
        )

    # ── Tier 1: Protean eGov OPV ──────────────────────────────────────────
    def _call_protean_opv(self, pan: str, submitted_name: str = None, dob: str = None) -> Optional[dict]:
        """
        Protean eGov Online PAN Verification API v1.2 (ITD-authorised).

        POST https://opvservice.proteantech.in/pan/verifyapi
        Content-Type: application/json
        Authorization: Bearer <PROTEAN_OPV_TOKEN>

        Request body:
          {
            "panNumber":    "ABCDE1234F",
            "fullName":     "ABC TECHNOLOGIES PVT LTD",   // optional, for name match
            "dob":          "15/06/2009",                 // optional DD/MM/YYYY
            "subAgentId":   "ABCDE12345"
          }

        Response:
          {
            "panStatus":           "VALID_EXISTING",
            "panHolderTitle":      "M/S",
            "nameMatchStatus":     "Y",    // Y | N
            "dobMatchStatus":      "Y",    // Y | N (if dob sent)
            "aadhaarPanLinkStatus":"OPERATIVE",
            "gender":              "M"
          }

        panStatus codes:
          VALID_EXISTING         — PAN is active and valid
          VALID_EXISTING_EVENT   — PAN valid but has a lifecycle event
          DELETED_PAN            — PAN was deleted
          DEACTIVATED_PAN        — PAN deactivated
          FAKE_PAN               — Flagged as fraudulent
          NOTFOUND_IN_ITD        — Not on Income Tax database
        """
        if not PROTEAN_OPV_TOKEN or not PROTEAN_OPV_SUBAGENTID:
            return None

        try:
            url = 'https://opvservice.proteantech.in/pan/verifyapi'
            headers = {
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {PROTEAN_OPV_TOKEN}',
            }
            payload = {
                'panNumber':  pan,
                'subAgentId': PROTEAN_OPV_SUBAGENTID,
            }
            if submitted_name:
                payload['fullName'] = submitted_name.strip().upper()
            if dob:
                payload['dob'] = dob  # DD/MM/YYYY format

            resp = requests.post(url, json=payload, headers=headers, timeout=REQUEST_TIMEOUT)

            if resp.status_code == 200:
                data = resp.json()
                return {'_source': 'protean_opv', **data}
            elif resp.status_code == 401:
                logger.error('Protean OPV: PROTEAN_OPV_TOKEN is invalid or expired. Renew at tinpan.proteantech.in.')
                return None
            elif resp.status_code == 403:
                logger.error('Protean OPV: SubAgentId not authorised. Check PROTEAN_OPV_SUBAGENTID.')
                return None
            else:
                logger.error(f'Protean OPV returned {resp.status_code}: {resp.text[:200]}')
                return None

        except requests.exceptions.Timeout:
            logger.error('Protean OPV request timed out.')
            return None
        except Exception as e:
            logger.error(f'Protean OPV error: {e}')
            return None

    def _parse_protean_result(self, data: dict, pan: str, submitted_name: str) -> VerificationResult:
        """Normalise a Protean OPV response into a VerificationResult."""
        pan_status = (data.get('panStatus') or '').upper()

        is_active = pan_status in ('VALID_EXISTING', 'VALID_EXISTING_EVENT')
        is_fake   = pan_status == 'FAKE_PAN'

        mismatches = []
        if data.get('nameMatchStatus', '').upper() == 'N' and submitted_name:
            mismatches.append(
                f"Name mismatch: submitted '{submitted_name}' — ITD record does not match."
            )
        if data.get('dobMatchStatus', '').upper() == 'N':
            mismatches.append('Date of birth mismatch against ITD record.')
        if is_fake:
            mismatches.append('PAN is flagged as FAKE by Income Tax Department.')

        aadhaar_status = data.get('aadhaarPanLinkStatus', '')
        notes_parts = []
        if aadhaar_status:
            notes_parts.append(f'Aadhaar-PAN link: {aadhaar_status}.')
        if pan_status == 'VALID_EXISTING_EVENT':
            notes_parts.append('PAN has a lifecycle event recorded — officer review recommended.')
        if pan_status == 'DEACTIVATED_PAN':
            notes_parts.append('PAN has been deactivated by ITD.')

        # Entity type from holder title
        title = data.get('panHolderTitle', '')
        entity_name = None  # Protean OPV v1.2 does not return full legal name in response

        return VerificationResult(
            adapter=self.NAME,
            verified=is_active and not mismatches,
            confidence=0.99 if is_active else (0.99 if pan_status == 'NOTFOUND_IN_ITD' else 0.95),
            entity_name=entity_name,
            identifier=pan,
            status=pan_status if pan_status else 'UNKNOWN',
            verified_at=datetime.now().isoformat(),
            source='Protean eGov OPV API (ITD-authorised — live)',
            mode='LIVE',
            raw_fields=data,
            mismatch_flags=mismatches,
            notes=' '.join(notes_parts) if notes_parts else None,
        )

    # ── Tier 2: Didit.me ──────────────────────────────────────────────────
    def _call_didit(self, pan: str, submitted_name: str = None, dob: str = None) -> Optional[dict]:
        """
        Didit.me India PAN Database Validation.
        Calls the Income Tax Department database directly.

        POST https://verification.didit.me/v3/database-validation/
        Header: x-api-key: <DIDIT_API_KEY>
        Body (multipart/form-data):
          issuing_state = IND
          services      = ind_pan_permanent_account_number
          consent       = true
          pan           = ABCDE1234F
          full_name     = John Doe            (required by ITD for name match)
          date_of_birth = 1990-01-01          (required by ITD for DOB match)

        Response:
          {
            "status": "Approved" | "Declined",
            "match_type": "full_match" | "partial_match" | "no_match",
            "validations": [{
              "outcome_code": "MATCH" | "NO_MATCH" | "NOT_FOUND",
              "service_id": "ind_pan_permanent_account_number",
              "source_data": { "date_of_birth": "...", "identification_number": "..." },
              "validation": { "date_of_birth": "full_match", "identification_number": "full_match" }
            }]
          }

        Pricing: $0.84 per conclusive result. 500 free/month.
        Sign up: https://didit.me
        Source: https://docs.didit.me/api-reference/database-validation/india/pan-permanent-account-number
        """
        if not DIDIT_API_KEY:
            return None

        try:
            url = 'https://verification.didit.me/v3/database-validation/'
            headers = {'x-api-key': DIDIT_API_KEY}

            # Didit expects multipart/form-data
            form_data = {
                'issuing_state': 'IND',
                'services':      'ind_pan_permanent_account_number',
                'consent':       'true',
                'pan':           pan,
            }
            if submitted_name:
                form_data['full_name'] = submitted_name.strip()
            if dob:
                # Didit expects YYYY-MM-DD
                form_data['date_of_birth'] = dob

            resp = requests.post(url, data=form_data, headers=headers, timeout=REQUEST_TIMEOUT)

            if resp.status_code == 200:
                body = resp.json()
                return {'_source': 'didit', **body}
            elif resp.status_code == 401:
                logger.error('Didit.me: DIDIT_API_KEY invalid. Check your key at didit.me dashboard.')
                return None
            elif resp.status_code == 402:
                logger.error('Didit.me: Account balance exhausted. Top up at didit.me.')
                return None
            else:
                logger.error(f'Didit.me returned {resp.status_code}: {resp.text[:200]}')
                return None

        except requests.exceptions.Timeout:
            logger.error('Didit.me PAN request timed out.')
            return None
        except Exception as e:
            logger.error(f'Didit.me PAN error: {e}')
            return None

    def _parse_didit_result(self, data: dict, pan: str, submitted_name: str) -> VerificationResult:
        """Normalise a Didit.me response into a VerificationResult."""
        overall_status = (data.get('status') or '').lower()  # "approved" | "declined"
        match_type     = (data.get('match_type') or '').lower()  # "full_match" | "partial_match" | "no_match"

        validations = data.get('validations') or []
        v = validations[0] if validations else {}
        outcome_code = (v.get('outcome_code') or '').upper()  # MATCH | NO_MATCH | NOT_FOUND
        source_data  = v.get('source_data') or {}
        field_vals   = v.get('validation') or {}

        is_verified = overall_status == 'approved' and outcome_code == 'MATCH'
        is_not_found = outcome_code == 'NOT_FOUND'

        mismatches = []
        if field_vals.get('identification_number') not in ('full_match', None, '') and \
                field_vals.get('identification_number') != 'full_match':
            mismatches.append(f"PAN number mismatch in ITD database.")
        if field_vals.get('date_of_birth') == 'no_match':
            mismatches.append('Date of birth does not match ITD record.')
        if match_type == 'no_match' and not is_not_found:
            mismatches.append('Submitted details do not match ITD PAN record.')

        notes = None
        if is_not_found:
            notes = 'PAN not found in ITD database.'
        elif match_type == 'partial_match':
            notes = 'Partial match — some fields differ from ITD record. Officer review recommended.'

        return VerificationResult(
            adapter=self.NAME,
            verified=is_verified and not mismatches,
            confidence=0.98 if is_verified else (0.95 if is_not_found else 0.80),
            entity_name=None,   # Didit does not return full name from ITD
            identifier=pan,
            status=outcome_code if outcome_code else overall_status.upper(),
            verified_at=datetime.now().isoformat(),
            source='Didit.me — India PAN (ITD database — live)',
            mode='LIVE',
            raw_fields=data,
            mismatch_flags=mismatches,
            notes=notes,
        )

    # ── Tier 3: sandbox.co.in / Quicko ───────────────────────────────────
    def _get_jwt_token(self) -> str:
        """
        Step 1 — Get JWT from sandbox.co.in.
        POST https://api.sandbox.co.in/authenticate
        Headers: x-api-key, x-api-secret
        Returns JWT string (valid 24h). Pass as Authorization WITHOUT Bearer prefix.
        """
        try:
            resp = requests.post(
                'https://api.sandbox.co.in/authenticate',
                headers={
                    'x-api-key':     SANDBOX_API_KEY,
                    'x-api-secret':  SANDBOX_API_SECRET,
                    'x-api-version': '1.0',
                },
                timeout=REQUEST_TIMEOUT
            )
            if resp.status_code == 200:
                data = resp.json()
                token = (data.get('data') or {}).get('access_token') or data.get('access_token')
                return token
            logger.error(f'sandbox.co.in auth failed {resp.status_code}: {resp.text[:200]}')
            return None
        except Exception as e:
            logger.error(f'sandbox.co.in auth error: {e}')
            return None

    def _call_sandbox(self, pan: str, submitted_name: str = None) -> Optional[dict]:
        """
        sandbox.co.in — only used when KYC marketplace plan is subscribed.
        Returns None (fall through) when KYC is not subscribed, so the cascade
        reaches the free offline validator instead of returning FORMAT_VALID_ONLY.
        """
        if not SANDBOX_API_KEY or not SANDBOX_API_SECRET:
            return None

        token = self._get_jwt_token()
        if not token:
            return None

        try:
            headers = {
                'Authorization':  token,
                'x-api-key':      SANDBOX_API_KEY,
                'x-api-version':  '1.0',
                'Content-Type':   'application/json',
                'x-accept-cache': 'true',
            }
            payload = {
                '@entity':         'in.co.sandbox.kyc.pan_verification.request',
                'pan':             pan,
                'name_as_per_pan': submitted_name or 'Unknown',
                'date_of_birth':   '01/01/1990',
                'consent':         'Y',
                'reason':          'Vendor verification for government procurement PARAKH AI',
            }
            resp = requests.post(
                'https://api.sandbox.co.in/kyc/pan/verify',
                json=payload, headers=headers, timeout=REQUEST_TIMEOUT
            )

            if resp.status_code == 200:
                data = resp.json()
                inner = data.get('data', data)
                if isinstance(inner, list) and inner:
                    return {'_source': 'sandbox', **inner[0]}
                return {'_source': 'sandbox', **inner}
            elif resp.status_code == 403:
                logger.warning('sandbox.co.in 403 — KYC not subscribed. Falling through to offline validator.')
                return None  # fall through to free offline validator
            elif resp.status_code == 401:
                logger.error('sandbox.co.in: JWT rejected.')
                return None
            else:
                logger.error(f'sandbox.co.in {resp.status_code}: {resp.text[:200]}')
                return None

        except requests.exceptions.Timeout:
            logger.error('sandbox.co.in timed out.')
            return None
        except Exception as e:
            logger.error(f'sandbox.co.in error: {e}')
            return None

    def _parse_sandbox_result(self, data: dict, pan: str, submitted_name: str) -> VerificationResult:
        """Normalise a sandbox.co.in response into a VerificationResult."""
        if data.get('_needs_subscription'):
            # KYC not subscribed — PAN format is valid but ITD was never queried.
            # This is NOT a mismatch and NOT a failure — it is an unverified state.
            # We surface it as FORMAT_VALID_ONLY with zero mismatch_flags so the
            # overall status is not poisoned by an infrastructure gap.
            return VerificationResult(
                adapter=self.NAME, verified=False, confidence=0.4,
                entity_name=None, identifier=pan,
                status='FORMAT_VALID_ONLY',
                verified_at=datetime.now().isoformat(),
                source='PAN format check only — ITD lookup NOT performed (sandbox.co.in KYC not subscribed)',
                mode='LIVE',
                raw_fields={'entity_type': self._ENTITY_TYPES.get(pan[3], 'Unknown')},
                mismatch_flags=[],   # ← not a mismatch; subscription gap only
                notes=(
                    'PAN format is structurally valid. Live ITD verification is pending — '
                    'activate the KYC product at console.sandbox.co.in/marketplace, '
                    'or set APISATHI_API_KEY in backend/.env for immediate live check.'
                ),
            )

        if data.get('_error'):
            return VerificationResult(
                adapter=self.NAME, verified=False, confidence=0.8,
                entity_name=None, identifier=pan, status='INVALID',
                verified_at=datetime.now().isoformat(),
                source='sandbox.co.in (ITD — live)', mode='LIVE',
                raw_fields=data,
                mismatch_flags=[data.get('message', 'PAN validation failed')],
                notes=data.get('message'),
            )

        pan_status   = (data.get('status') or '').lower()
        is_active    = pan_status == 'valid'
        api_name     = data.get('name_as_per_pan', '')
        aadhaar_link = data.get('aadhaar_seeding_status', 'na')
        remarks      = data.get('remarks')
        name_match   = data.get('name_as_per_pan_match', None)

        mismatches = []
        if remarks and remarks not in (None, 'null', ''):
            mismatches.append(f'PAN remark: {remarks}')
        if name_match is False:
            mismatches.append(
                f"Name mismatch: submitted '{submitted_name}' vs ITD record '{api_name}'"
            )

        notes_parts = []
        if aadhaar_link == 'y':
            notes_parts.append('Aadhaar linked to PAN.')
        elif aadhaar_link == 'n':
            notes_parts.append('Aadhaar NOT linked to PAN.')
        if remarks:
            notes_parts.append(f'Remark: {remarks}')

        return VerificationResult(
            adapter=self.NAME,
            verified=is_active and not mismatches,
            confidence=0.99 if is_active else 0.95,
            entity_name=api_name or submitted_name,
            identifier=pan,
            status=pan_status.upper() if pan_status else 'UNKNOWN',
            verified_at=datetime.now().isoformat(),
            source='sandbox.co.in (ITD database — live)',
            mode='LIVE',
            raw_fields=data,
            mismatch_flags=mismatches,
            notes=' '.join(notes_parts) if notes_parts else None,
        )

    # ── Main verify() entry point ─────────────────────────────────────────
    def verify(self, pan: str, submitted_name: str = None, dob: str = None) -> VerificationResult:
        """
        Verify a PAN number using a three-tier cascade:
          Tier 1 → Protean eGov OPV  (ITD-authorised)
          Tier 2 → Didit.me           (ITD database via third-party, $0.84/query)
          Tier 3 → sandbox.co.in      (free KYC plan, email signup)
          Fallback → offline format validation only

        In LIVE mode, the adapter tries each tier in order and uses the first
        one that returns a conclusive response.
        In MOCK mode, returns realistic demo data without hitting any API.
        """
        pan = (pan or '').strip().upper()

        # ── 1. Format check (offline, all modes) ────────────────────────
        is_valid, reason = self._validate_format(pan)
        if not is_valid:
            return VerificationResult(
                adapter=self.NAME, verified=False, confidence=0.0,
                entity_name=None, identifier=pan, status='INVALID_FORMAT',
                verified_at=datetime.now().isoformat(),
                source='PAN Format Validator', mode=ADAPTER_MODE,
                raw_fields={}, mismatch_flags=['PAN format is invalid'],
                notes=reason,
            )

        entity_char = pan[3]
        entity_type = self._ENTITY_TYPES.get(entity_char, 'Unknown')

        # ── 2. LIVE mode — cascade through five tiers ───────────────────
        if ADAPTER_MODE == 'LIVE':

            # Tier 0a: Surepass (free signup, token ready in 2 min — https://app.surepass.io)
            if SUREPASS_TOKEN:
                data = self._call_surepass(pan)
                if data is not None:
                    result = self._parse_surepass_result(data, pan, submitted_name)
                    result.notes = ((result.notes or '') + ' [via Surepass — ITD database]').strip()
                    return result
                logger.warning('Surepass call failed — falling back to API Sathi')

            # Tier 0b: API Sathi (activate with APISATHI_API_KEY once UUID key is provisioned)
            if APISATHI_API_KEY:
                data = self._call_apisathi(pan, submitted_name)
                if data is not None:
                    result = self._parse_apisathi_result(data, pan, submitted_name)
                    result.notes = (result.notes or '') + ' [via API Sathi — ITD database]'
                    return result
                # API Sathi failed — fall through to Tier 1
                logger.warning('API Sathi call failed — falling back to Protean OPV')

            # Tier 1: Protean eGov OPV (most authoritative — ITD-authorised)
            if PROTEAN_OPV_TOKEN and PROTEAN_OPV_SUBAGENTID:
                data = self._call_protean_opv(pan, submitted_name, dob)
                if data is not None:
                    result = self._parse_protean_result(data, pan, submitted_name)
                    result.notes = (result.notes or '') + ' [via Protean eGov OPV — ITD authorised]'
                    return result
                # Protean failed (network/auth) — fall through to Tier 2
                logger.warning('Protean OPV call failed — falling back to Didit.me')

            # Tier 2: Didit.me (ITD database, $0.84/conclusive, 500 free/month)
            if DIDIT_API_KEY:
                data = self._call_didit(pan, submitted_name, dob)
                if data is not None:
                    result = self._parse_didit_result(data, pan, submitted_name)
                    result.notes = (result.notes or '') + ' [via Didit.me — ITD database]'
                    return result
                # Didit failed — fall through to Tier 3
                logger.warning('Didit.me call failed — falling back to sandbox.co.in')

            # Tier 3: sandbox.co.in / Quicko (real ITD DB, free KYC plan)
            if SANDBOX_API_KEY and SANDBOX_API_SECRET:
                data = self._call_sandbox(pan, submitted_name)
                if data is not None:
                    return self._parse_sandbox_result(data, pan, submitted_name)
                logger.warning('sandbox.co.in call failed — falling through to offline validator')

            # All configured live tiers returned None (failed / unsubscribed / UUID bug)
            # → fall through to the free offline structural validator below.
            # Do NOT return an error here — the PAN format already passed; we just
            # could not reach a live ITD database. Treat it as PENDING, not ERROR.

        # ── 3. Local deep validation — free, zero auth, zero network ─────────────
        # Replicates the same PAN structural validation as mcp-india-stack's
        # validate_pan(), inlined here to avoid import-time conflicts in Flask.
        # Checks: format regex (done above) + entity type decode + name initial.

        structural_mismatches = []
        notes_parts = []

        # Series (first 3 chars) + entity char + name initial (5th char)
        series      = pan[:3]
        name_init   = pan[4]

        # Entity type label
        etype_label = self._ENTITY_TYPES.get(entity_char, 'Unknown')
        notes_parts.append(f'Entity type: {etype_label}.')
        notes_parts.append(f'Series: {series}.')

        # For entity types where 5th char encodes first letter of registrant name
        if entity_char in ('C', 'F', 'H', 'L', 'A', 'B', 'T') and submitted_name:
            actual_init = re.sub(r'[^A-Z]', '', submitted_name.strip().upper())
            if actual_init and actual_init[0] != name_init:
                structural_mismatches.append(
                    f"Name initial mismatch: submitted name '{submitted_name}' starts "
                    f"with '{actual_init[0]}' but PAN 5th character encodes '{name_init}'"
                )

        notes_parts.append(
            'Structural validation passed (offline, free, zero auth). '
            'Live ITD database check pending — subscribe sandbox.co.in KYC or '
            'top up Didit (didit.me) account to enable live ITD confirmation.'
        )

        return VerificationResult(
            adapter=self.NAME,
            verified=False,       # structural only — not ITD-database confirmed
            confidence=0.65,
            entity_name=submitted_name,
            identifier=pan,
            status='STRUCTURALLY_VALID' if not structural_mismatches else 'STRUCTURAL_ISSUES',
            verified_at=datetime.now().isoformat(),
            source='PAN offline structural validator (free, zero auth)',
            mode='OFFLINE',
            raw_fields={
                'entity_type':  etype_label,
                'entity_code':  entity_char,
                'name_initial': name_init,
                'series':       series,
                'pan':          pan,
            },
            mismatch_flags=structural_mismatches,
            notes=' '.join(notes_parts),
        )


# ═══════════════════════════════════════════════════════════════
# Udyam Adapter  →  Format validation
# Official API requires MSME Ministry authorization (no free endpoint)
# Public portal: https://udyamregistration.gov.in/udyam_verify.aspx
# ═══════════════════════════════════════════════════════════════

class UdyamAdapter:
    NAME = 'UDYAM'

    _MOCK = {
        'UDYAM-MH-12-0034567': {
            'enterprise_name': 'ABC Technologies Pvt Ltd',
            'category': 'Small',
            'nic_code': '2660',
            'registered_state': 'Maharashtra',
            'status': 'ACTIVE',
            'registration_date': '2020-07-10',
        },
        'UDYAM-KA-08-0091234': {
            'enterprise_name': 'Nova Engineering Solutions Pvt Ltd',
            'category': 'Medium',
            'nic_code': '2620',
            'registered_state': 'Karnataka',
            'status': 'ACTIVE',
            'registration_date': '2020-08-15',
        },
    }

    # Valid Indian state codes in Udyam numbers
    _VALID_STATES = {
        'AN','AP','AR','AS','BR','CG','CH','DD','DL','DN','GA','GJ','HP','HR','JH',
        'JK','KA','KL','LA','LD','MH','ML','MN','MP','MZ','NL','OD','PB','PY','RJ',
        'SK','TN','TR','TS','UK','UP','WB'
    }

    def _validate_format(self, udyam: str) -> tuple[bool, str]:
        m = re.match(r'^UDYAM-([A-Z]{2})-(\d{2})-(\d{7})$', udyam)
        if not m:
            return False, 'Format must be UDYAM-XX-YY-NNNNNNN (e.g. UDYAM-MH-12-0034567).'
        state_code = m.group(1)
        if state_code not in self._VALID_STATES:
            return False, f"State code '{state_code}' is not a valid Indian state code."
        return True, 'OK'

    def verify(self, udyam: str, submitted_name: str = None) -> VerificationResult:
        udyam = (udyam or '').strip().upper()
        is_valid, reason = self._validate_format(udyam)

        if not is_valid:
            return VerificationResult(
                adapter=self.NAME, verified=False, confidence=0.0,
                entity_name=None, identifier=udyam, status='INVALID_FORMAT',
                verified_at=datetime.now().isoformat(),
                source='Udyam Format Validator', mode=ADAPTER_MODE,
                raw_fields={}, mismatch_flags=['Udyam number format invalid'],
                notes=reason
            )

        if ADAPTER_MODE == 'LIVE':
            # No free public API — format is all we can check
            return VerificationResult(
                adapter=self.NAME, verified=True, confidence=0.70,
                entity_name=submitted_name, identifier=udyam,
                status='FORMAT_VALID',
                verified_at=datetime.now().isoformat(),
                source='Udyam Format Validator (LIVE — no free public API)',
                mode='LIVE', raw_fields={}, mismatch_flags=[],
                notes=(
                    'Udyam format and state code validated. '
                    'Full verification against MSME portal requires MSME Ministry API authorization. '
                    'Manual check: https://udyamregistration.gov.in/udyam_verify.aspx'
                )
            )

        # MOCK mode
        data = self._MOCK.get(udyam)
        if not data:
            return VerificationResult(
                adapter=self.NAME, verified=False, confidence=0.0,
                entity_name=None, identifier=udyam, status='NOT_FOUND',
                verified_at=datetime.now().isoformat(),
                source='Udyam Mock Adapter', mode='MOCK',
                raw_fields={}, mismatch_flags=[],
                notes='Udyam number not in demo database.'
            )

        mismatches = []
        if submitted_name and not _name_match(submitted_name, data['enterprise_name']):
            mismatches.append(
                f"Name mismatch: '{submitted_name}' vs Udyam record '{data['enterprise_name']}'"
            )

        return VerificationResult(
            adapter=self.NAME, verified=True, confidence=0.95,
            entity_name=data['enterprise_name'], identifier=udyam,
            status=data['status'],
            verified_at=datetime.now().isoformat(),
            source='MOCK — no free Udyam API exists; manual check at udyamregistration.gov.in',
            mode='MOCK', raw_fields=data, mismatch_flags=mismatches, notes=None
        )


# ═══════════════════════════════════════════════════════════════
# EPFO Adapter  →  Format validation + mock
# Official API requires Labour Ministry authorization
# ═══════════════════════════════════════════════════════════════

class EPFOAdapter:
    NAME = 'EPFO'

    _MOCK = {
        'MH/BAN/12345':  {'establishment_name': 'ABC TECHNOLOGIES PVT LTD',           'status': 'ACTIVE', 'employees': 85},
        'KA/BAN/45678':  {'establishment_name': 'NOVA ENGINEERING SOLUTIONS PVT LTD', 'status': 'ACTIVE', 'employees': 142},
    }

    # PF number pattern: STATE/REGION/ESTABLISHMENT_NUMBER (e.g. MH/BAN/12345)
    _PF_PATTERN = re.compile(r'^[A-Z]{2}/[A-Z]{2,5}/\d{5,7}$')

    def verify(self, pf_number: str, submitted_name: str = None) -> VerificationResult:
        pf_number = (pf_number or '').strip().upper()

        if not self._PF_PATTERN.match(pf_number):
            return VerificationResult(
                adapter=self.NAME, verified=False, confidence=0.0,
                entity_name=None, identifier=pf_number, status='INVALID_FORMAT',
                verified_at=datetime.now().isoformat(),
                source='EPFO Format Validator', mode=ADAPTER_MODE,
                raw_fields={}, mismatch_flags=['PF number format invalid'],
                notes='PF number format: STATE/REGION/NUMBER (e.g. MH/BAN/12345).'
            )

        if ADAPTER_MODE == 'LIVE':
            return VerificationResult(
                adapter=self.NAME, verified=True, confidence=0.65,
                entity_name=submitted_name, identifier=pf_number,
                status='FORMAT_VALID',
                verified_at=datetime.now().isoformat(),
                source='EPFO Format Validator (LIVE — no free public API)',
                mode='LIVE', raw_fields={}, mismatch_flags=[],
                notes=(
                    'EPFO number format validated. '
                    'Full verification requires Labour Ministry API authorization. '
                    'Manual check: https://www.epfindia.gov.in/site_en/Est_EC_Search.php'
                )
            )

        data = self._MOCK.get(pf_number)
        if not data:
            return VerificationResult(
                adapter=self.NAME, verified=False, confidence=0.0,
                entity_name=None, identifier=pf_number, status='NOT_FOUND',
                verified_at=datetime.now().isoformat(),
                source='EPFO Mock Adapter', mode='MOCK',
                raw_fields={}, mismatch_flags=[],
                notes='EPFO establishment not in demo database.'
            )

        mismatches = []
        if submitted_name and not _name_match(submitted_name, data['establishment_name']):
            mismatches.append(
                f"Name mismatch: '{submitted_name}' vs EPFO '{data['establishment_name']}'"
            )

        return VerificationResult(
            adapter=self.NAME, verified=True, confidence=0.93,
            entity_name=data['establishment_name'], identifier=pf_number,
            status=data['status'],
            verified_at=datetime.now().isoformat(),
            source='EPFO Mock Adapter', mode='MOCK',
            raw_fields=data, mismatch_flags=mismatches, notes=None
        )


# ═══════════════════════════════════════════════════════════════
# ESIC Adapter  →  Format validation + mock
# Official API requires ESIC authorization
# ═══════════════════════════════════════════════════════════════

class ESICAdapter:
    NAME = 'ESIC'

    _MOCK = {
        '31000123456': {'employer_name': 'ABC Technologies Pvt Ltd',           'status': 'ACTIVE', 'state': 'Maharashtra'},
        '53000234567': {'employer_name': 'Nova Engineering Solutions Pvt Ltd', 'status': 'ACTIVE', 'state': 'Karnataka'},
    }

    # ESIC employer code: 11-17 digit numeric
    _ESIC_PATTERN = re.compile(r'^\d{11,17}$')

    def verify(self, esic_number: str, submitted_name: str = None) -> VerificationResult:
        esic_number = (esic_number or '').strip()

        if not self._ESIC_PATTERN.match(esic_number):
            return VerificationResult(
                adapter=self.NAME, verified=False, confidence=0.0,
                entity_name=None, identifier=esic_number, status='INVALID_FORMAT',
                verified_at=datetime.now().isoformat(),
                source='ESIC Format Validator', mode=ADAPTER_MODE,
                raw_fields={}, mismatch_flags=['ESIC number format invalid'],
                notes='ESIC employer code must be 11–17 digits.'
            )

        if ADAPTER_MODE == 'LIVE':
            return VerificationResult(
                adapter=self.NAME, verified=True, confidence=0.65,
                entity_name=submitted_name, identifier=esic_number,
                status='FORMAT_VALID',
                verified_at=datetime.now().isoformat(),
                source='ESIC Format Validator (LIVE — no free public API)',
                mode='LIVE', raw_fields={}, mismatch_flags=[],
                notes=(
                    'ESIC number format validated. '
                    'Full verification requires ESIC API authorization. '
                    'Manual check: https://www.esic.gov.in/'
                )
            )

        data = self._MOCK.get(esic_number)
        if not data:
            return VerificationResult(
                adapter=self.NAME, verified=False, confidence=0.0,
                entity_name=None, identifier=esic_number, status='NOT_FOUND',
                verified_at=datetime.now().isoformat(),
                source='ESIC Mock Adapter', mode='MOCK',
                raw_fields={}, mismatch_flags=[],
                notes='ESIC employer not in demo database.'
            )

        mismatches = []
        if submitted_name and not _name_match(submitted_name, data['employer_name']):
            mismatches.append(
                f"Name mismatch: '{submitted_name}' vs ESIC '{data['employer_name']}'"
            )

        return VerificationResult(
            adapter=self.NAME, verified=True, confidence=0.93,
            entity_name=data['employer_name'], identifier=esic_number,
            status=data['status'],
            verified_at=datetime.now().isoformat(),
            source='ESIC Mock Adapter', mode='MOCK',
            raw_fields=data, mismatch_flags=mismatches, notes=None
        )


# ═══════════════════════════════════════════════════════════════
# Blacklist / Debarment Check
# Checks against: GeM debarred list, CPSE list, internal list
# Production: Load from official debarment database / CSV
# ═══════════════════════════════════════════════════════════════

class BlacklistAdapter:
    NAME = 'BLACKLIST'

    # Add real debarred GSTINs / PANs / CINs here for production
    # Source: https://www.gem.gov.in/reports/debarredVendors
    BLACKLISTED = set()

    def verify(self, identifier: str, identifier_type: str = 'GSTIN') -> VerificationResult:
        identifier  = (identifier or '').strip().upper()
        is_clear    = identifier not in self.BLACKLISTED

        return VerificationResult(
            adapter=self.NAME,
            verified=is_clear,
            confidence=0.99,
            entity_name=None,
            identifier=identifier,
            status='CLEAR' if is_clear else 'BLACKLISTED',
            verified_at=datetime.now().isoformat(),
            source='Internal Debarment List (GeM/CPSE/CPCL)',
            mode=ADAPTER_MODE,
            raw_fields={'blacklisted': not is_clear, 'identifier_type': identifier_type},
            mismatch_flags=['ENTITY IS BLACKLISTED / DEBARRED'] if not is_clear else [],
            notes=(
                'Not found on debarment list.' if is_clear
                else 'Entity found on debarment/blacklist. Bid must be rejected.'
            )
        )


# ═══════════════════════════════════════════════════════════════
# DigiLocker Adapter
# Production: DigiLocker Partner API via NIC / API Setu
# Requires MoU with NIC: https://www.digilocker.gov.in/
# ═══════════════════════════════════════════════════════════════

class DigiLockerAdapter:
    NAME = 'DIGILOCKER'

    DIGILOCKER_CLIENT_ID     = os.environ.get('DIGILOCKER_CLIENT_ID', '')
    DIGILOCKER_CLIENT_SECRET = os.environ.get('DIGILOCKER_CLIENT_SECRET', '')

    def verify(self, document_uri: str, submitted_name: str = None) -> VerificationResult:
        if ADAPTER_MODE == 'LIVE' and self.DIGILOCKER_CLIENT_ID:
            # OAuth2 flow requires a user redirect — not callable server-side without user token
            # This is a placeholder for when you have a partner integration
            # PENDING_USER_AUTH means the document has NOT been fetched or confirmed yet —
            # it was previously marked verified=True, which is wrong: "pending" is not
            # "verified". Report it as unverified until the OAuth2 callback actually
            # completes and confirms the document.
            return VerificationResult(
                adapter=self.NAME, verified=False, confidence=0.0,
                entity_name=submitted_name, identifier=document_uri,
                status='PENDING_USER_AUTH',
                verified_at=datetime.now().isoformat(),
                source='DigiLocker Partner API (client_id configured)',
                mode='LIVE', raw_fields={'uri': document_uri},
                mismatch_flags=['DigiLocker verification not yet completed — awaiting user authorization'],
                notes=(
                    'DigiLocker OAuth2 credentials are set, but this document has not been '
                    'confirmed. Full document fetch requires the user authorization flow '
                    '(redirect to DigiLocker). Implement /auth/digilocker/callback to complete '
                    'the flow before treating this as verified.'
                )
            )

        return VerificationResult(
            adapter=self.NAME, verified=True, confidence=0.98,
            entity_name=submitted_name, identifier=document_uri,
            status='DIGITALLY_VERIFIED',
            verified_at=datetime.now().isoformat(),
            source='DigiLocker Mock Adapter',
            mode='MOCK',
            raw_fields={'uri': document_uri, 'digitally_signed': True, 'issuer': 'Government of India'},
            mismatch_flags=[],
            notes='Mock verification. Production requires NIC DigiLocker partner agreement.'
        )


# ═══════════════════════════════════════════════════════════════
# Startup India / DPIIT Adapter
# ═══════════════════════════════════════════════════════════════

class StartupIndiaAdapter:
    NAME = 'STARTUP_INDIA'

    def verify(self, dpiit_number: str, submitted_name: str = None) -> VerificationResult:
        dpiit_number = (dpiit_number or '').strip().upper()
        if not re.match(r'^DPIIT\d{5,10}$', dpiit_number):
            return VerificationResult(
                adapter=self.NAME, verified=False, confidence=0.0,
                entity_name=None, identifier=dpiit_number, status='INVALID_FORMAT',
                verified_at=datetime.now().isoformat(),
                source='DPIIT Format Validator', mode=ADAPTER_MODE,
                raw_fields={}, mismatch_flags=['DPIIT number format invalid'],
                notes='DPIIT number must follow format: DPIIT followed by 5–10 digits.'
            )

        return VerificationResult(
            adapter=self.NAME, verified=True, confidence=0.85,
            entity_name=submitted_name, identifier=dpiit_number,
            status='FORMAT_VALID',
            verified_at=datetime.now().isoformat(),
            source='Startup India Mock Adapter',
            mode=ADAPTER_MODE, raw_fields={}, mismatch_flags=[],
            notes=(
                'DPIIT number format valid. '
                'Live recognition check: https://www.startupindia.gov.in/content/sih/en/ams-application/Startup-Recognition.html'
            )
        )


# ── Adapter Registry ──────────────────────────────────────────

ADAPTERS = {
    'GSTN':          GSTNAdapter(),
    'MCA21':         MCA21Adapter(),
    'PAN':           PANAdapter(),
    'UDYAM':         UdyamAdapter(),
    'EPFO':          EPFOAdapter(),
    'ESIC':          ESICAdapter(),
    'BLACKLIST':     BlacklistAdapter(),
    'DIGILOCKER':    DigiLockerAdapter(),
    'STARTUP_INDIA': StartupIndiaAdapter(),
}

ADAPTER_METADATA = {
    'GSTN': {
        'name': 'GST Network',
        'api': 'gstinapi.in (GSP network)',
        'live_available': True,
        'key_env': 'GSTINAPI_KEY',
        'signup_url': 'https://gstinapi.in',
        'free_tier': '100 free lookups on sign-up',
    },
    'MCA21': {
        'name': 'MCA21 — Ministry of Corporate Affairs',
        'api': 'data.gov.in (Open Government Data)',
        'live_available': True,
        'key_env': 'DATA_GOV_API_KEY',
        'signup_url': 'https://data.gov.in',
        'free_tier': 'Free with registration',
    },
    'PAN': {
        'name': 'PAN — Income Tax Department',
        'api': 'Cascade: Surepass → API Sathi → Protean OPV → Didit.me → sandbox.co.in',
        'live_available': True,
        'key_env': 'SUREPASS_TOKEN  OR  APISATHI_API_KEY  OR  PROTEAN_OPV_TOKEN  OR  DIDIT_API_KEY',
        'signup_url': 'https://app.surepass.io/register  (free, 2 min)',
        'free_tier': 'Surepass: free signup | Didit.me: 500 free/month | Protean: ITD authorisation required',
    },
    'UDYAM': {
        'name': 'Udyam Registration — MSME',
        'api': 'Format validation only',
        'live_available': False,
        'key_env': None,
        'signup_url': 'https://udyamregistration.gov.in/',
        'free_tier': 'No free public API — requires MSME Ministry MoU',
    },
    'EPFO': {
        'name': 'EPFO — Employees Provident Fund',
        'api': 'Format validation only',
        'live_available': False,
        'key_env': None,
        'signup_url': 'https://www.epfindia.gov.in/',
        'free_tier': 'No free public API — requires Labour Ministry authorization',
    },
    'ESIC': {
        'name': 'ESIC — Employees State Insurance',
        'api': 'Format validation only',
        'live_available': False,
        'key_env': None,
        'signup_url': 'https://www.esic.gov.in/',
        'free_tier': 'No free public API',
    },
    'BLACKLIST': {
        'name': 'GeM / CPSE Debarment Check',
        'api': 'Internal list',
        'live_available': True,
        'key_env': None,
        'signup_url': 'https://www.gem.gov.in/reports/debarredVendors',
        'free_tier': 'Download debarred vendor list from GeM portal',
    },
    'DIGILOCKER': {
        'name': 'DigiLocker',
        'api': 'OAuth2 partner API (NIC)',
        'live_available': True,
        'key_env': 'DIGILOCKER_CLIENT_ID + DIGILOCKER_CLIENT_SECRET',
        'signup_url': 'https://www.digilocker.gov.in/',
        'free_tier': 'Requires NIC partner MoU',
    },
}


# ── Public helpers ────────────────────────────────────────────

def run_verification(adapter_name: str, identifier: str, submitted_name: str = None) -> dict:
    """Run a single government verification and return a normalized dict."""
    adapter = ADAPTERS.get(adapter_name.upper())
    if not adapter:
        return {
            'adapter': adapter_name, 'verified': False,
            'status': 'ADAPTER_NOT_FOUND', 'mode': ADAPTER_MODE,
            'notes': f'Unknown adapter. Available: {list(ADAPTERS.keys())}',
        }
    result = adapter.verify(identifier, submitted_name)
    return asdict(result)


def _not_submitted_result(adapter: str, why: str) -> dict:
    """
    A required identifier was never submitted by the bidder, so its check could not run
    at all. This used to simply be left out of the results list — which meant a bidder
    could score "3/3 checks passed — CLEAR" (or even "0/0 — CLEAR") without MCA21 (or any
    other mandatory check) ever having been attempted. An officer reading "CLEAR" had no
    way to tell that from an actually-clean bidder. Surfacing it explicitly as a failed,
    unverified check closes that gap.
    """
    return {
        'adapter': adapter, 'verified': False, 'confidence': 0.0,
        'entity_name': None, 'identifier': None, 'status': 'NOT_SUBMITTED',
        'verified_at': datetime.now().isoformat(),
        'source': 'N/A — not submitted', 'mode': ADAPTER_MODE,
        'raw_fields': {}, 'mismatch_flags': [why],
        'notes': why,
    }


# Company types that are legally required to have a CIN registered with the MCA.
# Sole proprietorships and unregistered partnerships are not, so they're exempt.
_CIN_REQUIRED_TYPES = {
    'private limited', 'public limited', 'llp', 'limited liability partnership',
    'one person company', 'opc', 'section 8 company',
}

def run_full_verification(bidder: dict, documents: list = None) -> list:
    """
    Run all applicable government verifications for a bidder.
    Returns list of VerificationResult dicts.

    Identifier resolution order (most trustworthy first):
      1. Registered field on the bidder record (entered at registration)
      2. Extracted entity from an uploaded document (OCR'd at upload time)
      3. NOT_SUBMITTED — nothing available to verify

    This means even a bidder whose registration fields are null (e.g. placeholder
    data was wiped) will still get verified if they uploaded a PAN / GST document.
    Documents are passed in from the caller so this function has no disk I/O.
    """
    results = []
    name        = bidder.get('name', '') or ''
    entity_type = (bidder.get('type') or '').strip().lower()

    # ── Build a lookup of extracted identifiers from uploaded documents ──────
    # Key: doc classification (GST, PAN, UDYAM, EPFO, ESIC) → best entity dict
    doc_entities: dict = {}
    if documents:
        for doc in documents:
            if not doc.get('saved_path'):          # skip seed/demo docs without a real file
                continue
            cls = (doc.get('classification') or '').upper()
            ents = doc.get('extracted_entities') or {}
            if cls and ents and cls not in doc_entities:
                doc_entities[cls] = ents

    def _resolve(reg_field: str, doc_cls: str, entity_key: str):
        """Return the best available identifier for this check."""
        reg_val = bidder.get(reg_field)
        if reg_val:
            return str(reg_val).strip()
        # Fall back to extracted entity from document
        ents = doc_entities.get(doc_cls, {})
        extracted = ents.get(entity_key)
        if extracted:
            return str(extracted).strip()
        return None

    # ── GSTN ─────────────────────────────────────────────────────────────
    gstin = _resolve('gstin', 'GST', 'gstin')
    if gstin:
        results.append(run_verification('GSTN',     gstin, name))
        results.append(run_verification('BLACKLIST', gstin, name))
    else:
        results.append(_not_submitted_result('GSTN', 'No GSTIN was submitted for this bidder.'))

    # ── PAN ──────────────────────────────────────────────────────────────
    pan = _resolve('pan', 'PAN', 'pan')
    if pan:
        results.append(run_verification('PAN',       pan, name))
        results.append(run_verification('BLACKLIST', pan, name))
    else:
        results.append(_not_submitted_result('PAN', 'No PAN was submitted for this bidder.'))

    # ── MCA21 (CIN) ──────────────────────────────────────────────────────
    cin = _resolve('cin', 'INCORPORATION', 'cin')
    if cin:
        results.append(run_verification('MCA21', cin, name))
    elif entity_type in _CIN_REQUIRED_TYPES:
        results.append(_not_submitted_result(
            'MCA21',
            f"No CIN was submitted, but entity type '{bidder.get('type')}' is required to "
            "be registered with the Ministry of Corporate Affairs."
        ))

    # ── Udyam ────────────────────────────────────────────────────────────
    udyam = _resolve('udyam_no', 'UDYAM', 'udyam_no')
    if udyam:
        results.append(run_verification('UDYAM', udyam, name))

    # ── EPFO ─────────────────────────────────────────────────────────────
    epfo = _resolve('epfo_no', 'EPFO', 'epfo_no')
    if epfo:
        results.append(run_verification('EPFO', epfo, name))

    # ── ESIC ─────────────────────────────────────────────────────────────
    esic = _resolve('esic_no', 'ESIC', 'esic_no')
    if esic:
        results.append(run_verification('ESIC', esic, name))

    return results
