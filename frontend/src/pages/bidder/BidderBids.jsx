import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Package, ChevronRight, Clock, CheckCircle, XCircle,
  AlertTriangle, RefreshCw, FileText, ArrowRight, TrendingUp,
  Edit2, Trash2, History, Lock, IndianRupee, Calendar
} from 'lucide-react'
import { getBidderBids, getBidderDashboard, withdrawBid, getBidVersions } from '../../services/api.js'
import { PageLoader } from '../../components/LoadingSkeleton.jsx'
import { useToast } from '../../components/Toast.jsx'

const STATUS_CONFIG = {
  DRAFT:                 { label: 'Draft',                 color: 'bg-gray-100 text-gray-600 border-gray-200',        icon: FileText },
  SUBMITTED:             { label: 'Submitted',             color: 'bg-blue-50 text-blue-700 border-blue-200',         icon: Clock },
  UNDER_INITIAL_SCRUTINY:{ label: 'Under Scrutiny',        color: 'bg-indigo-50 text-indigo-700 border-indigo-200',   icon: Clock },
  EMD_VERIFICATION:      { label: 'EMD Verification',      color: 'bg-amber-50 text-amber-700 border-amber-200',      icon: IndianRupee },
  COMPLIANCE_REVIEW:     { label: 'Compliance Review',     color: 'bg-amber-50 text-amber-700 border-amber-200',      icon: Clock },
  TECHNICAL_EVALUATION:  { label: 'Technical Evaluation',  color: 'bg-blue-50 text-blue-700 border-blue-200',         icon: FileText },
  TECHNICAL_ACCEPTED:    { label: 'Technically Accepted',  color: 'bg-teal-50 text-teal-700 border-teal-200',         icon: CheckCircle },
  FINANCIAL_EVALUATION:  { label: 'Financial Evaluation',  color: 'bg-purple-50 text-purple-700 border-purple-200',   icon: TrendingUp },
  RECOMMENDED:           { label: 'Recommended',           color: 'bg-green-50 text-green-700 border-green-200',      icon: CheckCircle },
  AWARDED:               { label: 'Contract Awarded',      color: 'bg-green-50 text-green-700 border-green-200',      icon: CheckCircle },
  WITHDRAWN:             { label: 'Withdrawn',             color: 'bg-gray-100 text-gray-500 border-gray-200',        icon: XCircle },
  DISQUALIFIED:          { label: 'Disqualified',          color: 'bg-red-50 text-red-700 border-red-200',            icon: XCircle },
  REJECTED:              { label: 'Rejected',              color: 'bg-red-50 text-red-700 border-red-200',            icon: XCircle },
  CANCELLED:             { label: 'Cancelled',             color: 'bg-gray-100 text-gray-500 border-gray-200',        icon: XCircle },
}

const STAGES = ['SUBMITTED', 'COMPLIANCE_REVIEW', 'TECHNICAL_EVALUATION', 'FINANCIAL_EVALUATION', 'AWARDED']
const TERMINAL = ['WITHDRAWN', 'DISQUALIFIED', 'REJECTED', 'CANCELLED']

function BidTimeline({ status }) {
  const currentIdx = STAGES.indexOf(status)
  if (TERMINAL.includes(status)) return null
  return (
    <div className="flex items-center gap-0 mt-3">
      {STAGES.map((stage, i) => {
        const done = i < currentIdx
        const active = i === currentIdx
        return (
          <React.Fragment key={stage}>
            <div className="flex flex-col items-center">
              <div className={`w-6 h-6 flex items-center justify-center text-[9px] font-bold border-2 ${
                done ? 'bg-green-500 border-green-500 text-white' :
                active ? 'bg-blue-600 border-blue-600 text-white' :
                'bg-white border-gray-200 text-gray-400'}`}
                style={{ borderRadius: '50%' }}>
                {done ? '✓' : i + 1}
              </div>
              <span className={`text-[9px] mt-1 whitespace-nowrap ${active ? 'text-blue-700 font-semibold' : done ? 'text-green-600' : 'text-gray-400'}`}>
                {stage.split('_')[0]}
              </span>
            </div>
            {i < STAGES.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 mb-3.5 ${done ? 'bg-green-400' : 'bg-gray-200'}`} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

export default function BidderBids() {
  const navigate = useNavigate()
  const { addToast } = useToast()
  const [bids, setBids] = useState([])
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [withdrawingId, setWithdrawingId] = useState(null)
  const [versionsModal, setVersionsModal] = useState(null) // { bidId, data }
  const [confirmWithdraw, setConfirmWithdraw] = useState(null) // bid
  const [withdrawReason, setWithdrawReason] = useState('')

  const load = () => {
    Promise.all([getBidderBids(), getBidderDashboard()])
      .then(([bRes, dRes]) => {
        setBids(bRes.data || [])
        setDashboard(dRes.data)
      })
      .catch(() => addToast('Failed to load bids', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleWithdraw = async () => {
    if (!confirmWithdraw) return
    setWithdrawingId(confirmWithdraw.id)
    try {
      await withdrawBid(confirmWithdraw.id, { reason: withdrawReason, bidder_id: confirmWithdraw.bidder_id })
      addToast('Bid withdrawn successfully', 'success')
      setConfirmWithdraw(null)
      setWithdrawReason('')
      load()
    } catch (err) {
      addToast(err.message || 'Withdrawal failed', 'error')
    } finally {
      setWithdrawingId(null)
    }
  }

  const handleViewVersions = async (bidId) => {
    try {
      const res = await getBidVersions(bidId)
      setVersionsModal({ bidId, data: res.data })
    } catch {
      addToast('Could not load version history', 'error')
    }
  }

  const formatPrice = (p) => {
    if (!p) return '—'
    if (p >= 10_000_000) return `₹${(p / 10_000_000).toFixed(2)} Cr`
    if (p >= 100_000) return `₹${(p / 100_000).toFixed(2)} L`
    return `₹${p.toLocaleString('en-IN')}`
  }

  const canWithdraw = (bid) => !TERMINAL.includes(bid.status) && bid.status !== 'AWARDED'

  if (loading) return <PageLoader />

  const activeCount = bids.filter(b => !TERMINAL.includes(b.status) && b.status !== 'DRAFT').length
  const draftCount = bids.filter(b => b.status === 'DRAFT').length
  const withdrawnCount = bids.filter(b => b.status === 'WITHDRAWN').length
  const awardedCount = bids.filter(b => b.status === 'AWARDED').length

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate('/bidder/dashboard')}>Dashboard</span>
        <ChevronRight size={12} />
        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>My Bids</span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">My Bids</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track all bid submissions, drafts, and withdrawal status</p>
        </div>
        <button className="btn-primary text-xs" onClick={() => navigate('/bidder/submit-bid')}>
          <Package size={13} /> Submit New Bid
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Active Bids',   value: activeCount,   color: 'text-blue-700' },
          { label: 'Drafts',        value: draftCount,    color: 'text-gray-500' },
          { label: 'Awarded',       value: awardedCount,  color: 'text-green-600' },
          { label: 'Withdrawn',     value: withdrawnCount, color: 'text-gray-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card p-4 text-center">
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Bids List */}
      {bids.length === 0 ? (
        <div className="card p-10 text-center">
          <Package size={40} className="mx-auto mb-3 text-gray-200" />
          <p className="text-sm font-semibold text-slate-700">No bids submitted yet</p>
          <button className="btn-primary mt-4" onClick={() => navigate('/bidder/tenders')}>
            Browse Tenders <ArrowRight size={14} />
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {bids.map((bid) => {
            const statusCfg = STATUS_CONFIG[bid.status] || STATUS_CONFIG.SUBMITTED
            const StatusIcon = statusCfg.icon
            const isTerminal = TERMINAL.includes(bid.status)
            const isDraft = bid.status === 'DRAFT'
            const isAwarded = bid.status === 'AWARDED'
            const borderColor = isAwarded ? 'border-l-green-500' : isTerminal ? 'border-l-gray-300' : isDraft ? 'border-l-gray-300' : 'border-l-blue-500'

            return (
              <div key={bid.id} className={`card p-5 transition-shadow hover:shadow-md border-l-4 ${borderColor}`}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-slate-800">{bid.id}</h3>
                      <span className={`text-[10px] px-2 py-0.5 border font-semibold ${statusCfg.color}`} style={{ borderRadius: '2px' }}>
                        <StatusIcon size={9} className="inline mr-0.5" />
                        {statusCfg.label}
                      </span>
                      {(bid.version_number || 0) > 1 && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-600 border border-blue-200 font-semibold" style={{ borderRadius: '2px' }}>
                          v{bid.version_number}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{bid.tender_id}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[10px] text-gray-400">Submitted</p>
                    <p className="text-xs font-semibold text-slate-700">
                      {bid.submitted_at ? new Date(bid.submitted_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Draft'}
                    </p>
                  </div>
                </div>

                {/* Financial summary */}
                {bid.quoted_price > 0 && (
                  <div className="flex items-center gap-4 p-2.5 bg-gray-50 mb-3 text-xs" style={{ borderRadius: '2px' }}>
                    <span className="text-gray-500">Quoted:</span>
                    <span className="font-bold text-green-700">{formatPrice(bid.quoted_price)}</span>
                    {bid.delivery_period_days && <><span className="text-gray-400">·</span><span className="text-gray-500">Delivery: {bid.delivery_period_days}d</span></>}
                    {bid.validity_expires_at && <><span className="text-gray-400">·</span><span className="text-gray-500">Valid until: {new Date(bid.validity_expires_at).toLocaleDateString('en-IN')}</span></>}
                    {bid.emd_status && (
                      <span className={`ml-auto px-1.5 py-0.5 text-[10px] font-bold border ${
                        bid.emd_status === 'VERIFIED' ? 'bg-green-50 text-green-700 border-green-200' :
                        bid.emd_status === 'MISMATCH' ? 'bg-red-50 text-red-700 border-red-200' :
                        'bg-amber-50 text-amber-700 border-amber-200'}`} style={{ borderRadius: '2px' }}>
                        EMD: {bid.emd_status}
                      </span>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3 text-center mb-3">
                  {[
                    { label: 'Compliance', value: bid.compliance_score != null ? `${bid.compliance_score}%` : '—', color: (bid.compliance_score || 0) >= 80 ? 'text-green-600' : 'text-amber-600' },
                    { label: 'Risk',       value: bid.risk_level || '—', color: bid.risk_level === 'LOW' ? 'text-green-600' : bid.risk_level === 'HIGH' ? 'text-red-600' : 'text-amber-600' },
                    { label: 'Technical',  value: bid.technical_score != null ? `${bid.technical_score}/100` : bid.technical_status || 'Pending', color: 'text-gray-600' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-gray-50 p-2" style={{ borderRadius: '2px' }}>
                      <p className={`text-sm font-bold ${color}`}>{value}</p>
                      <p className="text-[10px] text-gray-400">{label}</p>
                    </div>
                  ))}
                </div>

                {!isTerminal && !isDraft && <BidTimeline status={bid.status} />}
                {bid.withdrawal_reason && (
                  <div className="mt-2 p-2 bg-gray-50 text-xs text-gray-500 border-l-2 border-gray-300">
                    Withdrawal reason: {bid.withdrawal_reason}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100 flex-wrap">
                  <button className="text-xs text-blue-600 hover:underline flex items-center gap-1" onClick={() => navigate('/bidder/readiness')}>
                    <FileText size={11} /> Readiness
                  </button>
                  <button className="text-xs text-blue-600 hover:underline flex items-center gap-1" onClick={() => navigate('/bidder/clarifications')}>
                    <AlertTriangle size={11} /> Clarifications
                  </button>
                  {(bid.versions?.length > 0 || (bid.version_number || 1) > 1) && (
                    <button className="text-xs text-purple-600 hover:underline flex items-center gap-1" onClick={() => handleViewVersions(bid.id)}>
                      <History size={11} /> Version History
                    </button>
                  )}
                  {isDraft && (
                    <button className="text-xs text-blue-600 hover:underline flex items-center gap-1" onClick={() => navigate(`/bidder/submit-bid?tender=${encodeURIComponent(bid.tender_id || '')}`)}>
                      <Edit2 size={11} /> Complete &amp; Submit
                    </button>
                  )}
                  {!isDraft && !isTerminal && bid.status !== 'AWARDED' && (
                    <button className="text-xs text-blue-600 hover:underline flex items-center gap-1" onClick={() => navigate(`/bidder/submit-bid/${bid.id}`)}>
                      <Edit2 size={11} /> Modify Bid
                    </button>
                  )}
                  {canWithdraw(bid) && (
                    <button className="ml-auto text-xs text-red-500 hover:underline flex items-center gap-1"
                      onClick={() => setConfirmWithdraw(bid)}>
                      <Trash2 size={11} /> Withdraw
                    </button>
                  )}
                  {isAwarded && (
                    <span className="ml-auto text-xs text-green-700 font-semibold flex items-center gap-1">
                      <CheckCircle size={11} /> Contract Awarded
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Withdraw Confirmation Modal */}
      {confirmWithdraw && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
          <div className="bg-white p-6 w-full max-w-sm shadow-2xl" style={{ borderRadius: '2px' }}>
            <h3 className="text-base font-bold text-slate-800 mb-1">Withdraw Bid</h3>
            <p className="text-xs text-gray-500 mb-4">
              Withdraw <strong>{confirmWithdraw.id}</strong>? This cannot be undone after the deadline.
            </p>
            <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Reason (optional)</label>
            <textarea rows={3} value={withdrawReason} onChange={(e) => setWithdrawReason(e.target.value)}
              placeholder="Reason for withdrawal…"
              className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none resize-none mb-4"
              style={{ borderRadius: '2px' }} />
            <div className="flex gap-3">
              <button className="btn-secondary flex-1 justify-center" onClick={() => { setConfirmWithdraw(null); setWithdrawReason('') }}>Cancel</button>
              <button
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700"
                style={{ borderRadius: '2px' }}
                onClick={handleWithdraw}
                disabled={!!withdrawingId}>
                {withdrawingId ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
                {withdrawingId ? 'Withdrawing…' : 'Confirm Withdrawal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Version History Modal */}
      {versionsModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
          <div className="bg-white p-6 w-full max-w-lg shadow-2xl" style={{ borderRadius: '2px' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-800">Bid Version History — {versionsModal.bidId}</h3>
              <button onClick={() => setVersionsModal(null)} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
            </div>
            {versionsModal.data?.versions?.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-6">No prior versions. Current submission is the first version.</p>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {(versionsModal.data?.versions || []).map((v, i) => (
                  <div key={i} className="p-3 bg-gray-50 border border-gray-200" style={{ borderRadius: '2px' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5" style={{ borderRadius: '2px' }}>V{v.version}</span>
                      <span className="text-xs text-gray-500">{v.archived_at ? new Date(v.archived_at).toLocaleString('en-IN') : ''}</span>
                    </div>
                    <p className="text-xs text-gray-600">
                      Quoted: <strong>{v.quoted_price ? formatPrice(v.quoted_price) : '—'}</strong>
                      {v.delivery_period_days ? ` · Delivery: ${v.delivery_period_days}d` : ''}
                    </p>
                  </div>
                ))}
                <div className="p-3 border-2 border-blue-400 bg-blue-50" style={{ borderRadius: '2px' }}>
                  <span className="text-xs font-bold text-blue-700">V{versionsModal.data?.current_version || 1} (Current)</span>
                  <p className="text-xs text-gray-600 mt-1">
                    Quoted: <strong>{formatPrice(versionsModal.data?.current?.quoted_price)}</strong>
                  </p>
                </div>
              </div>
            )}
            <button className="btn-secondary w-full justify-center mt-4" onClick={() => setVersionsModal(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
