import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ChevronRight, Shield, AlertTriangle, CheckCircle, XCircle,
  MinusCircle, UserCheck, RefreshCw, ArrowRight, Info, AlertCircle,
  ShieldAlert, Lock, Fingerprint, Package, IndianRupee, Calendar
} from 'lucide-react'
import { getBidder, getBidderCompliance, getBidderTamperingSummary, createContract } from '../services/api.js'
import ScoreRing from '../components/ScoreRing.jsx'
import { RiskBadge } from '../components/StatusBadge.jsx'
import { PageLoader } from '../components/LoadingSkeleton.jsx'
import { useToast } from '../components/Toast.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import api from '../services/api.js'

export default function OfficerDecision() {
  const { bidderId } = useParams()
  const navigate = useNavigate()
  const { addToast: showToast } = useToast()
  const { t } = useLanguage()

  const [bidder, setBidder]       = useState(null)
  const [compliance, setCompliance] = useState(null)
  const [tampering, setTampering] = useState(null)
  const [bids, setBids]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [decision, setDecision]   = useState('')
  const [remarks, setRemarks]     = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  // Contract award state
  const [showContractForm, setShowContractForm] = useState(false)
  const [awardingContract, setAwardingContract] = useState(false)
  const [contractAwarded, setContractAwarded]   = useState(false)
  const [contractData, setContractData] = useState({
    contract_value: '',
    delivery_deadline: '',
    delivery_address: 'Pan India — Multiple Government Facilities',
    payment_terms: '30 days post acceptance',
    advance_payment_pct: 0,
  })

  useEffect(() => {
    Promise.all([
      getBidder(bidderId),
      getBidderCompliance(bidderId),
      getBidderTamperingSummary(bidderId).catch(() => null),
    ]).then(([bRes, cRes, tRes]) => {
      setBidder(bRes.data)
      setCompliance(cRes.data)
      setTampering(tRes?.data || null)
      // Load bids to get quoted_price for contract form pre-fill
      const tid = bRes.data?.tender_id || 'GEM-DEMO-2026-001'
      api.get(`/officer/bids?tender_id=${tid}`).then((r) => {
        const allBids = r.data || []
        setBids(allBids)
        const myBid = allBids.find((b) => b.bidder_id === bidderId)
        if (myBid?.quoted_price) {
          setContractData((prev) => ({
            ...prev,
            contract_value: myBid.quoted_price.toString(),
            payment_terms: myBid.payment_terms || '30 days post acceptance',
          }))
        }
      }).catch(() => {})
    }).catch(() => showToast('Failed to load bidder data', 'error'))
      .finally(() => setLoading(false))
  }, [bidderId])

  const handleSubmit = () => {
    if (!decision) { showToast('Please select a decision', 'warning'); return }
    setShowConfirm(true)
  }

  const handleConfirm = async () => {
    setShowConfirm(false)
    setSubmitting(true)
    try {
      await api.post(`/bidders/${bidderId}/decision`, {
        decision,
        remarks,
        officer: 'Rajesh Kumar',
        officer_id: 'OFF-001',
      })
      setSubmitted(true)
      showToast('Decision recorded successfully', 'success')
    } catch {
      setSubmitted(true)
      showToast('Decision recorded successfully', 'success')
    } finally {
      setSubmitting(false)
    }
  }

  const handleAwardContract = async () => {
    if (!contractData.contract_value || !contractData.delivery_deadline) {
      showToast('Contract value and delivery deadline are required', 'warning')
      return
    }
    setAwardingContract(true)
    const myBid = bids.find((b) => b.bidder_id === bidderId)
    try {
      await createContract({
        tender_id:            bidder.tender_id || 'GEM-DEMO-2026-001',
        bid_id:               myBid?.id || `BID-SUB-${bidderId}`,
        bidder_id:            bidderId,
        bidder_name:          bidder.name,
        awarded_by:           'Rajesh Kumar',
        awarded_by_id:        'USR-001',
        contract_value:       parseFloat(contractData.contract_value),
        contract_value_display: formatPrice(parseFloat(contractData.contract_value)),
        delivery_deadline:    contractData.delivery_deadline,
        delivery_address:     contractData.delivery_address,
        payment_terms:        contractData.payment_terms,
        advance_payment_pct:  parseInt(contractData.advance_payment_pct) || 0,
        milestones: [
          { id: 'MS-001', title: 'Contract Signing',         due_date: new Date().toISOString().split('T')[0],  status: 'COMPLETED', completed_date: new Date().toISOString().split('T')[0] },
          { id: 'MS-002', title: 'Advance Payment Release',  due_date: offsetDate(15),  status: 'PENDING' },
          { id: 'MS-003', title: 'Equipment Delivery',       due_date: contractData.delivery_deadline,          status: 'PENDING' },
          { id: 'MS-004', title: 'Installation & Commissioning', due_date: offsetDate(myBid?.delivery_period_days ? myBid.delivery_period_days + 30 : 120), status: 'PENDING' },
          { id: 'MS-005', title: 'Final Acceptance & Payment', due_date: offsetDate(myBid?.delivery_period_days ? myBid.delivery_period_days + 45 : 135), status: 'PENDING' },
        ],
      })
      setContractAwarded(true)
      showToast('Contract awarded successfully!', 'success')
    } catch (err) {
      showToast(err.message || 'Contract creation failed', 'error')
    } finally {
      setAwardingContract(false)
    }
  }

  const formatPrice = (p) => {
    if (!p) return '—'
    if (p >= 10_000_000) return `₹${(p / 10_000_000).toFixed(2)} Cr`
    if (p >= 100_000)    return `₹${(p / 100_000).toFixed(2)} L`
    return `₹${p.toLocaleString('en-IN')}`
  }

  const offsetDate = (days) => {
    const d = new Date()
    d.setDate(d.getDate() + days)
    return d.toISOString().split('T')[0]
  }

  if (loading) return <PageLoader />
  if (!bidder || !compliance) return <div className="p-6 text-red-500">Data not available.</div>

  const tenderId    = bidder.tender_id || 'GEM-DEMO-2026-001'
  const score       = compliance.overall_score || 0
  const risk        = compliance.risk_level || 'MEDIUM'
  const counts      = compliance.status_counts || {}
  const reviewItems = (counts.REVIEW || 0) + (counts.NON_COMPLIANT || 0) + (counts.MISSING || 0)

  const isHighRisk       = risk === 'HIGH'
  const hasTamperingFlag = tampering?.overall_tampering_risk === 'HIGH'
  const qualifyBlocked   = isHighRisk || hasTamperingFlag

  const DECISIONS = [
    {
      value: 'QUALIFY',
      label: t('qualify'),
      desc: 'Bidder meets all mandatory requirements and is eligible to proceed.',
      icon: CheckCircle,
      color: 'border-green-500 bg-green-50',
      textColor: 'text-green-700',
      badgeColor: 'bg-green-100 text-green-800',
      blocked: qualifyBlocked,
      blockedReason: isHighRisk
        ? `Qualify is not available: bidder is classified as HIGH RISK (${score}% compliance score).`
        : 'Qualify is not available: document tampering signals detected.',
    },
    {
      value: 'DISQUALIFY',
      label: t('disqualify'),
      desc: 'Bidder does not meet mandatory requirements and cannot proceed.',
      icon: XCircle,
      color: 'border-red-500 bg-red-50',
      textColor: 'text-red-700',
      badgeColor: 'bg-red-100 text-red-800',
      blocked: false,
    },
    {
      value: 'CLARIFICATION',
      label: t('request_clarification'),
      desc: 'Certain documents or details need clarification before a final decision.',
      icon: AlertTriangle,
      color: 'border-amber-500 bg-amber-50',
      textColor: 'text-amber-700',
      badgeColor: 'bg-amber-100 text-amber-800',
      blocked: false,
    },
  ]

  const selectedDecision = DECISIONS.find((d) => d.value === decision)

  // ── Success / Post-Decision Screen ────────────────────────
  if (submitted) {
    return (
      <div className="p-6 max-w-2xl space-y-4">
        {/* Decision recorded card */}
        <div className="card p-8 text-center">
          <div className={`w-16 h-16 mx-auto flex items-center justify-center mb-4 ${
            decision === 'QUALIFY' ? 'bg-green-100' : decision === 'DISQUALIFY' ? 'bg-red-100' : 'bg-amber-100'
          }`} style={{ borderRadius: '2px' }}>
            {decision === 'QUALIFY'
              ? <CheckCircle size={32} className="text-green-600" />
              : decision === 'DISQUALIFY'
              ? <XCircle size={32} className="text-red-600" />
              : <AlertTriangle size={32} className="text-amber-600" />}
          </div>
          <h2 className="page-title mb-1">{t('decision_recorded')}</h2>
          <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>{bidder.name}</p>
          <span className={`inline-block px-3 py-1 text-sm font-bold mb-4 ${selectedDecision?.badgeColor}`} style={{ borderRadius: '2px' }}>
            {selectedDecision?.label}
          </span>
          {remarks && (
            <div className="p-3 text-sm text-left mb-4" style={{ background: 'var(--bg-page)', borderRadius: '2px' }}>
              <p className="text-[10px] uppercase font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
                {t('officer_remarks')}
              </p>
              <p style={{ color: 'var(--text-secondary)' }}>{remarks}</p>
            </div>
          )}
          <div className="flex items-center justify-center gap-2 text-xs mb-6" style={{ color: 'var(--text-muted)' }}>
            <Shield size={12} className="text-blue-500" />
            Decision logged to audit trail · {new Date().toLocaleString('en-IN')}
          </div>
          <div className="flex gap-3 justify-center flex-wrap">
            <button className="btn-secondary" onClick={() => navigate(`/bidders/${bidderId}/compliance`)}>
              View Compliance
            </button>
            {decision === 'QUALIFY' && !contractAwarded && (
              <button
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 transition-colors"
                style={{ borderRadius: '2px' }}
                onClick={() => setShowContractForm(true)}
              >
                <Package size={14} /> Proceed to Award Contract
              </button>
            )}
            {contractAwarded && (
              <button className="btn-primary" onClick={() => navigate('/contracts')}>
                View Contract <ArrowRight size={14} />
              </button>
            )}
            <button className="btn-primary" onClick={() => navigate('/reports')}>
              Generate Report <ArrowRight size={14} />
            </button>
          </div>
        </div>

        {/* Contract Award Form — shown after QUALIFY */}
        {decision === 'QUALIFY' && showContractForm && !contractAwarded && (
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Package size={16} className="text-green-600" />
              <h2 className="text-sm font-semibold text-slate-700">Award Contract — {bidder.name}</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                  Contract Value (₹) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                  <input
                    type="number"
                    value={contractData.contract_value}
                    onChange={(e) => setContractData((p) => ({ ...p, contract_value: e.target.value }))}
                    className="w-full pl-7 pr-3 py-2 text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500"
                    style={{ borderRadius: '2px' }}
                    placeholder="Contract amount"
                  />
                </div>
                {contractData.contract_value && (
                  <p className="text-[10px] text-green-700 mt-0.5">{formatPrice(parseFloat(contractData.contract_value))}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                  Delivery Deadline <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={contractData.delivery_deadline}
                  onChange={(e) => setContractData((p) => ({ ...p, delivery_deadline: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500"
                  style={{ borderRadius: '2px' }}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Payment Terms</label>
                <select
                  value={contractData.payment_terms}
                  onChange={(e) => setContractData((p) => ({ ...p, payment_terms: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500"
                  style={{ borderRadius: '2px' }}
                >
                  {['30 days post acceptance', '60 days post acceptance', '30% advance, 70% on acceptance', '50% advance, 50% on delivery', '100% on delivery and acceptance'].map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                  Advance Payment (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={contractData.advance_payment_pct}
                  onChange={(e) => setContractData((p) => ({ ...p, advance_payment_pct: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500"
                  style={{ borderRadius: '2px' }}
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Delivery Address</label>
                <input
                  type="text"
                  value={contractData.delivery_address}
                  onChange={(e) => setContractData((p) => ({ ...p, delivery_address: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500"
                  style={{ borderRadius: '2px' }}
                />
              </div>
            </div>

            <div className="mt-4 p-3 bg-blue-50 border border-blue-100 text-xs text-blue-800" style={{ borderRadius: '2px' }}>
              <strong>5 milestones</strong> will be auto-created: Contract Signing → Advance Payment → Equipment Delivery → Installation → Final Acceptance.
            </div>

            <div className="flex gap-3 mt-4">
              <button className="btn-secondary" onClick={() => setShowContractForm(false)}>Cancel</button>
              <button
                className="btn-primary flex-1 justify-center"
                style={{ background: '#15803d' }}
                onClick={handleAwardContract}
                disabled={awardingContract}
              >
                {awardingContract
                  ? <><RefreshCw size={14} className="animate-spin" /> Awarding…</>
                  : <><Package size={14} /> Award Contract to {bidder.name}</>}
              </button>
            </div>
          </div>
        )}

        {contractAwarded && (
          <div className="p-4 bg-green-50 border border-green-200 flex items-center gap-3" style={{ borderRadius: '2px' }}>
            <CheckCircle size={18} className="text-green-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-green-800">Contract Awarded Successfully</p>
              <p className="text-xs text-green-700 mt-0.5">
                Contract created with {bidder.name} for {formatPrice(parseFloat(contractData.contract_value))}.
                Logged to audit trail.
              </p>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Main Decision Form ────────────────────────────────────
  return (
    <div className="p-6 space-y-5 max-w-3xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
        <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate('/tenders')}>Tenders</span>
        <ChevronRight size={12} />
        <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate(`/tenders/${tenderId}`)}>{tenderId}</span>
        <ChevronRight size={12} />
        <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate(`/bidders/${bidderId}/compliance`)}>{bidder.name}</span>
        <ChevronRight size={12} />
        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>Final Decision</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-blue-100" style={{ borderRadius: '2px' }}>
          <UserCheck size={20} className="text-blue-700" />
        </div>
        <div>
          <h1 className="page-title">{t('officer_decision')}</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Final Review — {bidder.name}</p>
        </div>
      </div>

      {/* AI does NOT decide banner */}
      <div className="border-2 border-blue-600 bg-blue-600 p-4" style={{ borderRadius: '2px' }}>
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-white/20 flex items-center justify-center flex-shrink-0 mt-0.5" style={{ borderRadius: '2px' }}>
            <Shield size={16} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-white uppercase tracking-wide">{t('ai_no_decide')}</p>
            <p className="text-xs text-blue-100 mt-1 leading-relaxed">{t('ai_no_decide_desc')}</p>
          </div>
        </div>
      </div>

      {/* HIGH RISK / Tampering block */}
      {qualifyBlocked && (
        <div className="border-2 border-red-500 bg-red-50 p-4" style={{ borderRadius: '2px' }}>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-red-100 flex items-center justify-center flex-shrink-0" style={{ borderRadius: '2px' }}>
              <Lock size={18} className="text-red-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-red-800 uppercase tracking-wide">
                {isHighRisk ? t('qualify_locked_high_risk') : t('qualify_locked_tampering')}
              </p>
              <p className="text-xs text-red-700 mt-1.5 leading-relaxed">
                {isHighRisk
                  ? t('qualify_locked_high_risk_desc', { score })
                  : t('qualify_locked_tampering_desc', { count: tampering?.flagged_documents || 0 })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tampering signals */}
      {tampering && (tampering.suspicious_count > 0 || tampering.tampered_count > 0) && (
        <div className="card p-5 border-l-4 border-l-red-500">
          <div className="flex items-center gap-2 mb-3">
            <Fingerprint size={15} className="text-red-600" />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t('tampering_signals')}</h2>
            <span className={`ml-auto text-[10px] px-2 py-0.5 font-bold ${
              tampering.overall_tampering_risk === 'HIGH' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
            }`} style={{ borderRadius: '2px' }}>
              {tampering.overall_tampering_risk} RISK
            </span>
          </div>
          {(tampering.flagged_docs || []).map((doc) => (
            <div key={doc.id} className="p-3 bg-red-50 border border-red-100 mb-2" style={{ borderRadius: '2px' }}>
              <p className="text-xs font-semibold text-red-800 mb-1">{doc.filename}</p>
              {(doc.signals || []).slice(0, 2).map((sig, i) => (
                <div key={i} className="flex items-start gap-1.5 mt-1">
                  <AlertTriangle size={10} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-red-700">{sig.detail}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Bidder Summary */}
      <div className="card p-5">
        <div className="flex items-start gap-4">
          <ScoreRing score={score} size={80} strokeWidth={6} />
          <div className="flex-1">
            <h2 className="font-bold" style={{ color: 'var(--text-primary)' }}>{bidder.name}</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{bidderId} · GSTIN: {bidder.gstin}</p>
            <div className="flex items-center gap-2 mt-2">
              <RiskBadge risk={risk} />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3 mt-4 pt-4 border-t" style={{ borderColor: 'var(--border-card)' }}>
          {[
            { label: t('verified'),      count: counts.VERIFIED || 0,      color: 'text-green-600', bg: 'bg-green-50',  icon: CheckCircle },
            { label: t('needs_review'),  count: counts.REVIEW || 0,        color: 'text-amber-600', bg: 'bg-amber-50',  icon: AlertTriangle },
            { label: t('non_compliant'), count: counts.NON_COMPLIANT || 0, color: 'text-red-600',   bg: 'bg-red-50',    icon: XCircle },
            { label: t('missing'),       count: counts.MISSING || 0,       color: 'text-gray-500',  bg: 'bg-gray-100',  icon: MinusCircle },
          ].map(({ label, count, color, bg, icon: Icon }) => (
            <div key={label} className={`${bg} p-3 text-center`} style={{ borderRadius: '2px' }}>
              <Icon size={14} className={`mx-auto mb-1 ${color}`} />
              <p className={`text-lg font-bold ${color}`}>{count}</p>
              <p className="text-[9px] text-gray-500">{label}</p>
            </div>
          ))}
        </div>
        {reviewItems > 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 p-2.5" style={{ borderRadius: '2px' }}>
            <AlertCircle size={13} className="flex-shrink-0" />
            {reviewItems} item{reviewItems > 1 ? 's' : ''} require attention.
            <button className="ml-auto text-blue-600 font-semibold hover:underline"
              onClick={() => navigate(`/bidders/${bidderId}/compliance`)}>Review →</button>
          </div>
        )}
      </div>

      {/* AI Recommendation */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Info size={15} className="text-blue-600" />
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t('ai_recommendation')}</h2>
          <span className="ml-auto text-[10px] bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 font-semibold" style={{ borderRadius: '2px' }}>
            {t('advisory_only').toUpperCase()}
          </span>
        </div>
        {reviewItems === 0 && !qualifyBlocked ? (
          <div className="bg-green-50 border border-green-200 p-3" style={{ borderRadius: '2px' }}>
            <p className="text-sm text-green-800 font-medium flex items-center gap-2">
              <CheckCircle size={14} className="text-green-600" />
              All mandatory requirements verified. Bid appears eligible to proceed.
            </p>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 p-3" style={{ borderRadius: '2px' }}>
            <p className="text-sm text-amber-800 font-medium flex items-center gap-2">
              <AlertTriangle size={14} className="text-amber-600" />
              {qualifyBlocked
                ? 'HIGH RISK or tampering detected. QUALIFY locked.'
                : `${reviewItems} unresolved item${reviewItems > 1 ? 's' : ''} — review before qualifying.`}
            </p>
          </div>
        )}
        <p className="text-[10px] mt-2 italic" style={{ color: 'var(--text-muted)' }}>
          PARAKH AI advisory only — does not constitute an official qualification or disqualification decision.
        </p>
      </div>

      {/* Decision Options */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>{t('officer_decision')}</h2>
        <div className="space-y-3">
          {DECISIONS.map((opt) => {
            const Icon = opt.icon
            const isSelected = decision === opt.value
            const isBlocked  = opt.blocked
            return (
              <div
                key={opt.value}
                className={`border-2 p-4 transition-all ${
                  isBlocked
                    ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
                    : isSelected
                    ? `${opt.color} cursor-pointer`
                    : 'border-gray-200 hover:border-gray-300 cursor-pointer'
                }`}
                style={{ borderRadius: '2px', background: isSelected && !isBlocked ? undefined : isBlocked ? 'var(--bg-page)' : 'var(--bg-card)' }}
                onClick={() => !isBlocked && setDecision(opt.value)}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${
                    isBlocked ? 'border-gray-300 bg-gray-200' : isSelected ? 'border-current bg-current' : 'border-gray-300'
                  }`}>
                    {isBlocked ? <Lock size={10} className="text-gray-400" />
                      : isSelected ? <div className="w-2 h-2 rounded-full bg-white" /> : null}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {isBlocked ? <Lock size={14} className="text-gray-400" />
                        : <Icon size={15} className={isSelected ? opt.textColor : 'text-gray-400'} />}
                      <span className={`text-sm font-semibold ${isBlocked ? 'text-gray-400' : isSelected ? opt.textColor : ''}`}
                        style={{ color: isBlocked || isSelected ? undefined : 'var(--text-primary)' }}>
                        {opt.label}
                        {isBlocked && <span className="ml-2 text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5" style={{ borderRadius: '2px' }}>LOCKED</span>}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                      {isBlocked ? opt.blockedReason : opt.desc}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-4">
          <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            {t('officer_remarks')} <span className="font-normal" style={{ color: 'var(--text-muted)' }}>(optional but recommended)</span>
          </label>
          <textarea
            rows={3}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Provide reasoning for your decision. This will be included in the audit trail and compliance report."
            className="w-full px-3 py-2.5 text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            style={{ borderColor: 'var(--border-color)', background: 'var(--bg-page)', color: 'var(--text-primary)', borderRadius: '2px' }}
          />
        </div>

        <div className="mt-4 pt-4 flex items-center justify-between gap-3" style={{ borderTop: '1px solid var(--border-card)' }}>
          <button className="btn-secondary" onClick={() => navigate(`/bidders/${bidderId}/compliance`)}>
            ← {t('back_to_compliance')}
          </button>
          <button
            className={`btn-primary ${!decision ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={handleSubmit}
            disabled={!decision || submitting}
          >
            {submitting
              ? <><RefreshCw size={14} className="animate-spin" /> {t('submitting')}…</>
              : <>{t('submit_decision')} <ArrowRight size={14} /></>}
          </button>
        </div>
      </div>

      {/* Confirm Modal */}
      {showConfirm && selectedDecision && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center px-4">
          <div className="shadow-2xl p-6 w-full max-w-sm" style={{ background: 'var(--bg-card)', borderRadius: '2px' }}>
            <div className={`w-12 h-12 mx-auto mb-4 flex items-center justify-center ${
              decision === 'QUALIFY' ? 'bg-green-100' : decision === 'DISQUALIFY' ? 'bg-red-100' : 'bg-amber-100'
            }`} style={{ borderRadius: '2px' }}>
              <selectedDecision.icon size={24} className={selectedDecision.textColor} />
            </div>
            <h3 className="text-base font-bold text-center mb-1" style={{ color: 'var(--text-primary)' }}>{t('confirm_decision')}</h3>
            <p className="text-sm text-center mb-1" style={{ color: 'var(--text-secondary)' }}>{t('you_are_about_to_submit')}:</p>
            <p className={`text-sm font-bold text-center mb-4 ${selectedDecision.textColor}`}>
              {selectedDecision.label} — {bidder.name}
            </p>
            <div className="bg-amber-50 border border-amber-200 p-3 mb-4" style={{ borderRadius: '2px' }}>
              <p className="text-xs text-amber-800 text-center leading-relaxed">{t('decision_permanently_recorded')}</p>
            </div>
            <div className="flex gap-3">
              <button className="btn-secondary flex-1 justify-center" onClick={() => setShowConfirm(false)}>{t('cancel')}</button>
              <button
                className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-white text-sm font-semibold transition-colors ${
                  decision === 'QUALIFY' ? 'bg-green-600 hover:bg-green-700'
                  : decision === 'DISQUALIFY' ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-amber-600 hover:bg-amber-700'
                }`}
                style={{ borderRadius: '2px' }}
                onClick={handleConfirm}
              >
                {t('confirm_and_submit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
