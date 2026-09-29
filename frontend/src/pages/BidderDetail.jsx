import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ChevronRight, Building2, Mail, Phone, MapPin, Calendar,
  FileText, CheckCircle, AlertTriangle, XCircle, MinusCircle,
  ArrowRight, Upload, BarChart2, RefreshCw, Eye, Fingerprint,
  ShieldAlert, AlertCircle, Info
} from 'lucide-react'
import { getBidder, getBidderDocuments, analyzeBidder, getBidderTamperingSummary, getTenderRequirements } from '../services/api.js'
import ScoreRing from '../components/ScoreRing.jsx'
import { RiskBadge } from '../components/StatusBadge.jsx'
import { PageLoader } from '../components/LoadingSkeleton.jsx'
import { useToast } from '../components/Toast.jsx'
import DocumentViewer from '../components/DocumentViewer.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'

const DOC_TYPE_COLORS = {
  GST: 'bg-blue-50 text-blue-700',
  PAN: 'bg-indigo-50 text-indigo-700',
  UDYAM: 'bg-purple-50 text-purple-700',
  ISO9001: 'bg-teal-50 text-teal-700',
  ISO27001: 'bg-teal-50 text-teal-700',
  ISO: 'bg-teal-50 text-teal-700',
  FINANCIAL: 'bg-green-50 text-green-700',
  OEM: 'bg-orange-50 text-orange-700',
  EPFO: 'bg-cyan-50 text-cyan-700',
  ESIC: 'bg-sky-50 text-sky-700',
  EXPERIENCE: 'bg-amber-50 text-amber-700',
  DECLARATION: 'bg-rose-50 text-rose-700',
  DEFAULT: 'bg-gray-100 text-gray-600',
}

// ── Helpers ───────────────────────────────────────────────────

/** Render a value or "—" if null/empty. Never shows fallback strings. */
function val(v) {
  if (v === null || v === undefined) return '—'
  const s = String(v).trim()
  return s || '—'
}

/** PAN status → badge style */
const PAN_STATUS_STYLE = {
  VERIFIED:     'bg-green-50 text-green-700 border border-green-200',
  MISMATCH:     'bg-red-50 text-red-700 border border-red-200',
  NEEDS_REVIEW: 'bg-amber-50 text-amber-700 border border-amber-200',
  NOT_FOUND:    'bg-gray-100 text-gray-500 border border-gray-200',
}
const PAN_STATUS_ICON = {
  VERIFIED:     <CheckCircle size={11} className="flex-shrink-0" />,
  MISMATCH:     <XCircle size={11} className="flex-shrink-0" />,
  NEEDS_REVIEW: <AlertTriangle size={11} className="flex-shrink-0" />,
  NOT_FOUND:    <MinusCircle size={11} className="flex-shrink-0" />,
}

/** Render the PAN / GSTIN cell — shows extracted value + status badge */
function IdCell({ label, extracted, extractedStatus, declared, sourceDocId }) {
  const displayValue = extracted || '—'
  const style = PAN_STATUS_STYLE[extractedStatus] || PAN_STATUS_STYLE.NOT_FOUND
  const icon  = PAN_STATUS_ICON[extractedStatus]  || PAN_STATUS_ICON.NOT_FOUND
  const statusLabel = extractedStatus === 'VERIFIED'     ? 'Verified'
                    : extractedStatus === 'MISMATCH'     ? 'Mismatch'
                    : extractedStatus === 'NEEDS_REVIEW' ? 'Needs Review'
                    : '—'

  return (
    <div className="stat-card">
      <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-1">{label}</p>
      <p className="text-sm font-bold text-slate-800 font-mono leading-snug">{displayValue}</p>
      {extractedStatus && extractedStatus !== 'NOT_FOUND' && (
        <span className={`inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded mt-1 ${style}`}>
          {icon} {statusLabel}
        </span>
      )}
      {extractedStatus === 'MISMATCH' && declared && extracted && (
        <p className="text-[9px] text-red-600 mt-0.5 leading-snug">
          Registered: <span className="font-mono">{declared}</span>
        </p>
      )}
      {extractedStatus === 'NOT_FOUND' && (
        <p className="text-[9px] text-gray-400 mt-0.5">No document uploaded</p>
      )}
      {extractedStatus === 'NEEDS_REVIEW' && (
        <p className="text-[9px] text-amber-600 mt-0.5 leading-snug">
          Low OCR confidence — officer review required
        </p>
      )}
      <p className="text-[9px] text-gray-300 mt-0.5">
        Source: {sourceDocId ? 'Uploaded document' : 'Not extracted'}
      </p>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────

export default function BidderDetail() {
  const { bidderId } = useParams()
  const navigate = useNavigate()
  const { addToast: showToast } = useToast()
  const { t } = useLanguage()

  // ── Split loading states (never one global lock) ──────────────
  const [bidderLoading,    setBidderLoading]    = useState(true)
  const [documentsLoading, setDocumentsLoading] = useState(true)
  const [tamperingLoading, setTamperingLoading] = useState(true)

  const [bidder,    setBidder]    = useState(null)
  const [documents, setDocuments] = useState([])
  const [tampering, setTampering] = useState(null)
  const [requirementCount, setRequirementCount] = useState(null)

  // Error states — each section tracks its own failure
  const [bidderError,    setBidderError]    = useState(null)
  const [documentsError, setDocumentsError] = useState(null)

  const [analyzing, setAnalyzing] = useState(false)

  // Document viewer
  const [viewerDocId, setViewerDocId] = useState(null)
  const [viewerIndex, setViewerIndex] = useState(0)

  // ── Data fetching ─────────────────────────────────────────────

  const loadBidder = useCallback(() => {
    setBidderLoading(true)
    setBidderError(null)
    getBidder(bidderId)
      .then((res) => setBidder(res.data))
      .catch(() => setBidderError('Unable to load bidder details. Please try again.'))
      .finally(() => setBidderLoading(false))
  }, [bidderId])

  const loadDocuments = useCallback(() => {
    setDocumentsLoading(true)
    setDocumentsError(null)
    getBidderDocuments(bidderId)
      .then((res) => setDocuments(res.data || []))
      .catch(() => setDocumentsError('Unable to load documents.'))
      .finally(() => setDocumentsLoading(false))
  }, [bidderId])

  const loadTampering = useCallback(() => {
    setTamperingLoading(true)
    getBidderTamperingSummary(bidderId)
      .then((res) => setTampering(res?.data || null))
      .catch(() => setTampering(null))  // non-critical — silent failure OK
      .finally(() => setTamperingLoading(false))
  }, [bidderId])

  // Number of requirements in this bidder's tender (was hardcoded as 20)
  useEffect(() => {
    if (!bidder?.tender_id) return
    getTenderRequirements(bidder.tender_id)
      .then((res) => setRequirementCount(Array.isArray(res.data) ? res.data.length : null))
      .catch(() => setRequirementCount(null))
  }, [bidder?.tender_id])

  // Fire all three independently so one failure doesn't block the others
  useEffect(() => {
    loadBidder()
    loadDocuments()
    loadTampering()
  }, [loadBidder, loadDocuments, loadTampering])

  // Reload bidder record after analysis (score/risk updated server-side)
  const handleAnalyze = async () => {
    setAnalyzing(true)
    showToast('Starting compliance analysis…', 'info')
    try {
      await analyzeBidder(bidderId)
      showToast('Analysis complete! Redirecting to compliance results…', 'success')
      setTimeout(() => navigate(`/bidders/${bidderId}/compliance`), 1200)
    } catch {
      showToast('Analysis failed. Please try again.', 'error')
    } finally {
      setAnalyzing(false)
    }
  }

  // ── Loading phase — only block on bidder (core data) ─────────
  if (bidderLoading) return <PageLoader />

  // ── Bidder fetch failed ───────────────────────────────────────
  if (bidderError || !bidder) {
    return (
      <div className="p-6 max-w-lg">
        <div className="card p-6 flex flex-col items-center gap-4 text-center">
          <AlertCircle size={32} className="text-red-400" />
          <div>
            <p className="text-sm font-semibold text-slate-700">
              {bidderError || 'Bidder not found.'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              The bidder record may have been deleted or the ID is invalid.
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary text-xs" onClick={loadBidder}>
              <RefreshCw size={13} /> Retry
            </button>
            <button className="btn-secondary text-xs" onClick={() => navigate(-1)}>
              ← Go Back
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Derived display values — always null-safe ─────────────────
  const tenderId = bidder.tender_id || 'GEM-DEMO-2026-001'

  // Core identity — from bidder registration (self-declared)
  const displayName  = val(bidder.name)
  const displayType  = val(bidder.type)
  const displayYear  = val(bidder.incorporation_year)
  const displayEmail = val(bidder.email)
  const displayPhone = val(bidder.phone)
  const displayAddr  = bidder.address ? String(bidder.address).trim() : null

  // Identity from uploaded documents (extracted by OCR — authoritative)
  const extractedPan    = bidder.extracted_pan   || null
  const panStatus       = bidder.pan_status       || null
  const panSourceDoc    = bidder.pan_source_doc   || null
  const declaredPan     = bidder.pan              || null  // self-declared at registration

  const extractedGstin  = bidder.extracted_gstin  || null
  const gstinStatus     = bidder.gstin_status      || null
  const gstinSourceDoc  = bidder.gstin_source_doc  || null
  const declaredGstin   = bidder.gstin             || null

  const displayUdyam    = val(bidder.udyam_no)

  const docCount = documents.length

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-5 max-w-5xl">

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate('/tenders')}>{t('tenders')}</span>
        <ChevronRight size={12} />
        <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate(`/tenders/${tenderId}`)}>{tenderId}</span>
        <ChevronRight size={12} />
        <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate(`/tenders/${tenderId}/bidders`)}>{t('bidders')}</span>
        <ChevronRight size={12} />
        <span className="text-slate-700 font-medium">{displayName}</span>
      </div>

      {/* ── Header Card ─────────────────────────────────────────── */}
      <div className="card p-6">
        <div className="flex items-start gap-6">
          <div className="flex-shrink-0">
            <ScoreRing score={bidder.compliance_score || 0} size={90} strokeWidth={7} />
            <p className="text-center text-[10px] text-gray-500 mt-1">Compliance</p>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-slate-800">{displayName}</h1>
                <p className="text-xs text-gray-500 mt-0.5">{bidder.id}</p>
                <div className="flex items-center gap-2 mt-2">
                  <RiskBadge risk={bidder.risk_level || 'UNKNOWN'} />
                  <span className={`status-badge ${
                    bidder.status === 'analyzed'
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : 'bg-gray-100 text-gray-500 border border-gray-200'
                  }`}>
                    {bidder.status === 'analyzed' ? t('analysis_complete') : t('pending_analysis')}
                  </span>
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  className="btn-primary"
                  onClick={() => navigate(`/bidders/${bidderId}/compliance`)}
                >
                  <BarChart2 size={15} /> {t('view_compliance')}
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => navigate(`/vendor-profiles/${bidderId}`)}
                >
                  <Upload size={14} /> {t('vendor_360')}
                </button>
                <button
                  className="btn-secondary"
                  onClick={handleAnalyze}
                  disabled={analyzing}
                >
                  {analyzing
                    ? <RefreshCw size={14} className="animate-spin" />
                    : <RefreshCw size={14} />}
                  {t('re_analyze')}
                </button>
              </div>
            </div>

            {/* ── Basic info — 4 fields from registration (self-declared) ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-100">
              {[
                { icon: Building2, label: 'Type',         value: displayType  },
                { icon: Calendar,  label: 'Incorporated', value: displayYear  },
                { icon: Mail,      label: 'Email',        value: displayEmail },
                { icon: Phone,     label: 'Phone',        value: displayPhone },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label}>
                  <p className="text-[10px] text-gray-400 font-medium flex items-center gap-1 uppercase tracking-wide">
                    <Icon size={10} /> {label}
                  </p>
                  <p className="text-xs font-semibold text-slate-700 mt-0.5 truncate">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Address */}
        {displayAddr && (
          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-500">
            <MapPin size={12} />
            <span>{displayAddr}</span>
          </div>
        )}
      </div>

      {/* ── Registration / Identity Fields ─────────────────────── */}
      {/* Show the document-extracted identity only — not the raw registration values.
          If no documents uploaded yet, show the pending banner. */}
      {docCount > 0 ? (
        <>
          {/* PAN mismatch alert — shown prominently if the uploaded document
              doesn't match what was registered */}
          {panStatus === 'MISMATCH' && (
            <div className="card p-4 border-l-4 border-l-red-500 bg-red-50 flex items-start gap-3">
              <XCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-800">PAN Mismatch Detected</p>
                <p className="text-xs text-red-700 mt-0.5 leading-relaxed">
                  The PAN on the uploaded document (<span className="font-mono font-bold">{extractedPan}</span>)
                  does not match the PAN entered at registration (<span className="font-mono font-bold">{declaredPan}</span>).
                  The officer must verify which is correct before proceeding.
                </p>
              </div>
            </div>
          )}

          {/* NEEDS_REVIEW alert for PAN */}
          {panStatus === 'NEEDS_REVIEW' && (
            <div className="card p-4 border-l-4 border-l-amber-400 bg-amber-50 flex items-start gap-3">
              <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">PAN Extraction Needs Review</p>
                <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                  The OCR confidence for this PAN document is below the acceptance threshold.
                  The extracted value may be inaccurate. The officer should manually verify the uploaded document.
                </p>
              </div>
            </div>
          )}

          {/* Identity cards — PAN and GSTIN from documents, Udyam from registration */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* PAN — from uploaded document OCR */}
            <IdCell
              label="PAN"
              extracted={extractedPan}
              extractedStatus={panStatus || (docCount > 0 && !panSourceDoc ? 'NOT_FOUND' : undefined)}
              declared={declaredPan}
              sourceDocId={panSourceDoc}
            />
            {/* GSTIN — from uploaded document OCR */}
            <IdCell
              label="GSTIN"
              extracted={extractedGstin}
              extractedStatus={gstinStatus || (docCount > 0 && !gstinSourceDoc ? 'NOT_FOUND' : undefined)}
              declared={declaredGstin}
              sourceDocId={gstinSourceDoc}
            />
            {/* Udyam — from registration (no Udyam doc upload yet) */}
            <div className="stat-card">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-1">Udyam No.</p>
              <p className="text-sm font-bold text-slate-800 font-mono">{displayUdyam}</p>
              <p className="text-[9px] text-gray-300 mt-0.5">Source: Self-declared</p>
            </div>
            {/* Document count — actual uploaded files only */}
            <div className="stat-card">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-1">Documents</p>
              <p className="text-sm font-bold text-slate-800">
                {documentsLoading ? '…' : `${docCount} uploaded`}
              </p>
              {documentsError && (
                <button className="text-[9px] text-red-500 mt-0.5" onClick={loadDocuments}>Retry</button>
              )}
            </div>
          </div>

          {/* Source note */}
          <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-xl">
            <Info size={13} className="text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-blue-700 leading-relaxed">
              PAN and GSTIN values shown above are extracted from uploaded documents by OCR.
              They are the authoritative values for compliance purposes.
              Self-declared registration values are used only as a cross-check.
            </p>
          </div>
        </>
      ) : (
        /* No documents yet — do not show any identity data */
        <div className="card p-4 flex items-center gap-3 border-l-4 border-l-amber-400 bg-amber-50">
          <AlertTriangle size={15} className="text-amber-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {documentsLoading ? 'Loading documents…' : 'No documents submitted yet'}
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              {documentsLoading
                ? 'Please wait while documents are being loaded.'
                : 'PAN, GSTIN, and Udyam details will appear here once the bidder uploads documents. All identity fields are extracted from the actual uploaded documents — never from entered registration data.'}
            </p>
          </div>
          {!documentsLoading && (
            <button
              className="btn-primary ml-auto text-xs py-1.5 flex-shrink-0"
              onClick={() => navigate('/documents')}
            >
              <Upload size={12} /> Upload Documents
            </button>
          )}
        </div>
      )}

      {/* ── Documents section ────────────────────────────────── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-700">{t('uploaded_documents')}</h2>
          <button
            className="btn-secondary text-xs py-1.5"
            onClick={() => navigate('/documents')}
          >
            <Upload size={13} /> {t('upload_more')}
          </button>
        </div>

        {documentsLoading ? (
          <div className="flex items-center gap-2 py-6 justify-center text-gray-400 text-xs">
            <RefreshCw size={14} className="animate-spin" /> Loading documents…
          </div>
        ) : documentsError ? (
          <div className="flex items-center gap-3 py-6 justify-center flex-col text-gray-400">
            <AlertCircle size={24} className="text-red-300" />
            <p className="text-xs">{documentsError}</p>
            <button className="btn-secondary text-xs" onClick={loadDocuments}>
              <RefreshCw size={12} /> Retry
            </button>
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <FileText size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">{t('no_documents_uploaded')}</p>
            <button className="btn-primary mt-3 text-xs" onClick={() => navigate('/documents')}>
              {t('upload_documents')}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map((doc, idx) => {
              const typeColor = DOC_TYPE_COLORS[doc.classification] || DOC_TYPE_COLORS.DEFAULT
              const confidence = Math.round((doc.confidence || 0) * 100)
              return (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-blue-50/40 hover:border-blue-200 transition-all cursor-pointer group"
                  onClick={() => { setViewerDocId(doc.id); setViewerIndex(idx) }}
                >
                  <div className="flex-shrink-0 w-8 h-8 bg-gray-100 group-hover:bg-blue-100 rounded-lg flex items-center justify-center transition-colors">
                    <FileText size={14} className="text-gray-500 group-hover:text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{doc.filename}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {doc.pages} page{doc.pages !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <span className={`status-badge text-[10px] ${typeColor}`}>
                    {doc.classification || 'UNKNOWN'}
                  </span>
                  <div className="flex items-center gap-1 text-xs">
                    <div className="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          confidence >= 90 ? 'bg-green-500'
                          : confidence >= 70 ? 'bg-amber-500'
                          : 'bg-red-400'
                        }`}
                        style={{ width: `${confidence}%` }}
                      />
                    </div>
                    <span className="text-gray-500 w-8 text-right">{confidence}%</span>
                  </div>
                  <button
                    className="ml-1 flex items-center gap-1 text-[10px] px-2 py-1 bg-blue-600 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    onClick={(e) => { e.stopPropagation(); setViewerDocId(doc.id); setViewerIndex(idx) }}
                  >
                    <Eye size={11} /> View
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Tampering Detection Panel ────────────────────────── */}
      {!tamperingLoading && tampering && tampering.flagged_documents > 0 && (
        <div className="card p-5 border-l-4 border-l-red-500">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Fingerprint size={16} className="text-red-600" />
              <h2 className="text-sm font-semibold text-slate-700">{t('tampering_analysis_title')}</h2>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                tampering.overall_tampering_risk === 'HIGH'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-amber-100 text-amber-700'
              }`}>
                {tampering.overall_tampering_risk} RISK
              </span>
            </div>
            <span className="text-xs text-red-600 font-semibold">
              {tampering.flagged_documents} of {tampering.total_documents} docs flagged
            </span>
          </div>

          <div className="space-y-2">
            {(tampering.flagged_docs || []).map((doc) => (
              <div key={doc.id} className={`p-3 rounded-xl border ${
                doc.tampered ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
              }`}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <ShieldAlert size={13} className={doc.tampered ? 'text-red-600' : 'text-amber-600'} />
                    <span className="text-xs font-semibold text-slate-700 truncate max-w-[200px]">
                      {doc.filename}
                    </span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                      doc.tampered ? 'bg-red-200 text-red-800' : 'bg-amber-200 text-amber-800'
                    }`}>
                      {doc.tampered ? t('tampered_label') : t('suspicious_label')}
                    </span>
                  </div>
                  <button
                    className="text-[10px] text-blue-600 hover:underline flex items-center gap-1"
                    onClick={() => {
                      const idx = documents.findIndex((d) => d.id === doc.id)
                      setViewerDocId(doc.id)
                      setViewerIndex(idx >= 0 ? idx : 0)
                    }}
                  >
                    <Eye size={10} /> View
                  </button>
                </div>
                {(doc.signals || []).slice(0, 3).map((sig, i) => (
                  <div key={i} className="flex items-start gap-1.5 mt-1">
                    <AlertTriangle size={10} className={`flex-shrink-0 mt-0.5 ${
                      doc.tampered ? 'text-red-500' : 'text-amber-500'
                    }`} />
                    <div>
                      <span className="text-[10px] font-semibold text-slate-600">
                        {sig.type?.replace(/_/g, ' ')}:{' '}
                      </span>
                      <span className="text-[10px] text-slate-600">{sig.detail}</span>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-start gap-2 p-2.5 bg-gray-50 rounded-lg">
            <AlertTriangle size={12} className="text-gray-400 flex-shrink-0 mt-0.5" />
            <p className="text-[10px] text-gray-500 leading-relaxed">
              These are AI-detected signals for officer attention only. They do not constitute automatic
              disqualification. Final determination remains with the Procurement Officer.
            </p>
          </div>
        </div>
      )}

      {/* No tampering — clean state */}
      {!tamperingLoading && tampering && tampering.flagged_documents === 0 && documents.length > 0 && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-xs text-green-700">
          <CheckCircle size={14} className="text-green-600 flex-shrink-0" />
          <span>
            {t('no_tampering_detected')} {tampering.total_documents} {t('documents')}.
          </span>
        </div>
      )}

      {/* ── Analyze CTA — only when not yet analyzed ─────────── */}
      {bidder.status !== 'analyzed' && documents.length > 0 && (
        <div className="card p-5 border-2 border-blue-100 bg-blue-50">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-xl flex-shrink-0">
              <BarChart2 size={24} className="text-blue-700" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-slate-800">{t('run_compliance_analysis')}</h3>
              <p className="text-sm text-gray-600 mt-0.5">
                {t('ai_analysis_desc')} {documents.length} {t('documents')} {t('against')} {requirementCount ?? '—'} {t('tender_requirements')}.
              </p>
            </div>
            <button
              className="btn-primary flex-shrink-0"
              onClick={handleAnalyze}
              disabled={analyzing}
            >
              {analyzing
                ? <RefreshCw size={14} className="animate-spin" />
                : <ArrowRight size={14} />}
              {analyzing ? t('analyzing') : t('analyze_bid')}
            </button>
          </div>
        </div>
      )}

      {/* Document Viewer Modal */}
      {viewerDocId && (
        <DocumentViewer
          docId={viewerDocId}
          allDocs={documents}
          currentIndex={viewerIndex}
          onNavigate={(newIdx) => {
            setViewerIndex(newIdx)
            setViewerDocId(documents[newIdx]?.id)
          }}
          onClose={() => setViewerDocId(null)}
        />
      )}
    </div>
  )
}
