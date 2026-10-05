import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronRight, Plus, Trash2, Save, RefreshCw,
  FileText, DollarSign, Calendar, MapPin, AlertCircle,
  Settings, Shield, IndianRupee
} from 'lucide-react'
import { createTender } from '../../services/api.js'
import { useToast } from '../../components/Toast.jsx'
import { useAuth } from '../../context/AuthContext.jsx'

const CATEGORIES = ['Goods', 'Services', 'Works', 'Consultancy', 'IT & Software', 'Equipment', 'AMC/Maintenance', 'Infrastructure', 'Research', 'Other']
const PROCUREMENT_METHODS = [
  { value: 'L1', label: 'L1 (Lowest Price)' },
  { value: 'QCBS', label: 'QCBS (Quality & Cost Based)' },
  { value: 'REVERSE_AUCTION', label: 'Reverse Auction' },
  { value: 'L1_RA', label: 'L1 + Reverse Auction' },
  { value: 'CUSTOM', label: 'Custom Evaluation' },
]
const BID_TYPES = [
  { value: 'SINGLE_ENVELOPE', label: 'Single Envelope' },
  { value: 'TWO_ENVELOPE', label: 'Two Envelope (Tech + Financial)' },
  { value: 'THREE_STAGE', label: 'Three-Stage Evaluation' },
]
const REQ_CATEGORIES = ['Legal', 'Financial', 'Technical', 'Certifications', 'Declarations', 'Other']
const VERIFICATION_TYPES = [
  { value: 'document_presence', label: 'Document Presence' },
  { value: 'numeric_threshold', label: 'Numeric Threshold' },
  { value: 'experience_years', label: 'Experience (Years)' },
  { value: 'certificate_validity', label: 'Certificate Validity' },
  { value: 'project_count', label: 'Project Count' },
]

const BLANK_REQ = {
  title: '', description: '', category: 'Legal', mandatory: true,
  required_evidence: [], verification_type: 'document_presence',
  threshold: '', threshold_display: '',
}

export default function CreateTender() {
  const navigate = useNavigate()
  const { addToast: showToast } = useToast()
  const { user } = useAuth()
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('basic')

  const [form, setForm] = useState({
    title: '', department: user?.department || '', organisation: 'CPCL',
    estimated_value: '', submission_deadline: '', opening_date: '', prebid_date: '',
    category: 'Goods', location: 'Pan India', description: '', status: 'OPEN',
    emd_amount: '', emd_amount_display: '', performance_security_pct: 5,
  })

  const [policy, setPolicy] = useState({
    procurement_method: 'QCBS', bid_type: 'TWO_ENVELOPE', tender_type: 'GOODS',
    technical_weight: 70, financial_weight: 30, min_technical_score: 60,
    reverse_auction_applicable: false, emd_applicable: true,
    mse_preference_applicable: false, startup_preference_applicable: false,
    make_in_india_applicable: true, oem_authorization_mandatory: false,
    consortium_allowed: false, price_preference_pct: 0, local_content_threshold: 50,
  })

  const [requirements, setRequirements] = useState([
    { ...BLANK_REQ, title: 'GST Registration', category: 'Legal', required_evidence: ['GST Certificate'] },
    { ...BLANK_REQ, title: 'PAN Card', category: 'Legal', required_evidence: ['PAN Card'] },
  ])

  const [errors, setErrors] = useState({})

  const updateForm = (key, val) => { setForm((p) => ({ ...p, [key]: val })); if (errors[key]) setErrors((p) => ({ ...p, [key]: null })) }
  const updatePolicy = (key, val) => setPolicy((p) => ({ ...p, [key]: val }))
  const addRequirement = () => setRequirements((p) => [...p, { ...BLANK_REQ }])
  const removeRequirement = (i) => setRequirements((p) => p.filter((_, idx) => idx !== i))
  const updateReq = (i, key, val) => setRequirements((p) => p.map((r, idx) => idx === i ? { ...r, [key]: val } : r))
  const addEvidence = (i) => { const val = prompt('Evidence document name:'); if (val?.trim()) updateReq(i, 'required_evidence', [...(requirements[i].required_evidence || []), val.trim()]) }
  const removeEvidence = (ri, ei) => updateReq(ri, 'required_evidence', requirements[ri].required_evidence.filter((_, j) => j !== ei))

  const validate = () => {
    const errs = {}
    if (!form.title.trim()) errs.title = 'Tender title is required'
    if (!form.department.trim()) errs.department = 'Department is required'
    if (!form.estimated_value || isNaN(Number(form.estimated_value))) errs.estimated_value = 'Valid estimated value required'
    if (!form.submission_deadline) errs.submission_deadline = 'Submission deadline is required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSave = async () => {
    if (!validate()) { showToast('Please fix validation errors', 'error'); setActiveTab('basic'); return }
    setSaving(true)
    try {
      const payload = {
        ...form,
        estimated_value: Number(form.estimated_value),
        estimated_value_display: `₹${Number(form.estimated_value).toLocaleString('en-IN')}`,
        emd_amount: form.emd_amount ? Number(form.emd_amount) : 0,
        created_by: user?.name || 'Procurement Officer',
        requirements,
        ...policy,  // spread policy fields at top level for backend
      }
      const res = await createTender(payload)
      showToast(`Tender ${res.data.id} created successfully`, 'success')
      navigate('/tenders')
    } catch (err) {
      showToast(err.message || 'Failed to create tender', 'error')
    } finally { setSaving(false) }
  }

  const tabs = [
    { key: 'basic', label: 'Basic Details' },
    { key: 'policy', label: 'Evaluation Policy' },
    { key: 'requirements', label: `Requirements (${requirements.length})` },
    { key: 'preview', label: 'Preview' },
  ]

  const inputCls = (err) => `w-full px-3 py-2 text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500 ${err ? 'border-red-400 bg-red-50' : 'border-gray-200'}` + ' ' + ''
  const selectCls = 'w-full px-3 py-2 text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
  const labelCls = 'block text-xs font-semibold text-slate-600 mb-1.5'

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate('/')}>Dashboard</span>
        <ChevronRight size={12} />
        <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate('/tenders')}>Tenders</span>
        <ChevronRight size={12} />
        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>Create New Tender</span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Create Tender</h1>
          <p className="text-sm text-gray-500 mt-0.5">Define tender details, evaluation policy, and compliance requirements</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => navigate('/tenders')}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <><RefreshCw size={14} className="animate-spin" /> Creating…</> : <><Save size={14} /> Create Tender</>}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {tabs.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              activeTab === tab.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>{tab.label}</button>
        ))}
      </div>

      {/* Tab: Basic */}
      {activeTab === 'basic' && (
        <div className="card p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className={labelCls}>Tender Title <span className="text-red-500">*</span></label>
              <input value={form.title} onChange={(e) => updateForm('title', e.target.value)}
                placeholder="e.g., Supply and Installation of Industrial IoT Monitoring Equipment"
                className={inputCls(errors.title)} style={{ borderRadius: '2px' }} />
              {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title}</p>}
            </div>
            <div>
              <label className={labelCls}>Department <span className="text-red-500">*</span></label>
              <input value={form.department} onChange={(e) => updateForm('department', e.target.value)}
                placeholder="e.g., Instrumentation & Process Control"
                className={inputCls(errors.department)} style={{ borderRadius: '2px' }} />
              {errors.department && <p className="text-xs text-red-500 mt-1">{errors.department}</p>}
            </div>
            <div>
              <label className={labelCls}>Organisation</label>
              <input value={form.organisation} onChange={(e) => updateForm('organisation', e.target.value)}
                placeholder="e.g., CPCL" className={inputCls()} style={{ borderRadius: '2px' }} />
            </div>
            <div>
              <label className={labelCls}>Estimated Value (₹) <span className="text-red-500">*</span></label>
              <input type="number" value={form.estimated_value} onChange={(e) => updateForm('estimated_value', e.target.value)}
                placeholder="e.g., 48000000" className={inputCls(errors.estimated_value)} style={{ borderRadius: '2px' }} />
              {form.estimated_value && !isNaN(Number(form.estimated_value)) && (
                <p className="text-xs text-green-600 mt-1">â‰ˆ ₹{Number(form.estimated_value).toLocaleString('en-IN')}</p>
              )}
              {errors.estimated_value && <p className="text-xs text-red-500 mt-1">{errors.estimated_value}</p>}
            </div>
            <div>
              <label className={labelCls}>Category</label>
              <select value={form.category} onChange={(e) => updateForm('category', e.target.value)}
                className={selectCls} style={{ borderRadius: '2px' }}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>EMD Amount (₹)</label>
              <input type="number" value={form.emd_amount} onChange={(e) => updateForm('emd_amount', e.target.value)}
                placeholder="e.g., 2400000" className={inputCls()} style={{ borderRadius: '2px' }} />
              {form.emd_amount && <p className="text-xs text-blue-600 mt-1">EMD: ₹{Number(form.emd_amount).toLocaleString('en-IN')}</p>}
            </div>
            <div>
              <label className={labelCls}>Performance Security (%)</label>
              <input type="number" min="0" max="20" value={form.performance_security_pct}
                onChange={(e) => updateForm('performance_security_pct', e.target.value)}
                className={inputCls()} style={{ borderRadius: '2px' }} />
            </div>
            <div>
              <label className={labelCls}>Submission Deadline <span className="text-red-500">*</span></label>
              <input type="datetime-local" value={form.submission_deadline}
                onChange={(e) => updateForm('submission_deadline', e.target.value)}
                className={inputCls(errors.submission_deadline)} style={{ borderRadius: '2px' }} />
              {errors.submission_deadline && <p className="text-xs text-red-500 mt-1">{errors.submission_deadline}</p>}
            </div>
            <div>
              <label className={labelCls}>Pre-Bid Meeting Date</label>
              <input type="date" value={form.prebid_date} onChange={(e) => updateForm('prebid_date', e.target.value)}
                className={inputCls()} style={{ borderRadius: '2px' }} />
            </div>
            <div>
              <label className={labelCls}>Bid Opening Date</label>
              <input type="datetime-local" value={form.opening_date} onChange={(e) => updateForm('opening_date', e.target.value)}
                className={inputCls()} style={{ borderRadius: '2px' }} />
            </div>
            <div>
              <label className={labelCls}>Location</label>
              <input value={form.location} onChange={(e) => updateForm('location', e.target.value)}
                placeholder="e.g., Pan India" className={inputCls()} style={{ borderRadius: '2px' }} />
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select value={form.status} onChange={(e) => updateForm('status', e.target.value)}
                className={selectCls} style={{ borderRadius: '2px' }}>
                {['DRAFT', 'OPEN', 'CLOSED', 'EVALUATION'].map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Description / Scope of Work</label>
              <textarea rows={3} value={form.description} onChange={(e) => updateForm('description', e.target.value)}
                placeholder="Describe the scope, objectives, and key deliverables…"
                className={inputCls() + ' resize-none'} style={{ borderRadius: '2px' }} />
            </div>
          </div>
        </div>
      )}

      {/* Tab: Evaluation Policy */}
      {activeTab === 'policy' && (
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <Settings size={14} className="text-blue-600" /> Procurement Method &amp; Bid Type
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Procurement Method</label>
                <select value={policy.procurement_method} onChange={(e) => updatePolicy('procurement_method', e.target.value)}
                  className={selectCls} style={{ borderRadius: '2px' }}>
                  {PROCUREMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Bid System</label>
                <select value={policy.bid_type} onChange={(e) => updatePolicy('bid_type', e.target.value)}
                  className={selectCls} style={{ borderRadius: '2px' }}>
                  {BID_TYPES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          {(policy.procurement_method === 'QCBS' || policy.procurement_method === 'CUSTOM') && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <Shield size={14} className="text-blue-600" /> QCBS Evaluation Weights
              </h2>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={labelCls}>Technical Weight (%)</label>
                  <input type="number" min="0" max="100" value={policy.technical_weight}
                    onChange={(e) => { updatePolicy('technical_weight', Number(e.target.value)); updatePolicy('financial_weight', 100 - Number(e.target.value)) }}
                    className={inputCls()} style={{ borderRadius: '2px' }} />
                </div>
                <div>
                  <label className={labelCls}>Financial Weight (%)</label>
                  <input type="number" value={policy.financial_weight} readOnly
                    className="w-full px-3 py-2 text-sm border border-gray-200 bg-gray-50 text-gray-600" style={{ borderRadius: '2px' }} />
                </div>
                <div>
                  <label className={labelCls}>Min. Technical Score</label>
                  <input type="number" min="0" max="100" value={policy.min_technical_score}
                    onChange={(e) => updatePolicy('min_technical_score', Number(e.target.value))}
                    className={inputCls()} style={{ borderRadius: '2px' }} />
                </div>
              </div>
              <div className="mt-3 p-2.5 bg-blue-50 border border-blue-100 text-xs text-blue-800" style={{ borderRadius: '2px' }}>
                QCBS Score = Technical Ã— {policy.technical_weight}% + Price Score Ã— {policy.financial_weight}% | Min technical qualifying score: {policy.min_technical_score}/100
              </div>
            </div>
          )}

          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Eligibility &amp; Preference Configuration</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { key: 'emd_applicable', label: 'EMD Applicable' },
                { key: 'make_in_india_applicable', label: 'Make in India / Local Content Applicable' },
                { key: 'oem_authorization_mandatory', label: 'OEM Authorization Mandatory' },
                { key: 'mse_preference_applicable', label: 'MSE Preference Applicable' },
                { key: 'startup_preference_applicable', label: 'Startup Preference Applicable' },
                { key: 'reverse_auction_applicable', label: 'Reverse Auction Applicable' },
                { key: 'consortium_allowed', label: 'Consortium / JV Allowed' },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={policy[key]} onChange={(e) => updatePolicy(key, e.target.checked)}
                    className="w-4 h-4 accent-blue-600" />
                  <span className="text-sm text-slate-700">{label}</span>
                </label>
              ))}
              {policy.mse_preference_applicable && (
                <div>
                  <label className={labelCls}>Price Preference % (MSE)</label>
                  <input type="number" min="0" max="25" value={policy.price_preference_pct}
                    onChange={(e) => updatePolicy('price_preference_pct', Number(e.target.value))}
                    className={inputCls()} style={{ borderRadius: '2px' }} />
                </div>
              )}
              {policy.make_in_india_applicable && (
                <div>
                  <label className={labelCls}>Min. Local Content Threshold (%)</label>
                  <input type="number" min="0" max="100" value={policy.local_content_threshold}
                    onChange={(e) => updatePolicy('local_content_threshold', Number(e.target.value))}
                    className={inputCls()} style={{ borderRadius: '2px' }} />
                </div>
              )}
            </div>
          </div>

          <div className="p-3 bg-amber-50 border border-amber-200 text-xs text-amber-800" style={{ borderRadius: '2px' }}>
            <strong>Note:</strong> Policy values are configurable per tender. They do not represent universal legal mandates.
            Final preference application requires officer confirmation. Displayed as "Configured Procurement Policy".
          </div>
        </div>
      )}

      {/* Tab: Requirements */}
      {activeTab === 'requirements' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Define compliance requirements evaluated for each bidder.</p>
            <button className="btn-primary text-xs" onClick={addRequirement}><Plus size={13} /> Add Requirement</button>
          </div>
          {requirements.map((req, i) => (
            <div key={i} className="card p-5 border-l-4 border-l-blue-500">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-1" style={{ borderRadius: '2px' }}>REQ-{String(i + 1).padStart(3, '0')}</span>
                <button className="text-red-400 hover:text-red-600 p-1" onClick={() => removeRequirement(i)}><Trash2 size={13} /></button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Title *</label>
                  <input value={req.title} onChange={(e) => updateReq(i, 'title', e.target.value)}
                    placeholder="e.g., Valid GST Registration"
                    className="w-full px-3 py-2 text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500" style={{ borderRadius: '2px' }} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Category</label>
                  <select value={req.category} onChange={(e) => updateReq(i, 'category', e.target.value)}
                    className={selectCls} style={{ borderRadius: '2px' }}>
                    {REQ_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Verification Type</label>
                  <select value={req.verification_type} onChange={(e) => updateReq(i, 'verification_type', e.target.value)}
                    className={selectCls} style={{ borderRadius: '2px' }}>
                    {VERIFICATION_TYPES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
                  </select>
                </div>
                {req.verification_type !== 'document_presence' && (
                  <>
                    <div>
                      <label className="text-xs font-semibold text-slate-600 block mb-1">Threshold</label>
                      <input value={req.threshold} onChange={(e) => updateReq(i, 'threshold', e.target.value)}
                        placeholder="e.g., 10000000" className="w-full px-3 py-2 text-sm border border-gray-200 focus:outline-none" style={{ borderRadius: '2px' }} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-600 block mb-1">Threshold Display</label>
                      <input value={req.threshold_display} onChange={(e) => updateReq(i, 'threshold_display', e.target.value)}
                        placeholder="e.g., ₹10 Crore or 5 years" className="w-full px-3 py-2 text-sm border border-gray-200 focus:outline-none" style={{ borderRadius: '2px' }} />
                    </div>
                  </>
                )}
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Mandatory</label>
                  <div className="flex gap-4 mt-1.5">
                    {[true, false].map((val) => (
                      <label key={String(val)} className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" checked={req.mandatory === val} onChange={() => updateReq(i, 'mandatory', val)} className="accent-blue-600" />
                        <span className="text-sm">{val ? 'Mandatory' : 'Optional'}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-600">Required Evidence</label>
                    <button className="text-xs text-blue-600 hover:underline" onClick={() => addEvidence(i)}>+ Add</button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                    {(req.required_evidence || []).map((ev, j) => (
                      <span key={j} className="flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-700 text-xs" style={{ borderRadius: '2px' }}>
                        {ev} <button onClick={() => removeEvidence(i, j)} className="text-gray-400 hover:text-red-500 ml-1">Ã—</button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {requirements.length === 0 && (
            <div className="card p-10 text-center">
              <FileText size={32} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm text-gray-500">No requirements yet.</p>
              <button className="btn-primary mt-3 text-xs" onClick={addRequirement}><Plus size={13} /> Add First</button>
            </div>
          )}
        </div>
      )}

      {/* Tab: Preview */}
      {activeTab === 'preview' && (
        <div className="card p-6 space-y-4">
          <div className="p-3 bg-blue-50 border border-blue-100 text-xs text-blue-800" style={{ borderRadius: '2px' }}>
            <AlertCircle size={13} className="inline mr-1" />
            Review all details before creating.
          </div>
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--goi-navy, #003380)' }}>{form.title || '(No title)'}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{form.department} Â· {form.organisation} Â· {form.category}</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Value', value: form.estimated_value ? `₹${Number(form.estimated_value).toLocaleString('en-IN')}` : '—' },
              { label: 'Deadline', value: form.submission_deadline ? new Date(form.submission_deadline).toLocaleDateString('en-IN') : '—' },
              { label: 'EMD', value: form.emd_amount ? `₹${Number(form.emd_amount).toLocaleString('en-IN')}` : 'N/A' },
              { label: 'Method', value: policy.procurement_method },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-50 p-3" style={{ borderRadius: '2px' }}>
                <p className="text-[10px] text-gray-400 uppercase">{label}</p>
                <p className="text-sm font-semibold text-slate-700 mt-0.5">{value}</p>
              </div>
            ))}
          </div>
          <div className="p-3 bg-gray-50 border border-gray-200 text-xs" style={{ borderRadius: '2px' }}>
            <strong>Configured Policy:</strong> {policy.bid_type} Â· QCBS {policy.technical_weight}:{policy.financial_weight}
            {policy.emd_applicable && ' Â· EMD Required'}{policy.make_in_india_applicable && ' Â· Make in India'}
            {policy.mse_preference_applicable && ' Â· MSE Preference'}{policy.reverse_auction_applicable && ' Â· Reverse Auction'}
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-600 mb-2">Requirements ({requirements.length}) — {requirements.filter(r => r.mandatory).length} mandatory</p>
            <div className="space-y-1.5">
              {requirements.map((req, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5 bg-gray-50" style={{ borderRadius: '2px' }}>
                  <span className={`text-[10px] px-1.5 py-0.5 font-bold ${req.mandatory ? 'bg-red-100 text-red-700' : 'bg-gray-200 text-gray-500'}`} style={{ borderRadius: '2px' }}>
                    {req.mandatory ? 'MANDATORY' : 'OPTIONAL'}
                  </span>
                  <span className="text-sm text-slate-700 flex-1">{req.title || '(Unnamed)'}</span>
                  <span className="text-[10px] text-gray-400">{req.category}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3 pb-6">
        <button className="btn-secondary" onClick={() => navigate('/tenders')}>Cancel</button>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <><RefreshCw size={14} className="animate-spin" /> Creating…</> : <><Save size={14} /> Create Tender</>}
        </button>
      </div>
    </div>
  )
}
