"""
db.py — SQLAlchemy models for Veritas AI

One table per data file (22 tables) plus a small key/value table for the
non-list JSON files (e.g. compliance.json).

Storage design
--------------
Every record keeps TWO representations:

* typed columns  -> queryable from SQL / BI tools / the Supabase table editor
* ``doc``        -> the complete original record as JSON

The application reads ``doc`` so that no field is ever lost (the typed
columns only cover the fields the schema knows about), and ``pos`` keeps the
original list order (the code base was written against ordered JSON lists).

``JSONB`` below is a portable type: real JSONB on PostgreSQL, plain JSON on
SQLite (used for zero-config local development).
"""
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import (
    Column, String, Integer, Float, Boolean,
    DateTime, Text, BigInteger, JSON
)
from sqlalchemy.dialects.postgresql import JSONB as _PG_JSONB

JSONB = JSON().with_variant(_PG_JSONB(), 'postgresql')

db = SQLAlchemy()


class _Record(db.Model):
    """Abstract base: adds the full-record ``doc`` and list position ``pos``."""
    __abstract__ = True
    doc = Column(JSONB)          # complete original record (source of truth)
    pos = Column(Integer)        # position in the original list (ordering)


class User(_Record):
    __tablename__ = 'users'
    id              = Column(String, primary_key=True)
    email           = Column(String, unique=True, nullable=False)
    password        = Column(String, nullable=False)
    name            = Column(String)
    role            = Column(String)          # OFFICER | BIDDER | STAKEHOLDER
    department      = Column(String)
    employee_id     = Column(String)
    organization_id = Column(String)          # for BIDDER accounts
    last_login      = Column(String)
    active          = Column(Boolean, default=True)


class Tender(_Record):
    __tablename__ = 'tenders'
    id                          = Column(String, primary_key=True)
    title                       = Column(String)
    department                  = Column(String)
    organisation                = Column(String)
    estimated_value             = Column(BigInteger)
    estimated_value_display     = Column(String)
    submission_deadline         = Column(String)
    original_submission_deadline= Column(String)
    opening_date                = Column(String)
    prebid_date                 = Column(String)
    category                    = Column(String)
    location                    = Column(String)
    description                 = Column(Text)
    status                      = Column(String)
    workflow_stage              = Column(String)
    cancelled                   = Column(Boolean, default=False)
    cancellation_reason         = Column(Text)
    cancelled_at                = Column(String)
    cancelled_by                = Column(String)
    parent_tender_id            = Column(String)
    emd_amount                  = Column(BigInteger)
    emd_amount_display          = Column(String)
    performance_security_pct    = Column(Integer)
    created_by                  = Column(String)
    created_at                  = Column(String)
    # JSONB for nested structures
    policy                      = Column(JSONB, default=dict)
    requirement_ids             = Column(JSONB, default=list)
    bidder_ids                  = Column(JSONB, default=list)
    deadline_extensions         = Column(JSONB, default=list)
    corrigenda                  = Column(JSONB, default=list)
    prebid_questions            = Column(JSONB, default=list)
    prebid_meeting              = Column(JSONB, default=dict)


class Requirement(_Record):
    __tablename__ = 'requirements'
    id                  = Column(String, primary_key=True)
    tender_id           = Column(String)
    title               = Column(String)
    category            = Column(String)
    mandatory           = Column(Boolean, default=True)
    description         = Column(Text)
    verification_type   = Column(String)
    threshold           = Column(Float)
    threshold_display   = Column(String)
    unit                = Column(String)
    required_evidence   = Column(JSONB, default=list)


class Bidder(_Record):
    __tablename__ = 'bidders'
    id                  = Column(String, primary_key=True)
    tender_id           = Column(String)
    name                = Column(String)
    short_name          = Column(String)
    gstin               = Column(String)
    pan                 = Column(String)
    cin                 = Column(String)
    udyam_no            = Column(String)
    email               = Column(String)
    phone               = Column(String)
    address             = Column(Text)
    state               = Column(String)
    incorporation_year  = Column(Integer)
    type                = Column(String)
    contact_person      = Column(String)
    status              = Column(String)
    compliance_score    = Column(Float)
    risk_level          = Column(String)
    submitted_at        = Column(String)
    analyzed_at         = Column(String)
    document_ids        = Column(JSONB, default=list)
    # Officer decision fields
    officer_decision    = Column(String)
    officer_remarks     = Column(Text)
    decision_officer    = Column(String)
    decision_officer_id = Column(String)
    decision_timestamp  = Column(String)
    rejection_category  = Column(String)
    rejection_stage     = Column(String)
    rejection_reason    = Column(Text)
    is_disqualified     = Column(Boolean, default=False)
    # Extracted identity
    extracted_pan       = Column(String)
    pan_status          = Column(String)
    pan_source_doc      = Column(String)
    extracted_gstin     = Column(String)
    gstin_status        = Column(String)
    gstin_source_doc    = Column(String)


class Document(_Record):
    __tablename__ = 'documents'
    id              = Column(String, primary_key=True)
    bidder_id       = Column(String)
    tender_id       = Column(String)
    requirement_id  = Column(String)
    filename        = Column(String)
    doc_type        = Column(String)
    classification  = Column(String)
    confidence      = Column(Float)
    pages           = Column(Integer)
    extracted_text  = Column(Text)
    status          = Column(String)
    uploaded_at     = Column(String)
    saved_path      = Column(String)
    file_size       = Column(Integer)
    extracted_entities = Column(JSONB, default=dict)
    tampering_signals  = Column(JSONB, default=list)
    tampered        = Column(Boolean, default=False)
    suspicious      = Column(Boolean, default=False)
    reprocessed     = Column(Boolean, default=False)


class Bid(_Record):
    __tablename__ = 'bids'
    id                      = Column(String, primary_key=True)
    tender_id               = Column(String)
    bidder_id               = Column(String)
    bidder_name             = Column(String)
    status                  = Column(String)
    submitted_at            = Column(String)
    last_updated            = Column(String)
    compliance_score        = Column(Float)
    risk_level              = Column(String)
    technical_status        = Column(String)
    financial_bid_opened    = Column(Boolean, default=False)
    financial_opened_at     = Column(String)
    quoted_price            = Column(BigInteger)
    quoted_price_display    = Column(String)
    payment_terms           = Column(String)
    delivery_period_days    = Column(Integer)
    emd_submitted           = Column(Boolean, default=False)
    emd_amount              = Column(BigInteger)
    emd_reference           = Column(String)
    emd_verification        = Column(JSONB, default=dict)
    # JSONB fields
    stage_history           = Column(JSONB, default=list)
    technical_scores        = Column(JSONB, default=dict)
    price_analysis          = Column(JSONB, default=dict)
    modifications           = Column(JSONB, default=list)
    price_breakdown         = Column(JSONB, default=dict)
    committee_scores        = Column(JSONB, default=list)
    preference_verification = Column(JSONB, default=dict)
    local_content_verification = Column(JSONB, default=dict)
    oem_verification        = Column(JSONB, default=dict)


class Contract(_Record):
    __tablename__ = 'contracts'
    id                      = Column(String, primary_key=True)
    tender_id               = Column(String)
    bid_id                  = Column(String)
    bidder_id               = Column(String)
    bidder_name             = Column(String)
    awarded_by              = Column(String)
    awarded_by_id           = Column(String)
    awarded_at              = Column(String)
    contract_value          = Column(BigInteger)
    contract_value_display  = Column(String)
    delivery_deadline       = Column(String)
    delivery_address        = Column(Text)
    payment_terms           = Column(String)
    advance_payment_pct     = Column(Integer)
    status                  = Column(String)
    milestones              = Column(JSONB, default=list)
    inspections             = Column(JSONB, default=list)


class AuditEntry(_Record):
    __tablename__ = 'audit'
    id                  = Column(String, primary_key=True)
    timestamp           = Column(String)
    actor               = Column(String)
    action              = Column(String)
    detail              = Column(Text)
    tender_id           = Column(String)
    bidder_id           = Column(String)
    severity            = Column(String)
    rejection_category  = Column(String)
    rejection_stage     = Column(String)
    rejection_reason    = Column(Text)


class Notification(_Record):
    __tablename__ = 'notifications'
    id              = Column(String, primary_key=True)
    type            = Column(String)
    title           = Column(String)
    message         = Column(Text)
    recipient_id    = Column(String)
    recipient_role  = Column(String)
    broadcast       = Column(Boolean, default=False)
    tender_id       = Column(String)
    bid_id          = Column(String)
    priority        = Column(String)
    read            = Column(Boolean, default=False)
    created_at      = Column(String)
    read_at         = Column(String)


class Feedback(_Record):
    __tablename__ = 'feedback'
    id              = Column(String, primary_key=True)
    tender_id       = Column(String)
    submitted_by    = Column(String)
    submitter_name  = Column(String)
    category        = Column(String)
    subject         = Column(String)
    description     = Column(Text)
    priority        = Column(String)
    ai_priority     = Column(String)
    status          = Column(String)
    submitted_at    = Column(String)
    assigned_to     = Column(String)
    public_response = Column(Text)
    internal_notes  = Column(Text)
    resolved_at     = Column(String)


class Grievance(_Record):
    __tablename__ = 'grievances'
    id              = Column(String, primary_key=True)
    tender_id       = Column(String)
    bid_id          = Column(String)
    bidder_id       = Column(String)
    submitter_id    = Column(String)
    submitter_name  = Column(String)
    submitter_role  = Column(String)
    category        = Column(String)
    subject         = Column(String)
    description     = Column(Text)
    status          = Column(String)
    priority        = Column(String)
    submitted_at    = Column(String)
    assigned_to     = Column(String)
    assigned_at     = Column(String)
    officer_response= Column(Text)
    responded_at    = Column(String)
    public_note     = Column(Text)
    internal_notes  = Column(Text)
    resolved_at     = Column(String)
    supporting_docs = Column(JSONB, default=list)


class Clarification(_Record):
    __tablename__ = 'clarifications'
    id              = Column(String, primary_key=True)
    tender_id       = Column(String)
    bid_id          = Column(String)
    bidder_id       = Column(String)
    requirement_id  = Column(String)
    requested_by    = Column(String)
    requested_at    = Column(String)
    subject         = Column(String)
    message         = Column(Text)
    status          = Column(String)
    response        = Column(Text)
    responded_at    = Column(String)
    resolved_by     = Column(String)


class EvaluationTask(_Record):
    __tablename__ = 'evaluation_tasks'
    id              = Column(String, primary_key=True)
    tender_id       = Column(String)
    bid_id          = Column(String)
    bidder_id       = Column(String)
    bidder_name     = Column(String)
    task_type       = Column(String)
    title           = Column(String)
    assigned_to     = Column(String)
    assigned_to_id  = Column(String)
    priority        = Column(String)
    status          = Column(String)
    created_at      = Column(String)
    due_date        = Column(String)
    completed_at    = Column(String)
    notes           = Column(Text)
    score           = Column(Float)
    criteria        = Column(JSONB, default=list)


class EvalCommittee(_Record):
    __tablename__ = 'eval_committees'
    id              = Column(String, primary_key=True)
    tender_id       = Column(String)
    formed_by       = Column(String)
    formed_at       = Column(String)
    updated_at      = Column(String)
    status          = Column(String)
    aggregate_method= Column(String)
    members         = Column(JSONB, default=list)
    scores          = Column(JSONB, default=dict)


class Inspection(_Record):
    __tablename__ = 'inspections'
    id              = Column(String, primary_key=True)
    contract_id     = Column(String)
    tender_id       = Column(String)
    bidder_id       = Column(String)
    milestone_id    = Column(String)
    inspection_type = Column(String)
    inspector       = Column(String)
    inspector_id    = Column(String)
    inspected_at    = Column(String)
    status          = Column(String)
    notes           = Column(Text)
    items           = Column(JSONB, default=list)
    attachments     = Column(JSONB, default=list)


class CorrectiveAction(_Record):
    __tablename__ = 'corrective_actions'
    id              = Column(String, primary_key=True)
    inspection_id   = Column(String)
    contract_id     = Column(String)
    bidder_id       = Column(String)
    issued_by       = Column(String)
    issued_at       = Column(String)
    deadline        = Column(String)
    type            = Column(String)
    description     = Column(Text)
    status          = Column(String)
    resolved_at     = Column(String)
    vendor_response = Column(Text)
    resolution_notes= Column(Text)


class VendorProfile(_Record):
    __tablename__ = 'vendor_profiles'
    id                          = Column(String, primary_key=True)
    bidder_id                   = Column(String, unique=True)
    bidder_name                 = Column(String)
    gstin                       = Column(String)
    pan                         = Column(String)
    registration_date           = Column(String)
    total_tenders_participated  = Column(Integer, default=0)
    total_contracts_awarded     = Column(Integer, default=0)
    active_contracts            = Column(Integer, default=0)
    on_time_delivery_rate       = Column(Float)
    quality_pass_rate           = Column(Float)
    avg_compliance_score        = Column(Float)
    blacklisted                 = Column(Boolean, default=False)
    performance_history         = Column(JSONB, default=list)
    certifications              = Column(JSONB, default=list)
    past_projects               = Column(JSONB, default=list)


class ConflictDeclaration(_Record):
    __tablename__ = 'conflict_declarations'
    id              = Column(String, primary_key=True)
    tender_id       = Column(String)
    bidder_id       = Column(String)
    declared_by     = Column(String)
    declared_at     = Column(String)
    has_conflict    = Column(Boolean, default=False)
    conflict_details= Column(Text)
    status          = Column(String)


class AIOverride(_Record):
    __tablename__ = 'ai_overrides'
    id              = Column(String, primary_key=True)
    entity_type     = Column(String)
    entity_id       = Column(String)
    field           = Column(String)
    original_value  = Column(Text)
    override_value  = Column(Text)
    reason          = Column(Text)
    officer         = Column(String)
    overridden_at   = Column(String)


class RejectionFeedback(_Record):
    __tablename__ = 'rejection_feedback'
    id                  = Column(String, primary_key=True)
    bidder_id           = Column(String)
    bidder_name         = Column(String)
    tender_id           = Column(String)
    officer             = Column(String)
    officer_id          = Column(String)
    decision            = Column(String)
    rejection_stage     = Column(String)
    rejection_category  = Column(String)
    rejection_reason    = Column(Text)
    officer_remarks     = Column(Text)
    additional_feedback = Column(Text)
    feedback_sent_at    = Column(String)
    feedback_sent_by    = Column(String)
    created_at          = Column(String)
    read_by_bidder      = Column(Boolean, default=False)
    read_at             = Column(String)


class Translation(db.Model):
    __tablename__ = 'translations'
    cache_key   = Column(String, primary_key=True)
    translation = Column(Text)


class KVStore(db.Model):
    """Non-list JSON documents (e.g. compliance.json), keyed by file name."""
    __tablename__ = 'kv_store'
    key   = Column(String, primary_key=True)
    value = Column(JSONB)
