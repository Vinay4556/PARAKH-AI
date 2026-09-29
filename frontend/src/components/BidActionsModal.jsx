import React, { useState } from 'react'
import {
  X, RefreshCw, ShieldCheck, IndianRupee, TrendingUp, Award,
  Factory, Wrench, ArrowRightCircle, AlertTriangle, CheckCircle, Edit3
} from 'lucide-react'
import {
  verifyEMD, runPriceAnalysis, verifyPreference, verifyLocalContent,
  verifyOEM, advanceBidStage, submitAIOverride,
} from '../services/api.js'
import { useToast } from './Toast.jsx'

const EMD_STATUSES = ['VERIFIED', 'PENDING', 'INVALID', 'EXPIRED', 'MISMATCH', 'EXEMPT', 'NOT_SUBMITTED']
const TABS = [
  { key: 'emd', label: 'EMD', icon: IndianRupee },
  { key: 'price', label: 'Price Analysis', icon: TrendingUp },
  { key: 'preference', label: 'MSE / Startup', icon: Award },
  { key: 'local_content', label: 'Local Content', icon: Factory },
  { key: 'oem', label: 'OEM', icon: Wrench },
  { key: 'stage', label: 'Advance Stage', icon: ArrowRightCircle },
  { key: 'override', label: 'AI Override', icon: Edit3 },
]

function formatPrice(p) {
  if (!p) return '—'
  if (p >= 10_000_000) return `₹${(p / 10_000_000).toFixed(2)} Cr`
  if (p >= 100_000) return `₹${(p / 100_000).toFixed(2)} L`
  return `₹${p.toLocaleString('en-IN')}`
}

/**
 * BidActionsModal — surfaces the officer-side bid verification actions that
 * exist on the backend (EMD verify, price reasonableness, MSE/Startup
 * preference, Make-in-India local content, OEM authorization, bid stage
 * advancement, and AI override) for a single bid.
 */
export default function BidActionsModal({ bid, onClose, onUpdated }) {
  const { addToast } = useToast()
  const [tab, setTab] = useState('emd')
  const [saving, setSaving] = useState(false)

  // EMD
  const [emdStatus, setEmdStatus] = useState(bid.emd_status || 'PENDING')
  const [emdNote, setEmdNote] = useState('')

  // Price analysis
  const [priceResult, setPriceResult] = useState(bid.price_analysis || null)

  // Preference
  const [mseEligible, setMseEligible] = useState(false)
  const [startupEligible, setStartupEligible] = useState(false)
  const [preferenceApplicable, setPreferenceApplicable] = useState(false)

  // Local content
  const [localPct, setLocalPct] = useState('')
  const [localClass, setLocalClass] = useState('CLASS_I')

  // OEM
  const [oemName, setOemName] = useState('')
  const [oemStatus, setOemStatus] = useState('NEEDS_REVIEW')

  // AI override
  const [overrideReason, setOverrideReason] = useState('')
  const [overrideResult, setOverrideResult] = useState('')

  const run = async (fn, successMsg) => {
    setSaving(true)
    try {
      const res = await fn()
      addToast(successMsg, 'success')
      onUpdated && onUpdated()
      return res
    } catch (err) {
      addToast(err.message || 'Action failed', 'error')
      return null
    } finally {
      setSaving(false)
    }
  }

  const handleEmdVerify = () => run(
    () => verifyEMD(bid.bid_id || bid.id, { status: emdStatus, officer_notes: emdNote, verified_by: 'Procurement Officer' }),
    'EMD status recorded'
  )

  const handlePriceAnalysis = async () => {
    const res = await run(() => runPriceAnalysis(bid.bid_id || bid.id), 'Price analysis complete')
    if (res) setPriceResult(res.data.analysis ? { ...res.data.analysis, flags: res.data.flags, overall_concern: res.data.overall_concern } : res.data)
  }

  const handlePreference = () => run(
    () => verifyPreference(bid.bid_id || bid.id, {
      mse_eligible: mseEligible, startup_eligible: startupEligible,
      preference_applicable: preferenceApplicable, verified_by: 'Procurement Officer',
    }),
    'Preference eligibility recorded'
  )

  const handleLocalContent = () => run(
    () => verifyLocalContent(bid.bid_id || bid.id, {
      declared_local_content_pct: Number(localPct) || 0,
      verified_local_content_pct: Number(localPct) || 0,
      class: localClass, status: 'LOCAL_CONTENT_VERIFIED', verified_by: 'Procurement Officer',
    }),
    'Local content verification recorded'
  )

  const handleOEM = () => run(
    () => verifyOEM(bid.bid_id || bid.id, { oem_name: oemName, status: oemStatus, verified_by: 'Procurement Officer' }),
    'OEM authorization verification recorded'
  )

  const handleAdvanceStage = () => run(
    () => advanceBidStage(bid.bid_id || bid.id, { officer: 'Procurement Officer' }),
    'Bid advanced to next stage'
  )

  const handleOverride = () => {
    if (!overrideReason.trim()) { addToast('Override reason is mandatory', 'warning'); return }
    if (!overrideResult.trim()) { addToast('Enter the officer-determined result', 'warning'); return }
    return run(
      () => submitAIOverride('bid', bid.bid_id || bid.id, {
        ai_result: bid.officer_decision || bid.risk_level || 'AI_RECOMMENDATION',
        officer_result: overrideResult,
        reason: overrideReason,
        officer: 'Procurement Officer',
        tender_id: bid.tender_id,
        bidder_id: bid.id,
      }),
      'AI recommendation overridden and audit-logged'
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
      <div className="bg-white w-full max-w-2xl shadow-2xl max-h-[85vh] flex flex-col" style={{ borderRadius: '2px' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-base font-bold text-slate-800">Bid Actions — {bid.name}</h3>
            <p className="text-[11px] text-gray-400 font-mono">{bid.bid_id || bid.id}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center gap-1 px-3 pt-3 border-b border-gray-100 overflow-x-auto">
          {TABS.map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1 px-3 py-2 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${
                  tab === t.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon size={13} /> {t.label}
              </button>
            )
          })}
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {tab === 'emd' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                Required: <strong>{formatPrice(bid.emd_amount)}</strong> · Reference: <span className="font-mono">{bid.emd_reference || '—'}</span> · Bank: {bid.emd_bank || '—'}
              </p>
              <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Status</label>
              <select value={emdStatus} onChange={(e) => setEmdStatus(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none" style={{ borderRadius: '2px' }}>
                {EMD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Officer Notes</label>
              <textarea rows={2} value={emdNote} onChange={(e) => setEmdNote(e.target.value)}
                placeholder="Optional notes…"
                className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none resize-none" style={{ borderRadius: '2px' }} />
              <button className="btn-primary text-xs" onClick={handleEmdVerify} disabled={saving}>
                {saving ? <RefreshCw size={13} className="animate-spin" /> : <ShieldCheck size={13} />} Record EMD Status
              </button>
            </div>
          )}

          {tab === 'price' && (
            <div className="space-y-3">
              <button className="btn-primary text-xs" onClick={handlePriceAnalysis} disabled={saving}>
                {saving ? <RefreshCw size={13} className="animate-spin" /> : <TrendingUp size={13} />} Run Price Reasonableness Analysis
              </button>
              {priceResult && (
                <div className="space-y-2">
                  {priceResult.vs_estimated && (
                    <div className="p-3 bg-gray-50 border border-gray-200 text-xs" style={{ borderRadius: '2px' }}>
                      <p className="font-semibold text-slate-700 mb-1">vs Estimated Value</p>
                      <p className="text-gray-600">{priceResult.vs_estimated.note} — flag: <strong>{priceResult.vs_estimated.flag}</strong></p>
                    </div>
                  )}
                  {priceResult.vs_peers && (
                    <div className="p-3 bg-gray-50 border border-gray-200 text-xs" style={{ borderRadius: '2px' }}>
                      <p className="font-semibold text-slate-700 mb-1">vs Peer Bids</p>
                      <p className="text-gray-600">
                        Rank {priceResult.vs_peers.this_rank} of {priceResult.vs_peers.total_bids} · L1: {formatPrice(priceResult.vs_peers.l1_price)} ·
                        {' '}{priceResult.vs_peers.vs_l1_pct}% vs L1
                      </p>
                    </div>
                  )}
                  {priceResult.flags && priceResult.flags.length > 0 && (
                    <div className="space-y-1">
                      {priceResult.flags.map((f, i) => (
                        <div key={i} className="flex items-start gap-2 p-2 bg-amber-50 border border-amber-100 text-xs text-amber-800" style={{ borderRadius: '2px' }}>
                          <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" /> {f.detail}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === 'preference' && (
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={mseEligible} onChange={(e) => setMseEligible(e.target.checked)} className="accent-blue-600" />
                <span className="text-sm">MSE / Udyam eligible</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={startupEligible} onChange={(e) => setStartupEligible(e.target.checked)} className="accent-blue-600" />
                <span className="text-sm">Startup India recognized</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={preferenceApplicable} onChange={(e) => setPreferenceApplicable(e.target.checked)} className="accent-blue-600" />
                <span className="text-sm">Preference applicable to this bid</span>
              </label>
              <button className="btn-primary text-xs" onClick={handlePreference} disabled={saving}>
                {saving ? <RefreshCw size={13} className="animate-spin" /> : <Award size={13} />} Record Preference Determination
              </button>
            </div>
          )}

          {tab === 'local_content' && (
            <div className="space-y-3">
              <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Verified Local Content %</label>
              <input type="number" min="0" max="100" value={localPct} onChange={(e) => setLocalPct(e.target.value)}
                placeholder="e.g. 55" className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none" style={{ borderRadius: '2px' }} />
              <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Class</label>
              <select value={localClass} onChange={(e) => setLocalClass(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none" style={{ borderRadius: '2px' }}>
                <option value="CLASS_I">Class I (≥50% local content)</option>
                <option value="CLASS_II">Class II (20-50% local content)</option>
              </select>
              <button className="btn-primary text-xs" onClick={handleLocalContent} disabled={saving}>
                {saving ? <RefreshCw size={13} className="animate-spin" /> : <Factory size={13} />} Record Local Content Verification
              </button>
            </div>
          )}

          {tab === 'oem' && (
            <div className="space-y-3">
              <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">OEM Name</label>
              <input type="text" value={oemName} onChange={(e) => setOemName(e.target.value)}
                placeholder="e.g. Siemens Ltd" className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none" style={{ borderRadius: '2px' }} />
              <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Status</label>
              <select value={oemStatus} onChange={(e) => setOemStatus(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none" style={{ borderRadius: '2px' }}>
                {['VERIFIED', 'EXPIRED', 'NAME_MISMATCH', 'MODEL_MISMATCH', 'GENERIC', 'SUSPICIOUS', 'NOT_SUBMITTED', 'NEEDS_REVIEW'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <button className="btn-primary text-xs" onClick={handleOEM} disabled={saving}>
                {saving ? <RefreshCw size={13} className="animate-spin" /> : <Wrench size={13} />} Record OEM Verification
              </button>
            </div>
          )}

          {tab === 'stage' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                Current stage: <strong>{bid.status || 'SUBMITTED'}</strong>. Advancing moves the bid to the next stage in the lifecycle
                (SUBMITTED → COMPLIANCE_REVIEW → TECHNICAL_EVALUATION → FINANCIAL_EVALUATION → AWARDED).
              </p>
              <button className="btn-primary text-xs" onClick={handleAdvanceStage} disabled={saving}>
                {saving ? <RefreshCw size={13} className="animate-spin" /> : <ArrowRightCircle size={13} />} Advance to Next Stage
              </button>
            </div>
          )}

          {tab === 'override' && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 text-xs text-amber-800" style={{ borderRadius: '2px' }}>
                <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                Overriding an AI recommendation requires a mandatory reason and is permanently written to the audit trail.
              </div>
              <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Officer-Determined Result</label>
              <input type="text" value={overrideResult} onChange={(e) => setOverrideResult(e.target.value)}
                placeholder="e.g. QUALIFY" className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none" style={{ borderRadius: '2px' }} />
              <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Reason (mandatory)</label>
              <textarea rows={3} value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Explain why the AI recommendation is being overridden…"
                className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none resize-none" style={{ borderRadius: '2px' }} />
              <button
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700"
                style={{ borderRadius: '2px' }}
                onClick={handleOverride} disabled={saving}
              >
                {saving ? <RefreshCw size={13} className="animate-spin" /> : <Edit3 size={13} />} Submit Override
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
