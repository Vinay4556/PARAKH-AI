import json
import os
from config import DATA_DIR
from services.json_cache import load_cached, save_cached


def load_json(filename):
    """Cached read — disk access only on first call or after invalidation."""
    return load_cached(filename)


def save_json(filename, data):
    """Write to disk and update cache atomically."""
    save_cached(filename, data)


def get_all_tenders():
    return load_cached('tenders.json')


def get_tender_by_id(tender_id):
    return next((t for t in load_cached('tenders.json') if t['id'] == tender_id), None)


def get_requirements_for_tender(tender_id):
    return [r for r in load_cached('requirements.json') if r['tender_id'] == tender_id]


def get_requirement_by_id(req_id):
    return next((r for r in load_cached('requirements.json') if r['id'] == req_id), None)


def get_tender_summary(tender_id):
    tender = get_tender_by_id(tender_id)
    if not tender:
        return None
    reqs = get_requirements_for_tender(tender_id)
    mandatory = [r for r in reqs if r['mandatory']]
    optional  = [r for r in reqs if not r['mandatory']]
    return {
        **tender,
        'total_requirements': len(reqs),
        'mandatory_count':    len(mandatory),
        'optional_count':     len(optional),
        'bidder_count':       len(tender.get('bidder_ids', [])),
    }
