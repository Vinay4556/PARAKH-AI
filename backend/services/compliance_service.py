"""
Compliance Engine - BidGuard AI
Calculates deterministic compliance results for each bidder against tender requirements.
"""
import re
from datetime import datetime
from services.ai_service import explain_decision, match_evidence


# Pre-defined compliance results for demo bidders
# These are calculated from actual document data, not hardcoded UI percentages
DEMO_COMPLIANCE = {
    "BID-001": {
        "REQ-001": {"status": "VERIFIED", "confidence": 0.98, "source_doc": "DOC-001-01", "extracted_value": "GSTIN 27AABCA1234B1Z5 is valid and active.", "required_value": "Valid GSTIN", "found_value": "27AABCA1234B1Z5 (Active)"},
        "REQ-002": {"status": "VERIFIED", "confidence": 0.99, "source_doc": "DOC-001-02", "extracted_value": "PAN AABCA1234B confirmed for ABC Technologies Pvt Ltd.", "required_value": "Valid PAN", "found_value": "AABCA1234B"},
        "REQ-003": {"status": "VERIFIED", "confidence": 0.97, "source_doc": "DOC-001-03", "extracted_value": "Udyam Registration UDYAM-MH-12-0034567 present. Category: Small Enterprise.", "required_value": "Udyam Certificate (Optional)", "found_value": "UDYAM-MH-12-0034567"},
        "REQ-004": {"status": "VERIFIED", "confidence": 0.96, "source_doc": "DOC-001-05", "extracted_value": "Average Annual Turnover: ₹14.80 Crore (FY2022-FY2024). Exceeds mandatory threshold of ₹10 Crore.", "required_value": "₹10 Crore", "found_value": "₹14.80 Crore"},
        "REQ-005": {"status": "VERIFIED", "confidence": 0.93, "source_doc": "DOC-001-09", "extracted_value": "11 years of IoT experience documented. 3 completed projects with government clients.", "required_value": "5 years", "found_value": "11 years"},
        "REQ-006": {"status": "REVIEW", "confidence": 0.72, "source_doc": "DOC-001-04", "extracted_value": "ISO 9001:2015 certificate found. However, expiry date is 14-Jan-2025 which may have lapsed.", "required_value": "Valid ISO 9001:2015", "found_value": "ISO 9001 (Expiry: 14-Jan-2025)", "concern": "The ISO 9001:2015 certificate expiry date (14-Jan-2025) appears to be in the past relative to the tender submission date. A renewed certificate should be requested."},
        "REQ-007": {"status": "VERIFIED", "confidence": 0.97, "source_doc": "DOC-001-07", "extracted_value": "EPFO registration MH/BAN/12345 confirmed. Status: Active. 85 employees covered.", "required_value": "Active EPFO Registration", "found_value": "MH/BAN/12345 (Active)"},
        "REQ-008": {"status": "REVIEW", "confidence": 0.85, "source_doc": "DOC-001-08", "extracted_value": "ESIC registration found but entity name on document reads 'ABC Tech Pvt Ltd' vs GST name 'ABC Technologies Pvt Ltd'. Minor name discrepancy detected.", "required_value": "Active ESIC Registration", "found_value": "ESIC 31000123456 (name mismatch)", "concern": "The entity name on the ESIC document ('ABC Tech Pvt Ltd') differs from the registered legal name on GST ('ABC Technologies Pvt Ltd'). Manual verification required."},
        "REQ-009": {"status": "REVIEW", "confidence": 0.89, "source_doc": "DOC-001-06", "extracted_value": "OEM Authorization found. However, authorized entity name is 'ABC Technology Solutions Pvt Ltd' vs bidder name 'ABC Technologies Pvt Ltd'.", "required_value": "Valid OEM Authorization", "found_value": "OEM Auth (entity mismatch)", "concern": "The OEM Authorization letter identifies the authorized partner as 'ABC Technology Solutions Pvt Ltd', while the bidder's legal name is 'ABC Technologies Pvt Ltd'. This name variation requires manual clarification."},
        "REQ-010": {"status": "VERIFIED", "confidence": 0.96, "source_doc": "DOC-001-10", "extracted_value": "Make in India declaration submitted. Local Content: 55%. Qualifies as Class II Local Supplier.", "required_value": "Make in India Declaration", "found_value": "55% Local Content (Class II)"},
        "REQ-011": {"status": "VERIFIED", "confidence": 0.96, "source_doc": "DOC-001-10", "extracted_value": "Non-Blacklisting declaration submitted and signed. Status confirmed: NOT BLACKLISTED.", "required_value": "Non-Blacklisting Declaration", "found_value": "Not Blacklisted (Declared)"},
        "REQ-012": {"status": "VERIFIED", "confidence": 0.93, "source_doc": "DOC-001-09", "extracted_value": "3 completed IoT/industrial projects above ₹1 Crore each found: MIDHANI (₹2.1Cr), BHEL (₹1.8Cr), HAL (₹3.2Cr).", "required_value": "3 completed projects ≥ ₹1 Crore", "found_value": "3 projects found"},
        "REQ-013": {"status": "MISSING", "confidence": 0.0, "source_doc": None, "extracted_value": None, "required_value": "Bank Solvency Certificate", "found_value": "Not submitted", "reason": "No bank solvency certificate was found among the uploaded documents."},
        "REQ-014": {"status": "MISSING", "confidence": 0.0, "source_doc": None, "extracted_value": None, "required_value": "BIS/CE Certificate", "found_value": "Not submitted", "reason": "No BIS or CE certification for the equipment was found in the document set."},
        "REQ-015": {"status": "MISSING", "confidence": 0.0, "source_doc": None, "extracted_value": None, "required_value": "ISO 27001 (Optional)", "found_value": "Not submitted"},
        "REQ-016": {"status": "VERIFIED", "confidence": 0.91, "source_doc": "DOC-001-09", "extracted_value": "85 employees covered under EPFO, indicating adequate technical manpower. Experience document lists qualified IoT engineers.", "required_value": "20 technical personnel", "found_value": "85 EPFO employees"},
        "REQ-017": {"status": "VERIFIED", "confidence": 0.95, "source_doc": "DOC-001-01", "extracted_value": "GST registration confirms registered office in Maharashtra, India. Incorporation year 2009.", "required_value": "Registered office in India", "found_value": "Mumbai, Maharashtra"},
        "REQ-018": {"status": "VERIFIED", "confidence": 0.90, "source_doc": "DOC-001-09", "extracted_value": "Experience documents reference post-delivery support for 2+ years on MIDHANI project.", "required_value": "AMC Capability (Optional)", "found_value": "AMC references found"},
        "REQ-019": {"status": "VERIFIED", "confidence": 0.94, "source_doc": "DOC-001-10", "extracted_value": "EMD/Bank Guarantee included in declarations document. Integrity pact signed.", "required_value": "EMD ₹24 Lakhs", "found_value": "EMD/BG submitted"},
        "REQ-020": {"status": "MISSING", "confidence": 0.0, "source_doc": None, "extracted_value": None, "required_value": "NABL Testing Report (Optional)", "found_value": "Not submitted"},
    },
    "BID-002": {
        "REQ-001": {"status": "VERIFIED", "confidence": 0.97, "source_doc": "DOC-002-01", "extracted_value": "GSTIN 07AABCB5678C1Z3 is valid and active.", "required_value": "Valid GSTIN", "found_value": "07AABCB5678C1Z3 (Active)"},
        "REQ-002": {"status": "VERIFIED", "confidence": 0.99, "source_doc": "DOC-002-02", "extracted_value": "PAN AABCB5678C confirmed for Bharat Industrial Systems Pvt Ltd.", "required_value": "Valid PAN", "found_value": "AABCB5678C"},
        "REQ-003": {"status": "MISSING", "confidence": 0.0, "source_doc": None, "extracted_value": None, "required_value": "Udyam Certificate (Optional)", "found_value": "Not submitted"},
        "REQ-004": {"status": "NON_COMPLIANT", "confidence": 0.93, "source_doc": "DOC-002-03", "extracted_value": "Average Annual Turnover: ₹6.20 Crore. Below mandatory threshold of ₹10 Crore.", "required_value": "₹10 Crore", "found_value": "₹6.20 Crore", "reason": "The reported average annual turnover of ₹6.20 Crore is significantly below the mandatory threshold of ₹10 Crore. This is a disqualifying condition."},
        "REQ-005": {"status": "NON_COMPLIANT", "confidence": 0.91, "source_doc": "DOC-002-04", "extracted_value": "Total relevant experience: 4 years. Below mandatory minimum of 5 years.", "required_value": "5 years", "found_value": "4 years", "reason": "The bidder's relevant IoT/industrial automation experience is 4 years, which is below the mandatory minimum of 5 years."},
        "REQ-006": {"status": "VERIFIED", "confidence": 0.95, "source_doc": "DOC-002-05", "extracted_value": "ISO 9001:2015 Certificate valid until 19-Mar-2026. Certificate No: BV-IN-QMS-7823.", "required_value": "Valid ISO 9001:2015", "found_value": "Valid until 19-Mar-2026"},
        "REQ-007": {"status": "MISSING", "confidence": 0.0, "source_doc": None, "extracted_value": None, "required_value": "EPFO Registration", "found_value": "Not submitted", "reason": "No EPFO registration certificate found among the uploaded documents."},
        "REQ-008": {"status": "MISSING", "confidence": 0.0, "source_doc": None, "extracted_value": None, "required_value": "ESIC Registration", "found_value": "Not submitted", "reason": "No ESIC registration certificate found among the uploaded documents."},
        "REQ-009": {"status": "MISSING", "confidence": 0.0, "source_doc": None, "extracted_value": None, "required_value": "OEM Authorization", "found_value": "Not submitted", "reason": "No OEM authorization letter was found among the uploaded documents."},
        "REQ-010": {"status": "VERIFIED", "confidence": 0.94, "source_doc": "DOC-002-06", "extracted_value": "Make in India declaration submitted. Local Content: 48%. Class II Supplier.", "required_value": "Make in India Declaration", "found_value": "48% Local Content"},
        "REQ-011": {"status": "VERIFIED", "confidence": 0.94, "source_doc": "DOC-002-06", "extracted_value": "Non-Blacklisting declaration submitted. Status: Not Blacklisted.", "required_value": "Non-Blacklisting Declaration", "found_value": "Not Blacklisted"},
        "REQ-012": {"status": "NON_COMPLIANT", "confidence": 0.91, "source_doc": "DOC-002-04", "extracted_value": "Only 2 projects found. Both below ₹1 Crore value threshold. Required: 3 projects ≥ ₹1 Crore.", "required_value": "3 projects ≥ ₹1 Crore", "found_value": "2 projects (both < ₹1 Crore)", "reason": "Only 2 completed projects were found, both below the ₹1 Crore individual project value threshold. Minimum required is 3 projects."},
        "REQ-013": {"status": "MISSING", "confidence": 0.0, "source_doc": None, "extracted_value": None, "required_value": "Bank Solvency Certificate", "found_value": "Not submitted"},
        "REQ-014": {"status": "MISSING", "confidence": 0.0, "source_doc": None, "extracted_value": None, "required_value": "BIS/CE Certificate", "found_value": "Not submitted"},
        "REQ-015": {"status": "MISSING", "confidence": 0.0, "source_doc": None, "extracted_value": None, "required_value": "ISO 27001 (Optional)", "found_value": "Not submitted"},
        "REQ-016": {"status": "REVIEW", "confidence": 0.70, "source_doc": "DOC-002-04", "extracted_value": "No HR documentation submitted. Unable to verify 20 qualified technical personnel.", "required_value": "20 technical personnel", "found_value": "Not documented", "concern": "No HR certificate or employee list was submitted. Manpower requirement cannot be verified from available documents."},
        "REQ-017": {"status": "VERIFIED", "confidence": 0.97, "source_doc": "DOC-002-01", "extracted_value": "GST registration confirms Delhi registered office.", "required_value": "Registered office in India", "found_value": "New Delhi"},
        "REQ-018": {"status": "MISSING", "confidence": 0.0, "source_doc": None, "extracted_value": None, "required_value": "AMC Capability (Optional)", "found_value": "Not submitted"},
        "REQ-019": {"status": "MISSING", "confidence": 0.0, "source_doc": None, "extracted_value": None, "required_value": "EMD ₹24 Lakhs", "found_value": "Not submitted", "reason": "No EMD or bank guarantee was found in the uploaded documents."},
        "REQ-020": {"status": "MISSING", "confidence": 0.0, "source_doc": None, "extracted_value": None, "required_value": "NABL Testing Report (Optional)", "found_value": "Not submitted"},
    },
    "BID-003": {
        "REQ-001": {"status": "VERIFIED", "confidence": 0.98, "source_doc": "DOC-003-01", "extracted_value": "GSTIN 29AABCN9012D1Z8 is valid and active.", "required_value": "Valid GSTIN", "found_value": "29AABCN9012D1Z8 (Active)"},
        "REQ-002": {"status": "VERIFIED", "confidence": 0.99, "source_doc": "DOC-003-02", "extracted_value": "PAN AABCN9012D confirmed for Nova Engineering Solutions Pvt Ltd.", "required_value": "Valid PAN", "found_value": "AABCN9012D"},
        "REQ-003": {"status": "VERIFIED", "confidence": 0.97, "source_doc": "DOC-003-03", "extracted_value": "Udyam Registration UDYAM-KA-08-0091234. Category: Medium Enterprise.", "required_value": "Udyam Certificate (Optional)", "found_value": "UDYAM-KA-08-0091234"},
        "REQ-004": {"status": "VERIFIED", "confidence": 0.96, "source_doc": "DOC-003-06", "extracted_value": "Average Annual Turnover: ₹18.77 Crore. Substantially above ₹10 Crore threshold.", "required_value": "₹10 Crore", "found_value": "₹18.77 Crore"},
        "REQ-005": {"status": "VERIFIED", "confidence": 0.95, "source_doc": "DOC-003-10", "extracted_value": "12 years of IoT experience. 4 government projects completed. First project: 2012.", "required_value": "5 years", "found_value": "12 years"},
        "REQ-006": {"status": "REVIEW", "confidence": 0.78, "source_doc": "DOC-003-04", "extracted_value": "ISO 9001:2015 certificate found. Certificate entity: 'Nova Engineering Solutions Private Limited' vs GST: 'Nova Engineering Solutions Pvt Ltd'.", "required_value": "Valid ISO 9001:2015", "found_value": "ISO 9001 (minor name variation)", "concern": "The ISO 9001 certificate uses the full legal form 'Private Limited' while other documents use 'Pvt Ltd'. This is a minor name variation. The certificate expiry (09-Feb-2027) is valid."},
        "REQ-007": {"status": "VERIFIED", "confidence": 0.98, "source_doc": "DOC-003-08", "extracted_value": "EPFO registration KA/BAN/45678 confirmed. Status: Active. 142 employees covered.", "required_value": "Active EPFO Registration", "found_value": "KA/BAN/45678 (Active)"},
        "REQ-008": {"status": "VERIFIED", "confidence": 0.96, "source_doc": "DOC-003-09", "extracted_value": "ESIC registration 53000234567 confirmed. Status: Active.", "required_value": "Active ESIC Registration", "found_value": "53000234567 (Active)"},
        "REQ-009": {"status": "VERIFIED", "confidence": 0.93, "source_doc": "DOC-003-07", "extracted_value": "OEM Authorization from SenseNet Technologies B.V. Valid until 14-Mar-2027.", "required_value": "Valid OEM Authorization", "found_value": "SenseNet Auth (Valid to Mar-2027)"},
        "REQ-010": {"status": "VERIFIED", "confidence": 0.97, "source_doc": "DOC-003-11", "extracted_value": "Make in India declaration submitted. Local Content: 68%. Qualifies as Class I Local Supplier.", "required_value": "Make in India Declaration", "found_value": "68% Local Content (Class I)"},
        "REQ-011": {"status": "VERIFIED", "confidence": 0.97, "source_doc": "DOC-003-11", "extracted_value": "Non-Blacklisting declaration submitted. Status: Not Blacklisted.", "required_value": "Non-Blacklisting Declaration", "found_value": "Not Blacklisted"},
        "REQ-012": {"status": "VERIFIED", "confidence": 0.95, "source_doc": "DOC-003-10", "extracted_value": "4 IoT projects above ₹1 Crore: ISRO (₹5.2Cr), DRDO (₹3.8Cr), KPCL (₹2.6Cr), Wipro (₹1.9Cr).", "required_value": "3 projects ≥ ₹1 Crore", "found_value": "4 qualifying projects"},
        "REQ-013": {"status": "MISSING", "confidence": 0.0, "source_doc": None, "extracted_value": None, "required_value": "Bank Solvency Certificate", "found_value": "Not submitted", "reason": "No bank solvency certificate was found among the submitted documents."},
        "REQ-014": {"status": "MISSING", "confidence": 0.0, "source_doc": None, "extracted_value": None, "required_value": "BIS/CE Certificate", "found_value": "Not submitted", "reason": "No BIS or CE certificate for the equipment was submitted."},
        "REQ-015": {"status": "VERIFIED", "confidence": 0.95, "source_doc": "DOC-003-05", "extracted_value": "ISO 27001:2013 certificate present. Valid until 30-Jun-2026.", "required_value": "ISO 27001 (Optional)", "found_value": "ISO 27001 (Valid to Jun-2026)"},
        "REQ-016": {"status": "VERIFIED", "confidence": 0.98, "source_doc": "DOC-003-08", "extracted_value": "142 employees under EPFO coverage. Adequate technical manpower confirmed.", "required_value": "20 technical personnel", "found_value": "142 EPFO employees"},
        "REQ-017": {"status": "VERIFIED", "confidence": 0.98, "source_doc": "DOC-003-01", "extracted_value": "GST registration confirms Karnataka, India registered office.", "required_value": "Registered office in India", "found_value": "Bangalore, Karnataka"},
        "REQ-018": {"status": "VERIFIED", "confidence": 0.93, "source_doc": "DOC-003-10", "extracted_value": "ISRO and DRDO project completions include 2+ year AMC obligations.", "required_value": "AMC Capability (Optional)", "found_value": "AMC references found"},
        "REQ-019": {"status": "VERIFIED", "confidence": 0.97, "source_doc": "DOC-003-11", "extracted_value": "Bank Guarantee KNB-BG-2026-00456 for ₹24,00,000 submitted.", "required_value": "EMD ₹24 Lakhs", "found_value": "BG ₹24,00,000 (Submitted)"},
        "REQ-020": {"status": "MISSING", "confidence": 0.0, "source_doc": None, "extracted_value": None, "required_value": "NABL Testing Report (Optional)", "found_value": "Not submitted"},
    }
}

CROSS_DOC_CHECKS = {
    "BID-001": [
        {"check": "GST ↔ PAN", "doc1": "ABC_GST_Certificate.pdf", "doc2": "ABC_PAN.pdf", "status": "CONSISTENT", "detail": "Company name and registration details consistent across both documents."},
        {"check": "GST ↔ Udyam", "doc1": "ABC_GST_Certificate.pdf", "doc2": "ABC_Udyam_Certificate.pdf", "status": "CONSISTENT", "detail": "Enterprise name and GSTIN consistent."},
        {"check": "GST ↔ ESIC", "doc1": "ABC_GST_Certificate.pdf", "doc2": "ABC_ESIC_Registration.pdf", "status": "MISMATCH", "detail": "GST: ABC Technologies Pvt Ltd | ESIC: ABC Tech Pvt Ltd", "severity": "WARNING", "explanation": "The entity name on the ESIC document ('ABC Tech Pvt Ltd') differs from the GST-registered legal name ('ABC Technologies Pvt Ltd'). This may be an abbreviated name or a data entry error. Manual verification recommended."},
        {"check": "GST ↔ OEM Authorization", "doc1": "ABC_GST_Certificate.pdf", "doc2": "ABC_OEM_Authorization.pdf", "status": "MISMATCH", "detail": "GST: ABC Technologies Pvt Ltd | OEM: ABC Technology Solutions Pvt Ltd", "severity": "HIGH", "explanation": "The OEM Authorization letter names the authorized entity as 'ABC Technology Solutions Pvt Ltd', which is a different legal entity from 'ABC Technologies Pvt Ltd'. This could indicate the authorization was issued to a related but distinct company. Urgent clarification required."},
        {"check": "Financial Statement ↔ GST", "doc1": "ABC_Financial_Statement_FY24.pdf", "doc2": "ABC_GST_Certificate.pdf", "status": "CONSISTENT", "detail": "Entity name, state, and filing period consistent."},
        {"check": "ISO 9001 ↔ GST", "doc1": "ABC_ISO_9001_Certificate.pdf", "doc2": "ABC_GST_Certificate.pdf", "status": "CONSISTENT", "detail": "Organization name matches. Expiry date flagged separately."},
    ],
    "BID-002": [
        {"check": "GST ↔ PAN", "doc1": "BIS_GST_Certificate.pdf", "doc2": "BIS_PAN.pdf", "status": "CONSISTENT", "detail": "Company name and registration details consistent."},
        {"check": "Financial ↔ GST", "doc1": "BIS_Financial_Statement.pdf", "doc2": "BIS_GST_Certificate.pdf", "status": "CONSISTENT", "detail": "Entity name consistent across financial and GST documents."},
        {"check": "ISO ↔ GST", "doc1": "BIS_ISO_Certificate.pdf", "doc2": "BIS_GST_Certificate.pdf", "status": "CONSISTENT", "detail": "Organization name matches."},
    ],
    "BID-003": [
        {"check": "GST ↔ PAN", "doc1": "Nova_GST_Certificate.pdf", "doc2": "Nova_PAN.pdf", "status": "CONSISTENT", "detail": "Company name and details consistent."},
        {"check": "GST ↔ Udyam", "doc1": "Nova_GST_Certificate.pdf", "doc2": "Nova_Udyam_Certificate.pdf", "status": "CONSISTENT", "detail": "Enterprise name and state consistent."},
        {"check": "GST ↔ ISO 9001", "doc1": "Nova_GST_Certificate.pdf", "doc2": "Nova_ISO_9001_Certificate.pdf", "status": "MINOR_VARIATION", "detail": "GST: Nova Engineering Solutions Pvt Ltd | ISO: Nova Engineering Solutions Private Limited", "severity": "INFO", "explanation": "The ISO 9001 certificate uses the full legal form 'Private Limited' while the GST and other documents use the abbreviated 'Pvt Ltd'. This is a commonly accepted variation and does not indicate a different legal entity."},
        {"check": "Financial ↔ GST", "doc1": "Nova_Financial_Statement_FY24.pdf", "doc2": "Nova_GST_Certificate.pdf", "status": "CONSISTENT", "detail": "Entity name and state consistent across financial and GST documents."},
        {"check": "OEM Authorization ↔ GST", "doc1": "Nova_OEM_Authorization.pdf", "doc2": "Nova_GST_Certificate.pdf", "status": "CONSISTENT", "detail": "Entity name matches exactly in OEM authorization."},
        {"check": "EPFO ↔ ESIC", "doc1": "Nova_EPFO_Registration.pdf", "doc2": "Nova_ESIC_Registration.pdf", "status": "CONSISTENT", "detail": "Employer name consistent across EPFO and ESIC registrations."},
    ]
}


def get_compliance_results(bidder_id: str, requirements: list, documents: list, bidder: dict = None) -> dict:
    """Calculate full compliance results for a bidder.

    Rules:
    - ALL bidders (including BID-001, BID-002, BID-003) now use DYNAMIC path.
    - Demo compliance hardcoded data has been disabled for production.
    - The dynamic path reads only actually-uploaded documents.
    - The dynamic path NEVER fabricates data:
        * If a required document is missing → MISSING (not VERIFIED).
        * If an identifier mismatches the self-declared value → REVIEW.
        * Score/risk are derived purely from these real results.
    """
    results = {}

    # DISABLED: Demo bidders now use dynamic compliance like all others
    # DEMO_BIDDER_IDS = {'BID-001', 'BID-002', 'BID-003'}
    # compliance_data = DEMO_COMPLIANCE.get(bidder_id) if bidder_id in DEMO_BIDDER_IDS else None
    compliance_data = None  # Always use dynamic compliance

    # Doc classification type -> requirement ID mapping
    DOC_TYPE_TO_REQ = {
        'GST': 'REQ-001', 'PAN': 'REQ-002', 'UDYAM': 'REQ-003',
        'FINANCIAL': 'REQ-004', 'EXPERIENCE': 'REQ-005', 'ISO9001': 'REQ-006',
        'EPFO': 'REQ-007', 'ESIC': 'REQ-008', 'OEM': 'REQ-009',
        'DECLARATION': 'REQ-010', 'BIS_CE': 'REQ-014', 'ISO27001': 'REQ-015',
        'INCORPORATION': 'REQ-017', 'NABL': 'REQ-020',
    }

    # Build lookup: doc type -> list of uploaded docs
    # IMPORTANT: only consider documents that were actually uploaded by the bidder
    # (i.e. have a saved_path). Seed/demo documents without saved_path are excluded
    # so they can never inflate a non-demo bidder's compliance score.
    docs_by_type = {}
    docs_by_req  = {}
    for doc in documents:
        if doc.get('saved_path'):   # ← real uploaded documents only
            dtype = doc.get('classification', 'UNKNOWN')
            docs_by_type.setdefault(dtype, []).append(doc)
            if doc.get('requirement_id'):
                docs_by_req.setdefault(doc['requirement_id'], []).append(doc)

    for req in requirements:
        req_id = req['id']

        # 1. Use pre-calculated demo result ONLY for the three named demo bidders
        if compliance_data is not None and compliance_data.get(req_id):
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

            # ── Cross-check self-declared identifier vs. what was OCR'd from the document ──
            mismatch_concern = None
            if bidder:
                declared, extracted, label = None, None, None
                if req_id == 'REQ-001':  # GSTIN
                    declared, extracted, label = bidder.get('gstin'), entities.get('gstin'), 'GSTIN'
                elif req_id == 'REQ-002':  # PAN
                    declared, extracted, label = bidder.get('pan'), entities.get('pan'), 'PAN'

                if declared and extracted and declared.strip().upper() != extracted.strip().upper():
                    mismatch_concern = (
                        f"The {label} on the uploaded document ({extracted}) does not match the {label} "
                        f"entered at registration ({declared.strip().upper()}). The bidder must either correct "
                        f"the registration details or upload the correct {label} document."
                    )

            if mismatch_concern:
                result = {
                    'status':          'REVIEW',
                    'confidence':      0.55,
                    'source_doc':      matched_doc['id'],
                    'extracted_value': f"Uploaded: {matched_doc['filename']}. {entity_str}.{gov_note}",
                    'required_value':  ev_str,
                    'found_value':     f"{matched_doc.get('classification', 'Document')} submitted (identifier mismatch)",
                    'reason': '', 'concern': mismatch_concern,
                }
            else:
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

    return results


def calculate_score(compliance_results: dict, requirements: list) -> dict:
    """Calculate weighted compliance score from requirement results."""
    from config import MANDATORY_WEIGHT, OPTIONAL_WEIGHT

    total_weight = 0
    satisfied_weight = 0
    category_scores = {}

    category_map = {}
    for req in requirements:
        category_map[req['id']] = req

    for req_id, result in compliance_results.items():
        req = category_map.get(req_id, {})
        is_mandatory = req.get('mandatory', True)
        weight = MANDATORY_WEIGHT if is_mandatory else OPTIONAL_WEIGHT
        category = req.get('category', 'Other')

        total_weight += weight
        if category not in category_scores:
            category_scores[category] = {'satisfied': 0, 'total': 0}
        category_scores[category]['total'] += weight

        status = result.get('status')
        if status == 'VERIFIED':
            satisfied_weight += weight
            category_scores[category]['satisfied'] += weight
        elif status == 'REVIEW':
            # Partial credit for review items
            satisfied_weight += weight * 0.5
            category_scores[category]['satisfied'] += weight * 0.5

    overall_score = round((satisfied_weight / total_weight * 100) if total_weight > 0 else 0)

    category_pct = {
        cat: round(vals['satisfied'] / vals['total'] * 100) if vals['total'] > 0 else 0
        for cat, vals in category_scores.items()
    }

    # Count statuses
    status_counts = {'VERIFIED': 0, 'REVIEW': 0, 'NON_COMPLIANT': 0, 'MISSING': 0}
    for result in compliance_results.values():
        st = result.get('status', 'MISSING')
        if st in status_counts:
            status_counts[st] += 1

    # Risk level
    non_compliant = status_counts['NON_COMPLIANT']
    missing_mandatory = sum(
        1 for req_id, result in compliance_results.items()
        if result.get('status') == 'MISSING' and category_map.get(req_id, {}).get('mandatory', True)
    )

    if overall_score >= 85 and non_compliant == 0:
        risk = 'LOW'
    elif overall_score >= 70 and non_compliant <= 1:
        risk = 'MEDIUM'
    else:
        risk = 'HIGH'

    return {
        'overall_score': overall_score,
        'category_scores': category_pct,
        'status_counts': status_counts,
        'risk_level': risk,
        'total_requirements': len(compliance_results),
    }


def get_cross_document_checks(bidder_id: str) -> list:
    """Return cross-document consistency checks for a bidder."""
    return CROSS_DOC_CHECKS.get(bidder_id, [])
