import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ChevronRight, CheckCircle, AlertTriangle, XCircle, MinusCircle,
  Shield, Info, UserCheck, ArrowRight, Lightbulb, AlertCircle,
  FileText, RefreshCw
} from 'lucide-react'
import { getBidder, getBidderCompliance } from '../services/api.js'
import ScoreRing from '../components/ScoreRing.jsx'
import { RiskBadge } from '../components/StatusBadge.jsx'
import { PageLoader } from '../components/LoadingSkeleton.jsx'
import { useToast } from '../components/Toast.jsx'

const STATUS_ICON = {
  VERIFIED: <CheckCircle size={14} className="text-green-600 flex-shrink-0" />,
  REVIEW: <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" />,
  NON_COMPLIANT: <XCircle size={14} className="text-red-600 flex-shrink-0" />,
  MISSING: <MinusCircle size={14} className="text-gray-400 flex-shrink-0" />,
}

const STATUS_ROW_STYLE = {
  VERIFIED: 'bg-green-50 border-green-100',
  REVIEW: 'bg-amber-50 border-amber-100',
  NON_COMPLIANT: 'bg-red-50 border-red-100',
  MISSING: 'bg-gray-50 border-gray-100',
}

export default function AIRecommendation() {
  const { bidderId } = useParams()
  const navigate = useNavigate()
  const { addToast: showToast } = useToast()

  const [bidder, setBidder] = useState(null)
  const [compliance, setCompliance] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const loadData = useCallback(() => {
    setLoading(true)
    setLoadError(null)
    Promise.all([getBidder(bidderId), getBidderCompliance(bidderId)])
      .then(([bRes, cRes]) => {
        setBidder(bRes.data)
        setCompliance(cRes.data)
      })
      .catch(() => {
        setLoadError('Unable to load recommendation data. Please try again.')
        showToast('Failed to load recommendation data', 'error')
      })
      .finally(() => setLoading(false))
  }, [bidderId])

  useEffect(() => { loadData() }, [loadData])

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
              Run compliance analysis first, then view the AI recommendation.
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary text-xs" onClick={loadData}>
              <RefreshCw size={13} /> Retry
            </button>
            <button className="btn-secondary text-xs" onClick={() => navigate(`/bidders/${bidderId}/compliance`)}>
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

  const score   = compliance.overall_score ?? 0
  const risk    = compliance.risk_level    || null
  const counts  = compliance.status_counts || {}
  const results = compliance.compliance_results || {}
  // Use actual tender ID from bidder record — never fabricate a fallback
  const tenderId = bidder?.tender_id || null

  // Separate findings by priority
  const nonCompliant = Object.entries(results).filter(([, r]) => r.status === 'NON_COMPLIANT')
  const review = Object.entries(results).filter(([, r]) => r.status === 'REVIEW')
  const missing = Object.entries(results).filter(([, r]) => r.status === 'MISSING' && r.requirement?.mandatory)
  const verified = Object.entries(results).filter(([, r]) => r.status === 'VERIFIED')

  const hasIssues = nonCompliant.length > 0 || review.length > 0 || missing.length > 0

  const overallRecommendation = nonCompliant.length > 0
    ? { status: 'NON_COMPLIANT', label: 'Bid May Not Meet Requirements', color: 'border-red-500 bg-red-50 text-red-800', icon: XCircle, iconColor: 'text-red-600' }
    : review.length > 0 || missing.length > 0
    ? { status: 'REVIEW', label: 'Review Required Before Decision', color: 'border-amber-500 bg-amber-50 text-amber-800', icon: AlertTriangle, iconColor: 'text-amber-600' }
    : { status: 'VERIFIED', label: 'Bid Appears to Meet All Requirements', color: 'border-green-500 bg-green-50 text-green-800', icon: CheckCircle, iconColor: 'text-green-600' }

  const RecommendIcon = overallRecommendation.icon

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate('/tenders')}>Tenders</span>
        {tenderId && (
          <>
            <ChevronRight size={12} />
            <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate(`/tenders/${tenderId}`)}>{tenderId}</span>
          </>
        )}
        <ChevronRight size={12} />
        <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate(`/bidders/${bidderId}/compliance`)}>{bidder?.name}</span>
        <ChevronRight size={12} />
        <span className="text-slate-700 font-medium">AI Recommendation</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-blue-100 rounded-xl">
          <Lightbulb size={20} className="text-blue-700" />
        </div>
        <div>
          <h1 className="page-title">AI Recommendation</h1>
          <p className="text-sm text-gray-500">{bidder?.name}</p>
        </div>
      </div>

      {/* ⚠️ MANDATORY ADVISORY NOTICE */}
      <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
            <Shield size={16} className="text-amber-700" />
          </div>
          <div>
            <p className="text-sm font-bold text-amber-900 uppercase tracking-wide">
              AI Recommendation is Advisory Only
            </p>
            <p className="text-xs text-amber-800 mt-1 leading-relaxed">
              This recommendation is generated by the PARAKH AI engine based on document analysis, compliance rules,
              and evidence extraction. <strong>It does not constitute a qualification or disqualification decision.</strong>
              The final decision must be made by the Procurement Officer.
            </p>
          </div>
        </div>
      </div>

      {/* Score Summary */}
      <div className="card p-5">
        <div className="flex items-center gap-5">
          <ScoreRing score={score} size={80} strokeWidth={6} />
          <div className="flex-1">
            <h2 className="font-bold text-slate-800">{bidder?.name}</h2>
            <div className="flex items-center gap-2 mt-1.5">
              <RiskBadge risk={risk || 'UNKNOWN'} />
              <span className="text-xs text-gray-400">·</span>
              <span className="text-xs text-gray-500">Score: {score}/100</span>
            </div>
            <div className="grid grid-cols-4 gap-2 mt-3">
              {[
                { label: 'Verified', count: counts.VERIFIED || 0, color: 'text-green-600' },
                { label: 'Review', count: counts.REVIEW || 0, color: 'text-amber-600' },
                { label: 'Non-Compliant', count: counts.NON_COMPLIANT || 0, color: 'text-red-600' },
                { label: 'Missing', count: counts.MISSING || 0, color: 'text-gray-500' },
              ].map(({ label, count, color }) => (
                <div key={label} className="text-center">
                  <p className={`text-lg font-bold ${color}`}>{count}</p>
                  <p className="text-[9px] text-gray-400">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Overall Recommendation */}
      <div className={`rounded-xl border-2 p-4 ${overallRecommendation.color}`}>
        <div className="flex items-start gap-3">
          <RecommendIcon size={20} className={overallRecommendation.iconColor} />
          <div>
            <p className="text-sm font-bold">{overallRecommendation.label}</p>
            <p className="text-xs mt-1 leading-relaxed opacity-80">
              {overallRecommendation.status === 'NON_COMPLIANT'
                ? `${nonCompliant.length} mandatory requirement${nonCompliant.length > 1 ? 's' : ''} not satisfied. The bid has critical compliance failures that require officer evaluation.`
                : overallRecommendation.status === 'REVIEW'
                ? `${review.length + missing.length} item${(review.length + missing.length) > 1 ? 's' : ''} flagged for officer review. Bid may proceed after resolving identified documentation gaps.`
                : 'All mandatory requirements appear to be satisfied. No critical issues detected by the AI engine.'}
            </p>
          </div>
        </div>
      </div>

      {/* AI Findings */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-slate-700">AI Findings</h2>
          <p className="text-xs text-gray-400 mt-0.5">Evidence-backed compliance analysis — each finding linked to source document</p>
        </div>

        {/* Non-Compliant */}
        {nonCompliant.length > 0 && (
          <div>
            <div className="px-5 py-2 bg-red-50 border-b border-red-100">
              <p className="text-xs font-bold text-red-700 flex items-center gap-1.5">
                <XCircle size={12} /> NON-COMPLIANT ({nonCompliant.length})
              </p>
            </div>
            {nonCompliant.map(([reqId, result]) => (
              <FindingRow key={reqId} reqId={reqId} result={result} status="NON_COMPLIANT" />
            ))}
          </div>
        )}

        {/* Review */}
        {review.length > 0 && (
          <div>
            <div className="px-5 py-2 bg-amber-50 border-b border-amber-100 border-t border-t-gray-100">
              <p className="text-xs font-bold text-amber-700 flex items-center gap-1.5">
                <AlertTriangle size={12} /> NEEDS REVIEW ({review.length})
              </p>
            </div>
            {review.map(([reqId, result]) => (
              <FindingRow key={reqId} reqId={reqId} result={result} status="REVIEW" />
            ))}
          </div>
        )}

        {/* Missing mandatory */}
        {missing.length > 0 && (
          <div>
            <div className="px-5 py-2 bg-gray-50 border-b border-gray-100 border-t border-t-gray-100">
              <p className="text-xs font-bold text-gray-600 flex items-center gap-1.5">
                <MinusCircle size={12} /> MISSING — MANDATORY ({missing.length})
              </p>
            </div>
            {missing.map(([reqId, result]) => (
              <FindingRow key={reqId} reqId={reqId} result={result} status="MISSING" />
            ))}
          </div>
        )}

        {/* Verified highlights */}
        <div>
          <div className="px-5 py-2 bg-green-50 border-b border-green-100 border-t border-t-gray-100">
            <p className="text-xs font-bold text-green-700 flex items-center gap-1.5">
              <CheckCircle size={12} /> VERIFIED ({verified.length})
            </p>
          </div>
          <div className="px-5 py-3">
            <div className="flex flex-wrap gap-2">
              {verified.map(([reqId, result]) => (
                <span key={reqId} className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-2.5 py-1 font-medium">
                  <CheckCircle size={10} />
                  {result.requirement?.name || reqId}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          className="btn-secondary flex-1 justify-center"
          onClick={() => navigate(`/bidders/${bidderId}/compliance`)}
        >
          View Full Compliance
        </button>
        <button
          className="btn-primary flex-1 justify-center"
          onClick={() => navigate(`/bidders/${bidderId}/decision`)}
        >
          <UserCheck size={14} /> Make Decision
        </button>
      </div>

      {/* Footer note */}
      <div className="flex items-start gap-2 text-xs text-gray-400 pb-2">
        <Info size={12} className="flex-shrink-0 mt-0.5" />
        <p>PARAKH AI analysis is based on uploaded documents and configured compliance rules. Government API verification results are simulated in demo mode. All findings are linked to their evidence source for officer review.</p>
      </div>
    </div>
  )
}

function FindingRow({ reqId, result, status }) {
  const req = result?.requirement || {}
  return (
    <div className={`flex items-start gap-3 px-5 py-3 border-b border-gray-50 last:border-0 ${STATUS_ROW_STYLE[status]}`}>
      {STATUS_ICON[status]}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-700">{req.name || reqId}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          {result.extracted_value || result.reason || result.concern || result.found_value}
        </p>
        {result.source_document?.filename && (
          <div className="flex items-center gap-1 mt-1">
            <FileText size={10} className="text-gray-400" />
            <span className="text-[10px] text-gray-400">{result.source_document.filename}</span>
            {result.confidence > 0 && (
              <span className="text-[10px] text-gray-400 ml-1">· {Math.round(result.confidence * 100)}% conf.</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
