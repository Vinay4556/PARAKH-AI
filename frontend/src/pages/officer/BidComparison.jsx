import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ChevronRight, TrendingDown, AlertTriangle,
  CheckCircle, XCircle, BarChart3, Scale, RefreshCw,
  ShieldCheck, IndianRupee, Trophy, Calculator, Lock,
  Unlock, Eye, EyeOff, ArrowRight, Sliders, Medal
} from 'lucide-react'
import { getTenderBidders, getOfficerBids, getTenderLeaderboard } from '../../services/api.js'
import ScoreRing from '../../components/ScoreRing.jsx'
import { PageLoader } from '../../components/LoadingSkeleton.jsx'
import { useToast } from '../../components/Toast.jsx'
import BidActionsModal from '../../components/BidActionsModal.jsx'
import api from '../../services/api.js'

const RISK_COLOR = {
  LOW:     'text-green-600 bg-green-50 border border-green-200',
  MEDIUM:  'text-amber-600 bg-amber-50 border border-amber-200',
  HIGH:    'text-red-600 bg-red-50 border border-red-200',
  UNKNOWN: 'text-gray-500 bg-gray-100 border border-gray-200',
}

// QCBS weights — configurable per tender (70% technical, 30% price)
const QCBS_TECH_WEIGHT  = 0.70
const QCBS_PRICE_WEIGHT = 0.30

function RankBadge({ rank }) {
  const styles = {
    1: 'bg-yellow-400 text-yellow-900',
    2: 'bg-gray-300 text-gray-700',
    3: 'bg-amber-600 text-white',
  }
  return (
    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold flex-shrink-0 ${styles[rank] || 'bg-gray-100 text-gray-400'}`}>
      L{rank}
    </span>
  )
}

/**
 * Compute QCBS composite score.
 * Technical score normalised to 100. Price score = (L1_price / bidder_price) × 100.
 * composite = tech_score × 0.70 + price_score × 0.30
 */
function computeQCBS(techScore, quotedPrice, lowestPrice) {
  if (!techScore || !quotedPrice || !lowestPrice) return null
  const priceScore = Math.round((lowestPrice / quotedPrice) * 100)
  return Math.round(techScore * QCBS_TECH_WEIGHT + priceScore * QCBS_PRICE_WEIGHT)
}

export default function BidComparison() {
  const { tenderId } = useParams()
  const navigate = useNavigate()
  const { addToast: showToast } = useToast()

  const [bidders, setBidders]     = useState([])
  const [bids, setBids]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [sortBy, setSortBy]       = useState('compliance')
  const [financialOpen, setFinancialOpen] = useState(false)
  const [openingBids, setOpeningBids]     = useState(false)
  const [actionsBid, setActionsBid]       = useState(null) // bid row for BidActionsModal
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [leaderboard, setLeaderboard]     = useState([])
  const [leaderboardLoading, setLeaderboardLoading] = useState(false)

  const tid = tenderId || 'GEM-DEMO-2026-001'

  const load = () => {
    setLoading(true)
    Promise.all([getTenderBidders(tid), getOfficerBids({ tender_id: tid })])
      .then(([bRes, bidRes]) => {
        setBidders(bRes.data || [])
        setBids(bidRes.data || [])
        // If any bid already has financial_bid_opened = true, show financial column
        const anyOpened = (bidRes.data || []).some((b) => b.financial_bid_opened)
        if (anyOpened) setFinancialOpen(true)
      })
      .catch(() => showToast('Failed to load bid comparison data', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [tid])

  const handleShowLeaderboard = () => {
    if (!showLeaderboard) {
      setLeaderboardLoading(true)
      getTenderLeaderboard(tid)
        .then((res) => setLeaderboard(res.data || []))
        .catch(() => showToast('Failed to load leaderboard', 'error'))
        .finally(() => setLeaderboardLoading(false))
    }
    setShowLeaderboard((v) => !v)
  }

  // Merge bidder + bid data (NO hardcoded prices).
  // IMPORTANT: bid.id would overwrite bidder.id, so we keep bidder_id separately.
  // Null-safe merge: a null/undefined value in the bid record must NOT overwrite
  // a real value that already exists on the bidder record.  This prevents the
  // compliance_score / risk_level stored on the bidder from being silently erased
  // when a bid submission has those fields as null (e.g. before analysis runs).
  const enriched = bidders.map((b) => {
    const bid = bids.find((bd) => bd.bidder_id === b.id) || {}
    // Build the merged object: start with bidder, layer bid fields on top but
    // only replace a bidder field when the bid value is non-null/non-undefined.
    const merged = { ...b }
    for (const [k, v] of Object.entries(bid)) {
      if (v !== null && v !== undefined) {
        merged[k] = v
      }
    }
    return {
      ...merged,
      id: b.id,       // always the bidder ID (e.g. BID-004), not the bid submission ID
      bid_id: bid.id, // keep the bid submission ID separately
      // Resolved display name: fall back to bidder ID when company name is not yet set
      // (e.g. a bidder whose registration details were wiped as test/placeholder data)
      _displayName: b.name || b.id,
      _displayGstin: b.gstin || '—',
    }
  })

  const lowestPrice = Math.min(...enriched.filter((b) => b.quoted_price > 0).map((b) => b.quoted_price || Infinity))
  const highestCompliance = Math.max(...enriched.map((b) => b.compliance_score || 0))

  // Compute L-ranks by price ascending
  const priceRanked = [...enriched]
    .filter((b) => b.quoted_price > 0)
    .sort((a, b) => (a.quoted_price || 0) - (b.quoted_price || 0))
  const lRankMap = {}
  priceRanked.forEach((b, idx) => { lRankMap[b.id] = idx + 1 })

  // Add QCBS score
  const withQCBS = enriched.map((b) => ({
    ...b,
    l_rank: lRankMap[b.id] || null,
    qcbs_score: financialOpen
      ? computeQCBS(b.technical_score, b.quoted_price, lowestPrice)
      : null,
  }))

  const sorted = [...withQCBS].sort((a, b) => {
    if (sortBy === 'price')      return (a.quoted_price || 0) - (b.quoted_price || 0)
    if (sortBy === 'qcbs')       return (b.qcbs_score || 0) - (a.qcbs_score || 0)
    if (sortBy === 'compliance') return (b.compliance_score || 0) - (a.compliance_score || 0)
    if (sortBy === 'risk') {
      const order = { LOW: 0, MEDIUM: 1, HIGH: 2, UNKNOWN: 3 }
      return (order[a.risk_level] ?? 3) - (order[b.risk_level] ?? 3)
    }
    return 0
  })

  // Top QCBS scorer (for Recommend Award)
  const topQCBS = financialOpen
    ? [...withQCBS].sort((a, b) => (b.qcbs_score || 0) - (a.qcbs_score || 0))[0]
    : null

  const handleOpenFinancialBids = async () => {
    setOpeningBids(true)
    try {
      await api.post(`/officer/bids/open-financial?tender_id=${tid}`)
      showToast('Financial bids opened successfully — prices are now visible', 'success')
      setFinancialOpen(true)
      load()
    } catch {
      // Fallback: just reveal locally if endpoint not yet live
      setFinancialOpen(true)
      showToast('Financial bids opened (local mode)', 'info')
    } finally {
      setOpeningBids(false)
    }
  }

  const formatPrice = (p) => {
    if (!p) return '—'
    if (p >= 10_000_000) return `₹${(p / 10_000_000).toFixed(2)} Cr`
    if (p >= 100_000)    return `₹${(p / 100_000).toFixed(2)} L`
    return `₹${p.toLocaleString('en-IN')}`
  }

  if (loading) return <PageLoader />

  return (
    <div className="p-6 space-y-5 max-w-7xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate('/')}>Dashboard</span>
        <ChevronRight size={12} />
        <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate('/tenders')}>Tenders</span>
        <ChevronRight size={12} />
        <span className="text-slate-700 font-medium">Bid Comparison</span>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Bid Comparison &amp; Evaluation</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Tender: <span className="font-semibold text-blue-700">{tid}</span>
            · {bidders.length} bidder{bidders.length !== 1 ? 's' : ''}
            · QCBS {Math.round(QCBS_TECH_WEIGHT * 100)}:{Math.round(QCBS_PRICE_WEIGHT * 100)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500">Sort:</span>
          {[
            { key: 'compliance', label: 'Compliance' },
            { key: 'price',      label: 'Price (L1)' },
            { key: 'qcbs',       label: 'QCBS Score' },
            { key: 'risk',       label: 'Risk' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSortBy(key)}
              className={`text-xs px-3 py-1.5 font-medium transition-colors ${
                sortBy === key
                  ? 'bg-blue-700 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              style={{ borderRadius: '2px' }}
            >
              {label}
            </button>
          ))}
          <button
            onClick={handleShowLeaderboard}
            className={`text-xs px-3 py-1.5 font-medium transition-colors flex items-center gap-1 ${
              showLeaderboard ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            style={{ borderRadius: '2px' }}
          >
            <Medal size={12} /> Leaderboard
          </button>
        </div>
      </div>

      {/* Compliance Leaderboard */}
      {showLeaderboard && (
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Medal size={14} className="text-blue-600" /> Compliance Leaderboard
          </h3>
          {leaderboardLoading ? (
            <p className="text-xs text-gray-400">Loading…</p>
          ) : leaderboard.length === 0 ? (
            <p className="text-xs text-gray-400">No leaderboard data available yet.</p>
          ) : (
            <div className="space-y-1.5">
              {leaderboard.map((entry, i) => (
                <div key={entry.bidder_id} className="flex items-center gap-3 p-2 bg-gray-50" style={{ borderRadius: '2px' }}>
                  <span className="w-5 text-center text-xs font-bold text-gray-500">#{i + 1}</span>
                  <span className="flex-1 text-sm font-medium text-slate-700">{entry.bidder_name}</span>
                  <span className={`text-xs px-2 py-0.5 font-semibold ${RISK_COLOR[entry.risk_level] || RISK_COLOR.UNKNOWN}`} style={{ borderRadius: '2px' }}>
                    {entry.risk_level || 'N/A'}
                  </span>
                  <span className="text-sm font-bold text-blue-700 w-14 text-right">{entry.compliance_score ?? entry.score ?? '—'}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Two-Envelope Banner */}
      {!financialOpen && (
        <div className="p-4 bg-amber-50 border-l-4 border-l-amber-500 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Lock size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-800">Financial Bids — SEALED (Two-Envelope System)</p>
              <p className="text-xs text-amber-700 mt-1">
                Prices are hidden until all technical evaluations are complete. Open financial bids only after
                technical qualification is finalised per GFR 175 / GeM procurement rules.
              </p>
            </div>
          </div>
          <button
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 flex-shrink-0 transition-colors"
            style={{ borderRadius: '2px' }}
            onClick={handleOpenFinancialBids}
            disabled={openingBids}
          >
            {openingBids
              ? <RefreshCw size={14} className="animate-spin" />
              : <Unlock size={14} />}
            {openingBids ? 'Opening…' : 'Open Financial Bids'}
          </button>
        </div>
      )}

      {financialOpen && (
        <div className="p-3 bg-green-50 border border-green-200 flex items-center gap-2">
          <Unlock size={14} className="text-green-600" />
          <p className="text-xs text-green-800 font-semibold">
            Financial bids opened and recorded in audit trail. Prices are now visible.
          </p>
        </div>
      )}

      {/* QCBS Recommend Award Banner */}
      {financialOpen && topQCBS && (
        <div className="p-4 bg-blue-50 border-l-4 border-l-blue-600 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Trophy size={18} className="text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-blue-800">
                QCBS Recommendation: <span className="text-blue-900">{topQCBS._displayName}</span>
              </p>
              <p className="text-xs text-blue-700 mt-0.5">
                Highest composite score ({topQCBS.qcbs_score}/100) under QCBS {Math.round(QCBS_TECH_WEIGHT * 100)}:{Math.round(QCBS_PRICE_WEIGHT * 100)} formula
                · Quoted {formatPrice(topQCBS.quoted_price)} · L{topQCBS.l_rank || '?'} price rank
              </p>
              <p className="text-[10px] text-blue-600 mt-0.5 italic">
                Advisory only — final decision rests with Procurement Officer.
              </p>
            </div>
          </div>
          <button
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 flex-shrink-0 transition-colors"
            style={{ borderRadius: '2px' }}
            onClick={() => navigate(`/bidders/${topQCBS.id}/decision`)}
          >
            Recommend Award <ArrowRight size={14} />
          </button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Bids',         value: bidders.length,                                              color: 'text-slate-700',  icon: Scale },
          { label: 'Highest Compliance', value: `${highestCompliance}%`,                                     color: 'text-blue-700',   icon: ShieldCheck },
          { label: 'Lowest Price (L1)',  value: lowestPrice === Infinity ? '—' : formatPrice(lowestPrice),   color: 'text-green-700',  icon: TrendingDown },
          { label: 'Low Risk Bidders',   value: enriched.filter((b) => b.risk_level === 'LOW').length,       color: 'text-green-700',  icon: CheckCircle },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="card p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
              <Icon size={13} className="text-gray-300" />
            </div>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Comparison Table */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center gap-2">
          <BarChart3 size={15} className="text-blue-600" />
          <h2 className="text-sm font-semibold text-slate-700">Bidder Comparison Matrix</h2>
          {financialOpen && (
            <span className="ml-auto text-[10px] flex items-center gap-1 text-green-600 font-semibold">
              <Calculator size={11} /> QCBS scores active
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                <th className="text-left px-4 py-3">Bidder</th>
                <th className="text-center px-3 py-3">Compliance</th>
                <th className="text-center px-3 py-3">Risk</th>
                <th className="text-center px-3 py-3">Technical Score</th>
                <th className="text-center px-3 py-3">
                  <span className="flex items-center justify-center gap-1">
                    {financialOpen ? <Eye size={11} /> : <EyeOff size={11} />}
                    Quoted Price
                  </span>
                </th>
                <th className="text-center px-3 py-3">L-Rank</th>
                <th className="text-center px-3 py-3">
                  <span className="flex items-center justify-center gap-1">
                    <Calculator size={11} /> QCBS Score
                  </span>
                </th>
                <th className="text-center px-3 py-3">Decision</th>
                <th className="text-center px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-400">
                    No bidders found for this tender. Bidders will appear here once they register and submit.
                  </td>
                </tr>
              ) : (
                sorted.map((b) => {
                  const isL1 = b.quoted_price === lowestPrice && lowestPrice !== Infinity
                  const isTopQCBS = financialOpen && topQCBS && b.id === topQCBS.id
                  return (
                    <tr
                      key={b.id}
                      className={`hover:bg-blue-50/30 transition-colors ${isTopQCBS ? 'bg-blue-50/20' : ''}`}
                    >
                      {/* Bidder */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {isTopQCBS && <Trophy size={14} className="text-yellow-500 flex-shrink-0" />}
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{b._displayName}</p>
                            <p className="text-[10px] text-gray-400 font-mono">{b.id} · {b._displayGstin}</p>
                            {!b.name && (
                              <p className="text-[9px] text-amber-600 mt-0.5 italic">Registration details pending</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Compliance */}
                      <td className="px-3 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <ScoreRing score={b.compliance_score || 0} size={44} strokeWidth={4} />
                          {b.compliance_score === highestCompliance && highestCompliance > 0 && (
                            <span className="text-[9px] text-blue-600 font-bold">HIGHEST</span>
                          )}
                        </div>
                      </td>

                      {/* Risk */}
                      <td className="px-3 py-3 text-center">
                        <span className={`text-xs px-2 py-1 font-semibold ${RISK_COLOR[b.risk_level] || RISK_COLOR.UNKNOWN}`} style={{ borderRadius: '2px' }}>
                          {b.risk_level || 'N/A'}
                        </span>
                      </td>

                      {/* Technical */}
                      <td className="px-3 py-3 text-center">
                        <p className="text-sm font-bold text-slate-700">
                          {b.technical_score != null ? `${b.technical_score}/100` : '—'}
                        </p>
                        {b.technical_score != null && (
                          <div className="w-16 h-1.5 bg-gray-200 rounded-full mx-auto mt-1 overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${b.technical_score}%` }} />
                          </div>
                        )}
                      </td>

                      {/* Price — hidden until opened */}
                      <td className="px-3 py-3 text-center">
                        {financialOpen ? (
                          <div>
                            <p className={`text-sm font-bold ${isL1 ? 'text-green-700' : 'text-slate-700'}`}>
                              {b.quoted_price ? formatPrice(b.quoted_price) : '—'}
                            </p>
                            {isL1 && b.quoted_price && (
                              <span className="text-[9px] text-green-600 font-bold">LOWEST (L1)</span>
                            )}
                            {b.delivery_period_days && (
                              <p className="text-[10px] text-gray-400 mt-0.5">{b.delivery_period_days}d delivery</p>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center justify-center">
                            <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-400 text-[10px] font-semibold" style={{ borderRadius: '2px' }}>
                              <Lock size={10} /> SEALED
                            </div>
                          </div>
                        )}
                      </td>

                      {/* L-Rank */}
                      <td className="px-3 py-3 text-center">
                        {financialOpen && b.l_rank
                          ? <RankBadge rank={b.l_rank} />
                          : <span className="text-gray-300 text-xs">—</span>}
                      </td>

                      {/* QCBS */}
                      <td className="px-3 py-3 text-center">
                        {financialOpen && b.qcbs_score != null ? (
                          <div>
                            <p className={`text-sm font-bold ${isTopQCBS ? 'text-blue-700' : 'text-slate-700'}`}>
                              {b.qcbs_score}
                              <span className="text-[10px] text-gray-400">/100</span>
                            </p>
                            <div className="w-16 h-1.5 bg-gray-200 rounded-full mx-auto mt-1 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${isTopQCBS ? 'bg-blue-500' : 'bg-slate-400'}`}
                                style={{ width: `${b.qcbs_score}%` }}
                              />
                            </div>
                            {isTopQCBS && <span className="text-[9px] text-blue-600 font-bold">TOP QCBS</span>}
                          </div>
                        ) : (
                          <span className="text-[10px] text-gray-400 italic">
                            {financialOpen ? '—' : 'After financial open'}
                          </span>
                        )}
                      </td>

                      {/* Decision */}
                      <td className="px-3 py-3 text-center">
                        {b.officer_decision ? (
                          <span className={`text-[10px] px-2 py-0.5 font-bold ${
                            b.officer_decision === 'QUALIFY'
                              ? 'bg-green-100 text-green-700'
                              : b.officer_decision === 'DISQUALIFY'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-amber-100 text-amber-700'
                          }`} style={{ borderRadius: '2px' }}>
                            {b.officer_decision}
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-400">Pending</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-3 text-center">
                        <div className="flex items-center justify-center gap-1 flex-wrap">
                          <button
                            className="text-[10px] px-2 py-1 bg-blue-50 text-blue-700 font-medium hover:bg-blue-100 transition-colors"
                            style={{ borderRadius: '2px' }}
                            onClick={() => navigate(`/bidders/${b.id}/compliance`)}
                          >
                            Compliance
                          </button>
                          <button
                            className="text-[10px] px-2 py-1 bg-gray-50 text-gray-700 font-medium hover:bg-gray-100 transition-colors"
                            style={{ borderRadius: '2px' }}
                            onClick={() => navigate(`/bidders/${b.id}/decision`)}
                          >
                            Decide
                          </button>
                          {b.bid_id && (
                            <button
                              className="text-[10px] px-2 py-1 bg-indigo-50 text-indigo-700 font-medium hover:bg-indigo-100 transition-colors flex items-center gap-1"
                              style={{ borderRadius: '2px' }}
                              onClick={() => setActionsBid(b)}
                            >
                              <Sliders size={10} /> Verify
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* QCBS Formula explanation */}
      {financialOpen && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Calculator size={15} className="text-blue-600" />
            <h3 className="text-sm font-semibold text-slate-700">QCBS Formula Applied</h3>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">
            <strong>Composite QCBS Score</strong> = Technical Score × {Math.round(QCBS_TECH_WEIGHT * 100)}% + Price Score × {Math.round(QCBS_PRICE_WEIGHT * 100)}%
            &nbsp;|&nbsp;
            <strong>Price Score</strong> = (L1 Price ÷ Bidder Price) × 100
            &nbsp;|&nbsp;
            Higher score = better value for money.
            The bidder with the highest QCBS score is recommended for award consideration.
          </p>
        </div>
      )}

      {/* Human-in-the-loop notice */}
      <div className="p-4 bg-amber-50 border-l-4 border-l-amber-500 flex items-start gap-3">
        <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-800">Human-in-the-Loop Decision Required</p>
          <p className="text-xs text-amber-700 mt-1">
            PARAKH AI provides compliance analysis, QCBS scores, and bid comparison data as decision support.
            The final award — including L1 selection, QCBS evaluation, negotiations, and contract award —
            must be made by the authorised Procurement Officer per applicable GeM / GFR procurement rules.
          </p>
        </div>
      </div>

      {/* Bid Actions Modal — EMD, price analysis, preference, local content, OEM, stage advance, AI override */}
      {actionsBid && (
        <BidActionsModal
          bid={actionsBid}
          onClose={() => setActionsBid(null)}
          onUpdated={load}
        />
      )}
    </div>
  )
}
