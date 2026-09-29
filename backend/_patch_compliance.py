"""Patch compliance_service.py to add dynamic matching for non-demo bidders."""
PATH = r'c:\Users\DELL\Downloads\Parakh\Parakh-AI\backend\services\compliance_service.py'

with open(PATH, encoding='utf-8') as f:
    content = f.read()

OLD = '''def get_compliance_results(bidder_id: str, requirements: list, documents: list) -> dict:
    """Calculate full compliance results for a bidder."""
    results = {}
    compliance_data = DEMO_COMPLIANCE.get(bidder_id, {})

    for req in requirements:
        req_id = req['id']
        demo_result = compliance_data.get(req_id, {
            "status": "MISSING",
            "confidence": 0.0,
            "source_doc": None,
            "extracted_value": None,
            "required_value": "Document required",
            "found_value": "Not submitted"
        })

        # Find source document details
        source_doc_detail = None
        if demo_result.get('source_doc'):
            source_doc_detail = next((d for d in documents if d['id'] == demo_result['source_doc']), None)

        # Build explanation
        explanation = explain_decision(
            req_id=req_id,
            status=demo_result['status'],
            requirement=req,
            evidence=demo_result
        )

        results[req_id] = {
            **demo_result,
            'requirement': req,
            'source_document': source_doc_detail,
            'explanation': explanation,
        }

    return results'''

NEW = '''def get_compliance_results(bidder_id: str, requirements: list, documents: list) -> dict:
    """Calculate full compliance results for a bidder."""
    results = {}
    compliance_data = DEMO_COMPLIANCE.get(bidder_id, {})

    # Doc classification type -> requirement ID mapping
    DOC_TYPE_TO_REQ = {
        'GST': 'REQ-001', 'PAN': 'REQ-002', 'UDYAM': 'REQ-003',
        'FINANCIAL': 'REQ-004', 'EXPERIENCE': 'REQ-005', 'ISO9001': 'REQ-006',
        'EPFO': 'REQ-007', 'ESIC': 'REQ-008', 'OEM': 'REQ-009',
        'DECLARATION': 'REQ-010', 'BIS_CE': 'REQ-014', 'ISO27001': 'REQ-015',
        'INCORPORATION': 'REQ-017', 'NABL': 'REQ-020',
    }

    # Build lookup: doc type -> list of uploaded docs
    docs_by_type = {}
    docs_by_req  = {}
    for doc in documents:
        if doc.get('saved_path'):
            dtype = doc.get('classification', 'UNKNOWN')
            docs_by_type.setdefault(dtype, []).append(doc)
            if doc.get('requirement_id'):
                docs_by_req.setdefault(doc['requirement_id'], []).append(doc)

    for req in requirements:
        req_id = req['id']

        # 1. Use pre-calculated demo result if available
        if compliance_data.get(req_id):
            demo_result = compliance_data[req_id]
            source_doc_detail = None
            if demo_result.get('source_doc'):
                source_doc_detail = next((d for d in documents if d['id'] == demo_result['source_doc']), None)
            explanation = explain_decision(req_id=req_id, status=demo_result['status'], requirement=req, evidence=demo_result)
            results[req_id] = {
                **demo_result,
                'requirement': req,
                'source_document': source_doc_detail,
                'source_doc_id': demo_result.get('source_doc'),
                'explanation': explanation,
            }
            continue

        # 2. Dynamic matching for non-demo bidders
        matched_doc = None
        # First: explicit requirement_id tag on the document
        if req_id in docs_by_req:
            matched_doc = docs_by_req[req_id][0]
        # Second: match by AI classification type
        if not matched_doc:
            for dtype, mapped_req in DOC_TYPE_TO_REQ.items():
                if mapped_req == req_id and dtype in docs_by_type:
                    matched_doc = docs_by_type[dtype][0]
                    break

        if matched_doc:
            entities = matched_doc.get('extracted_entities', {})
            entity_str = ', '.join(f"{k.upper()}: {v}" for k, v in entities.items()) if entities else matched_doc['filename']
            gov_v = matched_doc.get('gov_verification')
            gov_note = f" | Gov API: {gov_v['status']} ({gov_v['source']})" if gov_v else ''
            ev_list = req.get('required_evidence', ['Document required'])
            ev_str  = ', '.join(ev_list) if isinstance(ev_list, list) else str(ev_list)
            result = {
                'status':          'VERIFIED',
                'confidence':      matched_doc.get('confidence', 0.85),
                'source_doc':      matched_doc['id'],
                'extracted_value': f"Uploaded: {matched_doc['filename']}. {entity_str}.{gov_note}",
                'required_value':  ev_str,
                'found_value':     f"{matched_doc.get('classification', 'Document')} submitted",
                'reason': '', 'concern': '',
            }
        else:
            ev_list = req.get('required_evidence', ['Document required'])
            ev_str  = ', '.join(ev_list) if isinstance(ev_list, list) else str(ev_list)
            result = {
                'status': 'MISSING', 'confidence': 0.0, 'source_doc': None,
                'extracted_value': None, 'required_value': ev_str,
                'found_value': 'Not submitted', 'reason': '', 'concern': '',
            }

        source_doc_detail = next((d for d in documents if d['id'] == result.get('source_doc')), None) if result.get('source_doc') else None
        explanation = explain_decision(req_id=req_id, status=result['status'], requirement=req, evidence=result)
        results[req_id] = {
            **result,
            'requirement': req,
            'source_document': source_doc_detail,
            'source_doc_id': result.get('source_doc'),
            'explanation': explanation,
        }

    return results'''

if OLD in content:
    content = content.replace(OLD, NEW)
    with open(PATH, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Patched successfully")
else:
    print("ERROR: OLD string not found — check for whitespace differences")
    # Show what's around line 106
    lines = content.split('\n')
    for i, l in enumerate(lines[104:145], 105):
        print(f"L{i}: {repr(l)}")
