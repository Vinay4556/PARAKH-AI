import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ChevronRight, CheckCircle, AlertTriangle, XCircle, MinusCircle,
  ArrowRight, Scale, RefreshCw, Users
} from 'lucide-react'
import { getTenderBidders, analyzeBidder } from '../services/api.js'
import ScoreRing from '../components/ScoreRing.jsx'
import { RiskBadge } from '../components/StatusBadge.jsx'
import { PageLoader } from '../components/LoadingSkeleton.jsx'
import { useToast } from '../components/Toast.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'

export default function Bidders() {
  const { tenderId } = useParams()
  const tid = tenderId || 'GEM-DEMO-2026-001'
  const navigate = useNavigate()
  const { addToast: showToast } = useToast()
  const { t } = useLanguage()
  const [bidders, setBidders] = useState([])
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState({})

  const load = () => {
    getTenderBidders(tid)
      .then((res) => setBidders(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [tid])

  const handleAnalyzeAll = async () => {
    const unanalyzed = bidders.filter((b) => b.status !== 'analyzed')
    if (!unanalyzed.length) { showToast('All bidders already analyzed', 'info'); return }
    showToast(`Analyzing ${unanalyzed.length} bidder${unanalyzed.length > 1 ? 's' : ''}…`, 'info')
    for (const b of unanalyzed) {
      setAnalyzing((p) => ({ ...p, [b.id]: true }))
      try {
        await analyzeBidder(b.id)
        setBidders((prev) => prev.map((x) => x.id === b.id ? { ...x, status: 'analyzed' } : x))
      } catch { /* continue */ }
      setAnalyzing((p) => ({ ...p, [b.id]: false }))
    }
    showToast('Analysis complete', 'success')
    load()
  }

  if (loading) return <PageLoader />

  const sorted = [...bidders].sort((a, b) => (b.compliance_score || 0) - (a.compliance_score || 0))

  return (
    <div className="p-6 space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate('/tenders')}>{t('tenders')}</span>
        <ChevronRight size={12} />
        <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate(`/tenders/${tid}`)}>{tid}</span>
        <ChevronRight size={12} />
        <span className="text-slate-700 font-medium">{t('bidders')}</span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">{t('bidders')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {bidders.length} {t('bidder')}{bidders.length !== 1 ? 's' : ''} {t('submitted')} ·{' '}
            {bidders.filter((b) => b.status === 'analyzed').length} {t('analyzed')}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn-secondary text-xs"
            onClick={() => navigate(`/tenders/${tid}/bid-comparison`)}
          >
            <Scale size={13} /> {t('bid_comparison')}
          </button>
          <button className="btn-primary text-xs" onClick={handleAnalyzeAll}>
            <RefreshCw size={13} /> {t('analyze_all')}
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="card p-12 text-center">
          <Users size={40} className="mx-auto mb-3 text-gray-200" />
          <p className="text-sm font-semibold text-slate-600">{t('no_bidders')}</p>
          <p className="text-xs text-gray-400 mt-1">{t('no_bidders_desc')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {sorted.map((bidder, idx) => {
            const isAnalyzing = analyzing[bidder.id]
            return (
              <div key={bidder.id} className="card p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-5">
                  {/* Rank badge */}
                  <div
                    className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mt-1"
                    style={{
                      background: idx === 0 ? '#fef9c3' : idx === 1 ? '#f1f5f9' : '#f8fafc',
                      color: idx === 0 ? '#854d0e' : '#64748b',
                    }}
                  >
                    {idx + 1}
                  </div>

                  {/* Score Ring */}
                  <div className="flex-shrink-0">
                    <ScoreRing score={bidder.compliance_score || 0} size={72} strokeWidth={6} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h2 className="font-semibold text-slate-800">{bidder.name || bidder.id}</h2>
                        {bidder.status === 'analyzed'
                          ? <p className="text-xs text-gray-500 mt-0.5 font-mono">{bidder.gstin || '—'}</p>
                          : <p className="text-xs text-amber-600 mt-0.5 italic">Documents not yet submitted</p>
                        }
                        {!bidder.name && (
                          <p className="text-[10px] text-amber-600 italic mt-0.5">Registration details pending</p>
                        )}
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <RiskBadge risk={bidder.risk_level || 'UNKNOWN'} />
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            bidder.status === 'analyzed'
                              ? 'bg-green-50 text-green-700'
                              : 'bg-gray-100 text-gray-500'
                          }`}>
                            {bidder.status === 'analyzed' ? `✓ ${t('analysis_complete')}` : t('pending_analysis')}
                          </span>
                          {bidder.officer_decision && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                              bidder.officer_decision === 'QUALIFY'
                                ? 'bg-green-100 text-green-700'
                                : bidder.officer_decision === 'DISQUALIFY'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}>
                              {bidder.officer_decision}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Document count & address */}
                    <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-50 text-xs text-gray-500">
                      <span>{bidder.document_count || 0} documents</span>
                      {bidder.address && <span className="truncate">{bidder.address}</span>}
                      <span className="ml-auto">
                        Submitted {bidder.submitted_at
                          ? new Date(bidder.submitted_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
                          : '—'}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <button
                      className="btn-primary text-xs py-2"
                      onClick={() => navigate(`/bidders/${bidder.id}/compliance`)}
                    >
                      {t('compliance')} <ArrowRight size={13} />
                    </button>
                    <button
                      className="btn-secondary text-xs py-2"
                      onClick={() => navigate(`/bidders/${bidder.id}`)}
                    >
                      {t('details')}
                    </button>
                    {bidder.status !== 'analyzed' && (
                      <button
                        className="btn-secondary text-xs py-2"
                        disabled={isAnalyzing}
                        onClick={async () => {
                          setAnalyzing((p) => ({ ...p, [bidder.id]: true }))
                          try {
                            await analyzeBidder(bidder.id)
                            showToast(`${bidder.name} analyzed`, 'success')
                            load()
                          } catch { showToast('Analysis failed', 'error') }
                          setAnalyzing((p) => ({ ...p, [bidder.id]: false }))
                        }}
                      >
                        {isAnalyzing
                          ? <><RefreshCw size={12} className="animate-spin" /> Analyzing…</>
                          : <><RefreshCw size={12} /> Analyze</>
                        }
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
