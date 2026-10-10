import React, { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  CheckCircle, AlertTriangle, XCircle, ChevronRight,
  Shield, ArrowRight, RefreshCw, FileText, IndianRupee,
  Clock, Truck, CreditCard, Save, Lock, Edit2
} from 'lucide-react'
import api, { getBidderBids, modifyBid } from '../../services/api.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../components/Toast.jsx'

const PRE_SUBMISSION_CHECKS = [
  { id: 1, label: 'Tender reviewed', status: 'PASS' },
  { id: 2, label: 'Eligibility verified by AI', status: 'PASS' },
  { id: 3, label: 'Mandatory documents uploaded', status: 'WARN', note: '2 missing: Bank Solvency, BIS/CE Certificate' },
  { id: 4, label: 'OEM Authorization reviewed', status: 'WARN', note: 'Entity name mismatch flagged — manual review needed' },
  { id: 5, label: 'Financial statement uploaded', status: 'PASS' },
  { id: 6, label: 'Declarations submitted', status: 'PASS' },
  { id: 7, label: 'EMD submitted', status: 'PASS' },
]

const PAYMENT_TERMS = [
  '30 days post acceptance',
  '60 days post acceptance',
  '50% advance, 50% on delivery',
  '30% advance, 70% on acceptance',
  '100% on delivery and acceptance',
]

const TABS = ['financial', 'checklist']
const DEFAULT_TENDER_ID = 'GEM-DEMO-2026-001'

export default function BidSubmit() {
  const navigate = useNavigate()
  const { bidId } = useParams()
  const [searchParams] = useSearchParams()
  const isEditMode = !!bidId
  // Which tender this bid is for: ?tender=<id> from the tender list, or (edit mode)
  // the tender of the bid being modified. Falls back to the demo tender.
  const [tenderId, setTenderId] = useState(searchParams.get('tender') || DEFAULT_TENDER_ID)
  const { user } = useAuth()
  const { addToast } = useToast()

  const [activeTab, setActiveTab] = useState('financial')
  const [confirmed, setConfirmed] = useState(isEditMode) // declaration already made on original submission
  const [submitting, setSubmitting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loadingExisting, setLoadingExisting] = useState(isEditMode)

  const bidderId = user?.organization_id || 'BID-SUB-001'
  const bidderName = user?.organization_name || 'ABC Technologies Pvt Ltd'

  // ── Financial bid state ───────────────────────────────────
  const [financial, setFinancial] = useState({
    quoted_price: '',
    price_breakdown: {
      base_price: '',
      gst_rate: '18',
      gst_amount: '',
      installation_charges: '',
      amc_charges_annual: '',
      total_with_gst: '',
    },
    delivery_period_days: '90',
    payment_terms: '30 days post acceptance',
    validity_period_days: '120',
    emd_reference: '',
    emd_bank: '',
    emd_amount: '2400000',
    remarks: '',
  })

  useEffect(() => {
    if (!isEditMode) return
    getBidderBids()
      .then((res) => {
        const existing = (res.data || []).find((b) => b.id === bidId)
        if (!existing) {
          addToast('Could not find this bid to modify', 'error')
          return
        }
        if (existing.tender_id) setTenderId(existing.tender_id)
        setFinancial((prev) => ({
          ...prev,
          quoted_price: existing.quoted_price ? String(existing.quoted_price) : prev.quoted_price,
          price_breakdown: existing.price_breakdown || prev.price_breakdown,
          delivery_period_days: existing.delivery_period_days ? String(existing.delivery_period_days) : prev.delivery_period_days,
          payment_terms: existing.payment_terms || prev.payment_terms,
          validity_period_days: existing.validity_period_days ? String(existing.validity_period_days) : prev.validity_period_days,
          emd_reference: existing.emd_reference || prev.emd_reference,
          emd_bank: existing.emd_bank || prev.emd_bank,
          emd_amount: existing.emd_amount ? String(existing.emd_amount) : prev.emd_amount,
          remarks: existing.financial_remarks || prev.remarks,
        }))
      })
      .catch(() => addToast('Failed to load existing bid', 'error'))
      .finally(() => setLoadingExisting(false))
  }, [isEditMode, bidId])

  const updateField = (key, value) => setFinancial((prev) => ({ ...prev, [key]: value }))
  const updateBreakdown = (key, value) => {
    setFinancial((prev) => {
      const bd = { ...prev.price_breakdown, [key]: value }
      // Auto-compute GST amount and total when base_price or gst_rate changes
      if (key === 'base_price' || key === 'gst_rate') {
        const base = parseFloat(key === 'base_price' ? value : bd.base_price) || 0
        const rate = parseFloat(key === 'gst_rate' ? value : bd.gst_rate) || 0
        const gst = Math.round(base * rate / 100)
        const install = parseFloat(bd.installation_charges) || 0
        bd.gst_amount = gst.toString()
        bd.total_with_gst = (base + gst + install).toString()
      }
      if (key === 'installation_charges') {
        const base = parseFloat(bd.base_price) || 0
        const gst = parseFloat(bd.gst_amount) || 0
        const install = parseFloat(value) || 0
        bd.total_with_gst = (base + gst + install).toString()
      }
      return { ...prev, price_breakdown: bd, quoted_price: bd.total_with_gst || prev.quoted_price }
    })
  }

  const passCount = PRE_SUBMISSION_CHECKS.filter((c) => c.status === 'PASS').length
  const warnCount = PRE_SUBMISSION_CHECKS.filter((c) => c.status === 'WARN').length
  const failCount = PRE_SUBMISSION_CHECKS.filter((c) => c.status === 'FAIL').length
  const canSubmit = failCount === 0 && !!financial.quoted_price

  const formatCurrency = (val) => {
    const n = parseFloat(val)
    if (!n) return '—'
    if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`
    if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`
    return `₹${n.toLocaleString('en-IN')}`
  }

  const buildPayload = (status = 'SUBMITTED') => ({
    bidder_id: bidderId,
    tender_id: tenderId,
    bidder_name: bidderName,
    documents_count: 10,
    status,
    quoted_price: parseFloat(financial.quoted_price) || 0,
    price_breakdown: financial.price_breakdown,
    delivery_period_days: parseInt(financial.delivery_period_days) || 90,
    payment_terms: financial.payment_terms,
    validity_period_days: parseInt(financial.validity_period_days) || 120,
    emd_reference: financial.emd_reference,
    emd_bank: financial.emd_bank,
    emd_amount: parseFloat(financial.emd_amount) || 0,
    financial_remarks: financial.remarks,
  })

  const handleSaveDraft = async () => {
    setSaving(true)
    try {
      await api.post('/bidder/submit-bid', buildPayload('DRAFT'))
      addToast('Draft saved successfully', 'success')
    } catch (err) {
      addToast(err.message || 'Draft save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = async () => {
    setShowConfirm(false)
    setSubmitting(true)
    try {
      if (isEditMode) {
        const res = await modifyBid(bidId, buildPayload('SUBMITTED'))
        setSubmitted({ bid_id: bidId, bid: res.data.bid, modified: true, version: res.data.version })
        addToast(`Bid modified successfully (version ${res.data.version})`, 'success')
      } else {
        const res = await api.post('/bidder/submit-bid', buildPayload('SUBMITTED'))
        if (res.data?.status === 'already_submitted') {
          // Defensive: never present an already-existing bid as a fresh submission
          addToast(`You have already submitted bid ${res.data.bid_id}. Use "Modify Bid" to change it.`, 'error')
          return
        }
        setSubmitted(res.data)
        addToast('Bid submitted successfully!', 'success')
      }
    } catch (err) {
      addToast(err.message || (isEditMode ? 'Modification failed' : 'Submission failed'), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (loadingExisting) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-gray-500">
        <RefreshCw size={14} className="animate-spin" /> Loading existing bid…
      </div>
    )
  }

  // ── Success screen ─────────────────────────────────────────
  if (submitted) {
    return (
      <div className="p-6 max-w-xl">
        <div className="card p-8 text-center">
          <div className="w-16 h-16 bg-green-100 flex items-center justify-center mx-auto mb-4" style={{ borderRadius: '2px' }}>
            <CheckCircle size={32} className="text-green-600" />
          </div>
          <h2 className="page-title mb-1">{submitted.modified ? 'Bid Modified Successfully' : 'Bid Submitted Successfully'}</h2>
          <p className="text-sm text-gray-500 mb-4">
            {submitted.modified
              ? `Your bid has been updated for ${tenderId}. Previous version archived as version ${(submitted.version || 2) - 1}.`
              : `Your bid has been recorded for ${tenderId}`}
          </p>
          <div className="bg-blue-50 border border-blue-200 p-4 mb-4" style={{ borderRadius: '2px' }}>
            <p className="text-[10px] text-blue-500 font-semibold uppercase mb-1">Bid ID</p>
            <p className="text-2xl font-bold text-blue-700 font-mono">{submitted.bid_id}</p>
            <p className="text-xs text-gray-500 mt-1">
              {submitted.modified ? `Now on version ${submitted.version}` : 'Keep this ID for tracking'}
            </p>
          </div>
          {submitted.bid?.quoted_price > 0 && (
            <div className="bg-gray-50 border border-gray-200 p-3 mb-4 text-left" style={{ borderRadius: '2px' }}>
              <p className="text-[10px] font-semibold uppercase text-gray-400 mb-2">Financial Summary</p>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Quoted Price (incl. GST)</span>
                <span className="font-bold text-green-700">{formatCurrency(submitted.bid.quoted_price)}</span>
              </div>
              {submitted.bid.delivery_period_days && (
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-gray-500">Delivery Period</span>
                  <span className="font-semibold">{submitted.bid.delivery_period_days} days</span>
                </div>
              )}
              {submitted.bid.validity_period_days && (
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-gray-500">Bid Validity</span>
                  <span className="font-semibold">{submitted.bid.validity_period_days} days</span>
                </div>
              )}
            </div>
          )}
          <div className="flex gap-3 justify-center">
            <button className="btn-secondary" onClick={() => navigate('/bidder/bids')}>Track My Bids</button>
            <button className="btn-primary" onClick={() => navigate('/bidder/dashboard')}>
              Dashboard <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate('/bidder/dashboard')}>Dashboard</span>
        <ChevronRight size={12} />
        <span className="text-slate-700 font-medium">Submit Bid</span>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="page-title">{isEditMode ? 'Modify Bid' : 'Bid Submission'}</h1>
        {!isEditMode && (
          <button
            className="btn-secondary text-xs"
            onClick={handleSaveDraft}
            disabled={saving}
          >
            {saving ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
            {saving ? 'Saving…' : 'Save Draft'}
          </button>
        )}
      </div>

      {isEditMode && (
        <div className="p-3 bg-indigo-50 border border-indigo-200 flex items-start gap-2 text-xs text-indigo-800" style={{ borderRadius: '2px' }}>
          <Edit2 size={13} className="flex-shrink-0 mt-0.5" />
          You are modifying bid <strong className="font-mono">{bidId}</strong>. The current version will be archived and this
          becomes the new active version. Modification is only allowed before the submission deadline.
        </div>
      )}

      {/* Tender header */}
      <div className="card p-4 border-l-4 border-l-blue-600">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold text-blue-700 uppercase tracking-wide">{tenderId}</p>
            <p className="text-sm font-semibold text-slate-800 mt-0.5">Supply and Installation of Industrial IoT Monitoring Equipment</p>
            <p className="text-xs text-gray-500 mt-0.5">Submitting as: <span className="font-semibold">{bidderName}</span></p>
          </div>
          <span className="text-[10px] px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 font-semibold" style={{ borderRadius: '2px' }}>
            Deadline: 30 Sep 2026
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {[
          { key: 'financial', label: 'Financial Bid', icon: IndianRupee },
          { key: 'checklist', label: 'Pre-Submission Checklist', icon: CheckCircle },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              activeTab === key
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-slate-700'
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* ── Tab: Financial Bid ─────────────────────────────── */}
      {activeTab === 'financial' && (
        <div className="space-y-4">
          {/* Price Breakdown */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <IndianRupee size={15} className="text-blue-600" /> Price Breakdown (Financial Bid Envelope)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                  Base Price (ex-GST) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                  <input
                    type="number"
                    placeholder="e.g. 10000000"
                    value={financial.price_breakdown.base_price}
                    onChange={(e) => updateBreakdown('base_price', e.target.value)}
                    className="w-full pl-7 pr-3 py-2 text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={{ borderRadius: '2px' }}
                  />
                </div>
                {financial.price_breakdown.base_price && (
                  <p className="text-[10px] text-blue-600 mt-0.5">{formatCurrency(financial.price_breakdown.base_price)}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">GST Rate (%)</label>
                <select
                  value={financial.price_breakdown.gst_rate}
                  onChange={(e) => updateBreakdown('gst_rate', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ borderRadius: '2px' }}
                >
                  {['0', '5', '12', '18', '28'].map((r) => (
                    <option key={r} value={r}>{r}% GST</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">GST Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                  <input
                    type="number"
                    value={financial.price_breakdown.gst_amount}
                    readOnly
                    className="w-full pl-7 pr-3 py-2 text-sm border border-gray-200 bg-gray-50 text-gray-600"
                    style={{ borderRadius: '2px' }}
                    placeholder="Auto-calculated"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Installation / Commissioning (₹)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                  <input
                    type="number"
                    placeholder="0"
                    value={financial.price_breakdown.installation_charges}
                    onChange={(e) => updateBreakdown('installation_charges', e.target.value)}
                    className="w-full pl-7 pr-3 py-2 text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={{ borderRadius: '2px' }}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">AMC Charges (Annual, ₹)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                  <input
                    type="number"
                    placeholder="0"
                    value={financial.price_breakdown.amc_charges_annual}
                    onChange={(e) => updateBreakdown('amc_charges_annual', e.target.value)}
                    className="w-full pl-7 pr-3 py-2 text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={{ borderRadius: '2px' }}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                  Total Quoted Price (incl. GST) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                  <input
                    type="number"
                    value={financial.price_breakdown.total_with_gst || financial.quoted_price}
                    onChange={(e) => updateField('quoted_price', e.target.value)}
                    className="w-full pl-7 pr-3 py-2 text-sm border border-blue-400 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={{ borderRadius: '2px' }}
                    placeholder="Final price bidder is quoting"
                  />
                </div>
                {(financial.price_breakdown.total_with_gst || financial.quoted_price) && (
                  <p className="text-[10px] text-green-700 font-semibold mt-0.5">
                    ✓ {formatCurrency(financial.price_breakdown.total_with_gst || financial.quoted_price)} — this is your L1/L2 comparison price
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Delivery, Validity, Payment */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <Truck size={15} className="text-blue-600" /> Delivery &amp; Commercial Terms
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                  Delivery Period <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={financial.delivery_period_days}
                    onChange={(e) => updateField('delivery_period_days', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={{ borderRadius: '2px' }}
                  />
                  <span className="text-xs text-gray-500 whitespace-nowrap">days</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
                  Bid Validity Period <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="30"
                    max="365"
                    value={financial.validity_period_days}
                    onChange={(e) => updateField('validity_period_days', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={{ borderRadius: '2px' }}
                  />
                  <span className="text-xs text-gray-500 whitespace-nowrap">days</span>
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5">Typically 120 days from submission</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Payment Terms</label>
                <select
                  value={financial.payment_terms}
                  onChange={(e) => updateField('payment_terms', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ borderRadius: '2px' }}
                >
                  {PAYMENT_TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* EMD */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <CreditCard size={15} className="text-blue-600" /> Earnest Money Deposit (EMD)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">EMD Amount (₹)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                  <input
                    type="number"
                    value={financial.emd_amount}
                    onChange={(e) => updateField('emd_amount', e.target.value)}
                    className="w-full pl-7 pr-3 py-2 text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={{ borderRadius: '2px' }}
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5">Required: ₹24,00,000</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">BG / DD Reference No.</label>
                <input
                  type="text"
                  placeholder="e.g. BG/SBI/2026/001234"
                  value={financial.emd_reference}
                  onChange={(e) => updateField('emd_reference', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ borderRadius: '2px' }}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Issuing Bank</label>
                <input
                  type="text"
                  placeholder="e.g. State Bank of India"
                  value={financial.emd_bank}
                  onChange={(e) => updateField('emd_bank', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ borderRadius: '2px' }}
                />
              </div>
            </div>
          </div>

          {/* Remarks */}
          <div className="card p-5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Additional Remarks (Optional)</label>
            <textarea
              rows={2}
              value={financial.remarks}
              onChange={(e) => updateField('remarks', e.target.value)}
              placeholder="Any additional commercial remarks or deviations from standard terms…"
              className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              style={{ borderRadius: '2px' }}
            />
          </div>

          <button className="btn-secondary w-full justify-center" onClick={() => setActiveTab('checklist')}>
            Next: Pre-Submission Checklist <ArrowRight size={14} />
          </button>
        </div>
      )}

      {/* ── Tab: Checklist ─────────────────────────────────── */}
      {activeTab === 'checklist' && (
        <div className="space-y-4">
          {/* Status summary */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Passed', count: passCount, color: 'text-green-600', bg: 'bg-green-50 border-green-200' },
              { label: 'Warnings', count: warnCount, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
              { label: 'Blocking', count: failCount, color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
            ].map(({ label, count, color, bg }) => (
              <div key={label} className={`border p-3 text-center ${bg}`} style={{ borderRadius: '2px' }}>
                <p className={`text-xl font-bold ${color}`}>{count}</p>
                <p className="text-[10px] text-gray-500">{label}</p>
              </div>
            ))}
          </div>

          {/* Financial summary banner */}
          {financial.quoted_price ? (
            <div className="p-3 bg-green-50 border border-green-200 flex items-center gap-3" style={{ borderRadius: '2px' }}>
              <CheckCircle size={16} className="text-green-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-green-800">Financial Bid: {formatCurrency(financial.price_breakdown.total_with_gst || financial.quoted_price)}</p>
                <p className="text-xs text-green-700">Delivery: {financial.delivery_period_days} days · Validity: {financial.validity_period_days} days · {financial.payment_terms}</p>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-red-50 border border-red-300 flex items-center gap-3" style={{ borderRadius: '2px' }}>
              <XCircle size={16} className="text-red-600 flex-shrink-0" />
              <p className="text-sm font-semibold text-red-700">
                Financial bid price not entered.{' '}
                <button className="underline" onClick={() => setActiveTab('financial')}>Go to Financial Bid tab →</button>
              </p>
            </div>
          )}

          {/* Checks */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-slate-700">Submission Checks</h2>
            </div>
            <div className="divide-y divide-gray-50">
              {PRE_SUBMISSION_CHECKS.map((check) => (
                <div key={check.id} className="flex items-start gap-3 px-5 py-3.5">
                  {check.status === 'PASS'
                    ? <CheckCircle size={15} className="text-green-600 flex-shrink-0 mt-0.5" />
                    : check.status === 'WARN'
                    ? <AlertTriangle size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
                    : <XCircle size={15} className="text-red-600 flex-shrink-0 mt-0.5" />
                  }
                  <div>
                    <p className="text-sm font-medium text-slate-700">{check.label}</p>
                    {check.note && <p className="text-xs text-amber-700 mt-0.5">{check.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {warnCount > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 flex items-start gap-2" style={{ borderRadius: '2px' }}>
              <AlertTriangle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 leading-relaxed">
                Your bid has {warnCount} warning{warnCount > 1 ? 's' : ''}. You can still submit, but the officer may request clarification.
              </p>
            </div>
          )}

          {/* Declaration */}
          <div className="card p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-blue-600"
              />
              <p className="text-xs text-gray-600 leading-relaxed">
                I hereby confirm that all information, documents, and financial details submitted are true and correct.
                I understand that any misrepresentation may lead to disqualification and legal action under applicable procurement rules.
              </p>
            </label>
          </div>

          <div className="flex gap-3">
            <button className="btn-secondary" onClick={() => setActiveTab('financial')}>← Financial Bid</button>
            <button className="btn-secondary flex-1 justify-center" onClick={() => navigate('/bidder/readiness')}>
              Review Issues
            </button>
            <button
              className={`btn-primary flex-1 justify-center ${(!confirmed || !canSubmit) ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => setShowConfirm(true)}
              disabled={!confirmed || !canSubmit || submitting}
            >
              {submitting ? <RefreshCw size={14} className="animate-spin" /> : <Lock size={14} />}
              {submitting ? (isEditMode ? 'Saving…' : 'Submitting…') : (isEditMode ? 'Save Modified Bid' : 'Final Submit Bid')}
            </button>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
          <div className="bg-white p-6 w-full max-w-sm shadow-2xl" style={{ borderRadius: '2px' }}>
            <div className="w-12 h-12 bg-blue-100 mx-auto mb-4 flex items-center justify-center" style={{ borderRadius: '2px' }}>
              <Shield size={24} className="text-blue-700" />
            </div>
            <h3 className="text-base font-bold text-slate-800 text-center mb-1">
              {isEditMode ? 'Confirm Bid Modification' : 'Confirm Final Bid Submission'}
            </h3>
            <p className="text-xs text-gray-500 text-center mb-3">
              {isEditMode
                ? <>Save changes to bid <strong className="font-mono">{bidId}</strong> as <strong>{bidderName}</strong>? The previous version will be archived.</>
                : <>Submit bid for <strong>{tenderId}</strong> as <strong>{bidderName}</strong>?</>}
            </p>
            <div className="bg-gray-50 border border-gray-200 p-3 mb-4 text-sm" style={{ borderRadius: '2px' }}>
              <div className="flex justify-between mb-1">
                <span className="text-gray-500">Quoted Price</span>
                <span className="font-bold text-green-700">{formatCurrency(financial.price_breakdown.total_with_gst || financial.quoted_price)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Delivery Period</span>
                <span className="font-semibold">{financial.delivery_period_days} days</span>
              </div>
            </div>
            <p className="text-[10px] text-red-600 text-center mb-4 font-semibold">⚠ This action cannot be undone once submitted.</p>
            <div className="flex gap-3">
              <button className="btn-secondary flex-1 justify-center" onClick={() => setShowConfirm(false)}>Cancel</button>
              <button className="btn-primary flex-1 justify-center" onClick={handleSubmit}>Confirm &amp; Submit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
