import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ChevronRight, CheckCircle, AlertTriangle, XCircle, MinusCircle,
  X, FileText, Shield, AlertCircle, Info, BarChart2,
  RefreshCw, Download, ArrowRight, ChevronDown, ChevronUp, UserCheck, Eye
} from 'lucide-react'
import { getBidder, getBidderCompliance, analyzeBidder, getBidderReport } from '../services/api.js'
import ScoreRing from '../components/ScoreRing.jsx'
import StatusBadge, { RiskBadge } from '../components/StatusBadge.jsx'
import { PageLoader } from '../components/LoadingSkeleton.jsx'
import { useToast } from '../components/Toast.jsx'
import DocumentViewer from '../components/DocumentViewer.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'

const PROCESSING_STEPS = [
  'Analyzing bidder documents…',
  '✓ Documents uploaded',
  '✓ Document classification complete',
  '✓ OCR / text extraction complete',
  '✓ Entity extraction complete',
  '✓ Requirement matching complete',
  '✓ Compliance verification complete',
  '✓ Cross-document validation complete',
  'Analysis complete.',
]

const STATUS_ICON = {
  VERIFIED: <CheckCircle size={14} className="text-green-600 flex-shrink-0" />,
  REVIEW: <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" />,
  NON_COMPLIANT: <XCircle size={14} className="text-red-600 flex-shrink-0" />,
  MISSING: <MinusCircle size={14} className="text-gray-400 flex-shrink-0" />,
}

const CROSS_STATUS_STYLE = {
  CONSISTENT: 'text-green-700 bg-green-50 border-green-200',
  MINOR_VARIATION: 'text-amber-700 bg-amber-50 border-amber-200',
  MISMATCH: 'text-red-700 bg-red-50 border-red-200',
}
const CROSS_ICON = {
  CONSISTENT: <CheckCircle size={13} className="text-green-600 flex-shrink-0" />,
  MINOR_VARIATION: <AlertTriangle size={13} className="text-amber-500 flex-shrink-0" />,
  MISMATCH: <XCircle size={13} className="text-red-600 flex-shrink-0" />,
}

function ConfidenceBar({ value }) {
  const pct = Math.round((value || 0) * 100)
  const color = pct >= 90 ? 'bg-green-500' : pct >= 70 ? 'bg-amber-500' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full progress-bar ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-8 text-right">{pct}%</span>
    </div>
  )
}

function ProcessingOverlay({ steps, currentStep, onDone }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md mx-4">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
            <Shield className="text-blue-700" size={20} />
          </div>
          <div>
            <h2 className="font-bold text-slate-800">AI Compliance Analysis</h2>
            <p className="text-xs text-gray-500">PARAKH AI Engine · Aevora</p>
          </div>
        </div>
        <div className="space-y-2.5">
          {steps.map((step, i) => (
            <div key={i} className={`flex items-center gap-3 text-sm transition-all duration-300 ${i <= currentStep ? 'opacity-100' : 'opacity-20'}`}>
              {i === 0 || i === steps.length - 1 ? (
                <div className={`w-4 h-4 rounded-full flex-shrink-0 ${i === currentStep ? 'bg-blue-600 animate-pulse' : i < currentStep ? 'bg-green-500' : 'bg-gray-200'}`} />
              ) : (
                <CheckCircle size={16} className={i <= currentStep && i !== 0 ? 'text-green-500 flex-shrink-0' : 'text-gray-300 flex-shrink-0'} />
              )}
              <span className={i <= currentStep ? 'text-slate-700 font-medium' : 'text-gray-400'}>{step}</span>
            </div>
          ))}
        </div>
        {currentStep >= steps.length - 1 && (
          <button className="btn-primary w-full mt-6 justify-center" onClick={onDone}>
            View Results <ArrowRight size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

export default function CompliancePage() {
  const { bidderId } = useParams()
  const navigate = useNavigate()
  const { addToast: showToast } = useToast()
  const { t } = useLanguage()

  const [bidder, setBidder] = useState(null)
  const [compliance, setCompliance] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)          // ← new: track load failure
  const [selectedReq, setSelectedReq] = useState(null)
  const [selectedCross, setSelectedCross] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [processingStep, setProcessingStep] = useState(-1)
  const [showProcessing, setShowProcessing] = useState(false)
  const [filterStatus, setFilterStatus] = useState('ALL')
  const [expandedCross, setExpandedCross] = useState(null)
  const [generatingReport, setGeneratingReport] = useState(false)
  const panelRef = useRef(null)
  const [viewerDocId, setViewerDocId] = useState(null)

  const loadData = React.useCallback(() => {
    setLoading(true)
    setLoadError(null)
    Promise.all([getBidder(bidderId), getBidderCompliance(bidderId)])
      .then(([bRes, cRes]) => {
        setBidder(bRes.data)
        setCompliance(cRes.data)
      })
      .catch(() => {
        setLoadError('Unable to load compliance data. Please try again.')
        showToast('Failed to load compliance data', 'error')
      })
      .finally(() => setLoading(false))
  }, [bidderId])

  useEffect(() => { loadData() }, [loadData])

  const handleAnalyze = async () => {
    setShowProcessing(true)
    setProcessingStep(0)
    setAnalyzing(true)
    try {
      for (let i = 0; i < PROCESSING_STEPS.length - 1; i++) {
        await new Promise((r) => setTimeout(r, 420 + Math.random() * 200))
        setProcessingStep(i + 1)
      }
      await analyzeBidder(bidderId)
      const [bRes, cRes] = await Promise.all([getBidder(bidderId), getBidderCompliance(bidderId)])
      setBidder(bRes.data)
      setCompliance(cRes.data)
    } catch {
      showToast('Analysis failed', 'error')
      setShowProcessing(false)    // close overlay on failure
    } finally {
      setAnalyzing(false)
      // Note: on success, showProcessing stays true until user clicks "View Results"
      // On failure, it's already set to false in the catch block above
    }
  }

  const handleReport = async () => {
    setGeneratingReport(true)
    showToast('Generating compliance report…', 'info')
    try {
      const res = await getBidderReport(bidderId)
      const html = res.data.html
      const win = window.open('', '_blank')
      win.document.write(html)
      win.document.close()
      showToast('Report opened in new tab', 'success')
    } catch {
      showToast('Report generation failed', 'error')
    } finally {
      setGeneratingReport(false)
    }
  }

  if (loading) return <PageLoader />
  if (loadError || !compliance) {
    return (
      <div className="p-6 max-w-lg">
        <div className="card p-6 flex flex-col items-center gap-4 text-center">
          <AlertCircle size={32} className="text-red-400" />
          <div>
            <p className="text-sm font-semibold text-slate-700">
              {loadError || 'Compliance data not available.'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              This bidder may not have been analysed yet, or the server is unavailable.
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary text-xs" onClick={loadData}>
              <RefreshCw size={13} /> Retry
            </button>
            <button className="btn-primary text-xs" onClick={handleAnalyze} disabled={analyzing}>
              {analyzing ? <RefreshCw size={13} className="animate-spin" /> : <BarChart2 size={13} />}
              Run Analysis
            </button>
            <button className="btn-secondary text-xs" onClick={() => navigate(-1)}>
              ← Back
            </button>
          </div>
        </div>
      </div>
    )
  }

  const score = { overall_score: compliance.overall_score ?? 0, risk_level: compliance.risk_level || null }
  const status_counts = compliance.status_counts || {}
  const category_scores = compliance.category_scores || {}
  const cross_document_checks = compliance.cross_document_checks || []
  const results = compliance.compliance_results || {}
  const tenderId = bidder?.tender_id || null

  const requirementList = results ? Object.entries(results) : []
  const filtered = filterStatus === 'ALL'
    ? requirementList
    : requirementList.filter(([, r]) => r.status === filterStatus)

  const categoryColors = {
    Legal: 'bg-blue-500', Financial: 'bg-green-500', Technical: 'bg-purple-500',
    Certifications: 'bg-teal-500', Documentation: 'bg-orange-500', Registration: 'bg-indigo-500',
  }

  return (
    <>
      {showProcessing && (
        <ProcessingOverlay
          steps={PROCESSING_STEPS}
          currentStep={processingStep}
          onDone={() => setShowProcessing(false)}
        />
      )}

      <div className="flex h-full">
        {/* Main Content */}
        <div className={`flex-1 overflow-y-auto p-6 space-y-5 transition-all duration-300 ${selectedReq ? 'pr-3' : ''}`}>
          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate('/tenders')}>{t('tenders')}</span>
            <ChevronRight size={12} />
            <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate(`/tenders/${tenderId}`)}>{tenderId}</span>
            <ChevronRight size={12} />
            <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate(`/tenders/${tenderId}/bidders`)}>{t('bidders')}</span>
            <ChevronRight size={12} />
            <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate(`/bidders/${bidderId}`)}>{bidder?.name}</span>
            <ChevronRight size={12} />
            <span className="text-slate-700 font-medium">{t('compliance')}</span>
          </div>

          {/* Header */}
          <div className="card p-5">
            <div className="flex items-start gap-5">
              <ScoreRing score={score?.overall_score || 0} size={88} strokeWidth={7} />
              <div className="flex-1">
                <h1 className="text-lg font-bold text-slate-800 uppercase tracking-wide">{bidder?.name}</h1>
                <p className="text-xs text-gray-500 mt-0.5">{bidderId} · {tenderId}</p>
                <div className="flex items-center gap-2 mt-2">
                  <RiskBadge risk={score?.risk_level || 'UNKNOWN'} />
                  <span className="text-xs text-gray-500">Risk Level</span>
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button className="btn-secondary text-xs py-2" onClick={handleAnalyze} disabled={analyzing}>
                  <RefreshCw size={13} className={analyzing ? 'animate-spin' : ''} /> {t('re_analyze')}
                </button>
                <button className="btn-secondary text-xs py-2" onClick={() => navigate(`/bidders/${bidderId}/recommendation`)}>
                  <Info size={13} /> {t('ai_advice')}
                </button>
                <button className="btn-primary text-xs py-2" onClick={() => navigate(`/bidders/${bidderId}/decision`)}>
                  <UserCheck size={13} /> {t('decide')}
                </button>
              </div>
            </div>

            {/* Counts */}
            <div className="grid grid-cols-4 gap-3 mt-4 pt-4 border-t border-gray-100">
              {[
                { label: t('verified'), count: status_counts?.VERIFIED || 0, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
                { label: t('needs_review'), count: status_counts?.REVIEW || 0, icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50' },
                { label: t('non_compliant'), count: status_counts?.NON_COMPLIANT || 0, icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
                { label: t('missing'), count: status_counts?.MISSING || 0, icon: MinusCircle, color: 'text-gray-500', bg: 'bg-gray-100' },
              ].map(({ label, count, icon: Icon, color, bg }) => (
                <div key={label} className={`${bg} rounded-xl p-3 text-center cursor-pointer hover:opacity-80 transition-opacity`}
                  onClick={() => setFilterStatus(label === 'Verified' ? 'VERIFIED' : label === 'Needs Review' ? 'REVIEW' : label === 'Non-Compliant' ? 'NON_COMPLIANT' : 'MISSING')}>
                  <div className="flex items-center justify-center mb-1">
                    <Icon size={16} className={color} />
                  </div>
                  <p className={`text-2xl font-bold ${color}`}>{count}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* AI Advisory Banner */}
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 flex items-start gap-3">
            <Shield size={15} className="text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-blue-800 uppercase tracking-wide">{t('ai_verifies_tagline')}</p>
              <p className="text-xs text-blue-700 mt-0.5 leading-relaxed">
                {t('ai_advisory_text')}
              </p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button
                className="text-xs bg-blue-700 hover:bg-blue-800 text-white px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1"
                onClick={() => navigate(`/bidders/${bidderId}/decision`)}
              >
                <UserCheck size={12} /> {t('make_decision')}
              </button>
            </div>
          </div>

          {/* Category Scores */}
          {category_scores && Object.keys(category_scores).length > 0 && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-4">{t('score_by_category')}</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {Object.entries(category_scores).map(([cat, pct]) => (
                  <div key={cat}>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-xs font-medium text-slate-600">{cat}</span>
                      <span className={`text-xs font-bold ${pct >= 85 ? 'text-green-600' : pct >= 70 ? 'text-amber-600' : 'text-red-600'}`}>{pct}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full progress-bar ${categoryColors[cat] || 'bg-blue-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Compliance Matrix */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-slate-700">{t('compliance_matrix')}</h2>
              <div className="flex gap-1.5">
                {['ALL', 'VERIFIED', 'REVIEW', 'NON_COMPLIANT', 'MISSING'].map((s) => (
                  <button
                    key={s}
                    onClick={() => setFilterStatus(s)}
                    className={`text-xs px-2.5 py-1 rounded-full transition-colors font-medium ${filterStatus === s ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                  >
                    {s === 'ALL' ? t('filter_all') : s === 'NON_COMPLIANT' ? t('filter_non_compliant') : s === 'REVIEW' ? t('filter_review') : s === 'VERIFIED' ? t('filter_verified') : t('filter_missing')}
                  </button>
                ))}
              </div>
            </div>
            <div className="divide-y divide-gray-50">
              {filtered.map(([reqId, result]) => {
                const req = result.requirement || {}
                const isSelected = selectedReq?.[0] === reqId
                return (
                  <div
                    key={reqId}
                    className={`flex items-center gap-4 px-5 py-3.5 cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 border-l-2 border-blue-600' : 'hover:bg-gray-50'}`}
                    onClick={() => setSelectedReq(isSelected ? null : [reqId, result])}
                  >
                    <span className="text-xs font-mono text-gray-400 w-16 flex-shrink-0">{reqId}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{req.name || reqId}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{req.category} · {req.mandatory ? 'Mandatory' : 'Optional'}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {result.confidence > 0 && (
                        <span className="text-xs text-gray-400 hidden md:block">{Math.round(result.confidence * 100)}% conf.</span>
                      )}
                      <StatusBadge status={result.status} />
                      {STATUS_ICON[result.status]}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Cross-Document Checks */}
          {cross_document_checks && cross_document_checks.length > 0 && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-4">{t('cross_document_verification')}</h2>
              <div className="space-y-2">
                {cross_document_checks.map((check, i) => {
                  const isExpanded = expandedCross === i
                  const hasDetail = check.status !== 'CONSISTENT'
                  const styleClass = CROSS_STATUS_STYLE[check.status] || CROSS_STATUS_STYLE.CONSISTENT
                  return (
                    <div key={i} className={`rounded-lg border p-3 ${styleClass} ${hasDetail ? 'cursor-pointer' : ''}`}
                      onClick={() => hasDetail && setExpandedCross(isExpanded ? null : i)}>
                      <div className="flex items-center gap-3">
                        {CROSS_ICON[check.status] || CROSS_ICON.CONSISTENT}
                        <span className="text-sm font-semibold flex-1">{check.check}</span>
                        <span className="text-xs opacity-75">{check.status.replace('_', ' ')}</span>
                        {hasDetail && (
                          isExpanded ? <ChevronUp size={14} className="opacity-60" /> : <ChevronDown size={14} className="opacity-60" />
                        )}
                      </div>
                      {isExpanded && check.explanation && (
                        <div className="mt-2 pt-2 border-t border-current/20">
                          <p className="text-xs opacity-75 mb-1 font-mono">{check.detail}</p>
                          <p className="text-xs leading-relaxed">{check.explanation}</p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Evidence Panel */}
        {selectedReq && (
          <div
            ref={panelRef}
            className="w-96 flex-shrink-0 bg-white border-l border-gray-200 overflow-y-auto flex flex-col"
            style={{ minHeight: '100vh' }}
          >
            <EvidencePanel
              reqId={selectedReq[0]}
              result={selectedReq[1]}
              onClose={() => setSelectedReq(null)}
              onViewDoc={(docId) => setViewerDocId(docId)}
            />
          </div>
        )}
      </div>

      {/* Document Viewer Modal */}
      {viewerDocId && (
        <DocumentViewer
          docId={viewerDocId}
          onClose={() => setViewerDocId(null)}
        />
      )}
    </>
  )
}

function EvidencePanel({ reqId, result, onClose, onViewDoc }) {
  const req = result?.requirement || {}
  const status = result?.status || 'MISSING'

  const statusConfig = {
    VERIFIED: { border: 'border-green-300', bg: 'bg-green-50', text: 'text-green-700', icon: <CheckCircle size={16} className="text-green-600" />, label: 'VERIFIED' },
    REVIEW: { border: 'border-amber-300', bg: 'bg-amber-50', text: 'text-amber-700', icon: <AlertTriangle size={16} className="text-amber-500" />, label: 'NEEDS REVIEW' },
    NON_COMPLIANT: { border: 'border-red-300', bg: 'bg-red-50', text: 'text-red-700', icon: <XCircle size={16} className="text-red-600" />, label: 'NON-COMPLIANT' },
    MISSING: { border: 'border-gray-300', bg: 'bg-gray-50', text: 'text-gray-600', icon: <MinusCircle size={16} className="text-gray-400" />, label: 'MISSING' },
  }
  const cfg = statusConfig[status]

  return (
    <div className="flex flex-col h-full">
      {/* Panel Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">{reqId}</p>
          <h3 className="font-bold text-slate-800 text-sm mt-0.5 leading-tight">{req.name || reqId}</h3>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Status Banner */}
        <div className={`${cfg.bg} border ${cfg.border} rounded-xl p-3 flex items-center gap-3`}>
          {cfg.icon}
          <div>
            <p className={`text-sm font-bold ${cfg.text}`}>{cfg.label}</p>
            {result.confidence > 0 && (
              <p className="text-xs text-gray-500 mt-0.5">Confidence: {Math.round(result.confidence * 100)}%</p>
            )}
          </div>
        </div>

        {result.confidence > 0 && (
          <div>
            <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide mb-1.5">AI Confidence</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full progress-bar ${result.confidence >= 0.9 ? 'bg-green-500' : result.confidence >= 0.7 ? 'bg-amber-500' : 'bg-red-400'}`}
                  style={{ width: `${Math.round(result.confidence * 100)}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-slate-600 w-8 text-right">{Math.round(result.confidence * 100)}%</span>
            </div>
          </div>
        )}

        {/* Requirement */}
        <div>
          <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide mb-1.5">Requirement</p>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-slate-700 leading-relaxed">{req.description || 'No description available.'}</p>
            {req.threshold_display && (
              <div className="mt-2 pt-2 border-t border-gray-200 flex items-center gap-2">
                <span className="text-[10px] text-gray-400 font-semibold">THRESHOLD:</span>
                <span className="text-xs font-bold text-slate-700">{req.threshold_display}</span>
              </div>
            )}
            <div className="mt-1.5 flex items-center gap-3">
              <span className={`status-badge text-[10px] ${req.mandatory ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
                {req.mandatory ? 'Mandatory' : 'Optional'}
              </span>
              {req.category && (
                <span className="status-badge text-[10px] bg-blue-50 text-blue-700 border border-blue-200">{req.category}</span>
              )}
            </div>
          </div>
        </div>

        {/* Evidence Source */}
        {result.source_doc && (
          <div>
            <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide mb-1.5">Evidence Source</p>
            <div className="bg-gray-50 rounded-lg p-3 flex items-start gap-2">
              <FileText size={14} className="text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-700 truncate">
                  {result.source_document?.filename || result.source_doc}
                </p>
                {result.source_document?.pages && (
                  <p className="text-[10px] text-gray-400 mt-0.5">{result.source_document.pages} page document</p>
                )}
              </div>
              {/* View document button */}
              <button
                onClick={() => onViewDoc(result.source_doc)}
                className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors flex-shrink-0"
                title="View this document"
              >
                <Eye size={11} /> View
              </button>
            </div>
          </div>
        )}

        {result.extracted_value && (
          <div>
            <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide mb-1.5">Extracted Evidence</p>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <p className="text-xs text-slate-700 leading-relaxed font-mono">{result.extracted_value}</p>
            </div>
          </div>
        )}

        {/* Comparison */}
        {(result.required_value || result.found_value) && (
          <div>
            <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide mb-1.5">Verification</p>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg">
                <span className="text-xs text-gray-500 font-medium">Required</span>
                <span className="text-xs font-semibold text-slate-700">{result.required_value}</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg"
                style={{ background: status === 'VERIFIED' ? '#f0fdf4' : status === 'NON_COMPLIANT' ? '#fef2f2' : '#fffbeb' }}>
                <span className="text-xs text-gray-500 font-medium">Detected</span>
                <span className={`text-xs font-semibold ${status === 'VERIFIED' ? 'text-green-700' : status === 'NON_COMPLIANT' ? 'text-red-700' : 'text-amber-700'}`}>
                  {result.found_value}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* AI Explanation */}
        {result.explanation && (
          <div>
            <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide mb-1.5">AI Explanation</p>
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 flex items-start gap-2">
              <Info size={13} className="text-blue-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-800 leading-relaxed">{result.explanation}</p>
            </div>
          </div>
        )}

        {/* Concern / Reason */}
        {(result.concern || result.reason) && (
          <div>
            <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide mb-1.5">
              {result.concern ? 'Review Reason' : 'Failure Reason'}
            </p>
            <div className={`rounded-lg p-3 flex items-start gap-2 ${result.concern ? 'bg-amber-50 border border-amber-200' : 'bg-red-50 border border-red-200'}`}>
              <AlertCircle size={13} className={result.concern ? 'text-amber-600 flex-shrink-0 mt-0.5' : 'text-red-600 flex-shrink-0 mt-0.5'} />
              <p className={`text-xs leading-relaxed ${result.concern ? 'text-amber-800' : 'text-red-800'}`}>
                {result.concern || result.reason}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
