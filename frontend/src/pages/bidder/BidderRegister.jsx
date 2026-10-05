import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2, Mail, Phone, MapPin, FileText,
  ChevronRight, Save, RefreshCw, CheckCircle, AlertCircle
} from 'lucide-react'
import { createBidder } from '../../services/api.js'
import { useToast } from '../../components/Toast.jsx'
import { useAuth } from '../../context/AuthContext.jsx'

const COMPANY_TYPES = ['Pvt Ltd', 'Public Ltd', 'LLP', 'Proprietorship', 'Partnership', 'OPC', 'Government PSU', 'Other']

export default function BidderRegister() {
  const navigate = useNavigate()
  const { addToast: showToast } = useToast()
  const { user } = useAuth()
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [errors, setErrors] = useState({})

  const [form, setForm] = useState({
    name: user?.organization_name || '',
    gstin: '',
    pan: '',
    udyam_no: '',
    cin: '',
    email: user?.email || '',
    phone: '',
    address: '',
    type: 'Pvt Ltd',
    incorporation_year: '',
    contact_person: user?.name || '',
    tender_id: 'GEM-DEMO-2026-001',
  })

  const update = (key, val) => {
    setForm((p) => ({ ...p, [key]: val }))
    if (errors[key]) setErrors((p) => ({ ...p, [key]: null }))
  }

  const validate = () => {
    const errs = {}
    if (!form.name.trim()) errs.name = 'Company name is required'
    if (!form.gstin.trim()) errs.gstin = 'GSTIN is required'
    else if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[A-Z\d]$/.test(form.gstin.toUpperCase())) errs.gstin = 'Invalid GSTIN format'
    if (!form.pan.trim()) errs.pan = 'PAN is required'
    else if (!/^[A-Z]{5}\d{4}[A-Z]{1}$/.test(form.pan.toUpperCase())) errs.pan = 'Invalid PAN format'
    if (!form.email.trim()) errs.email = 'Email is required'
    if (!form.tender_id.trim()) errs.tender_id = 'Tender ID is required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) { showToast('Please fix the errors', 'error'); return }
    setSaving(true)
    try {
      const payload = { ...form, gstin: form.gstin.toUpperCase(), pan: form.pan.toUpperCase() }
      const res = await createBidder(payload)
      setSuccess(true)
      showToast(`Registered successfully! Bidder ID: ${res.data.id}`, 'success')
      setTimeout(() => navigate('/bidder/dashboard'), 2000)
    } catch (err) {
      showToast(err.message || 'Registration failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (success) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <CheckCircle size={48} className="mx-auto mb-4 text-green-500" />
          <h2 className="text-xl font-bold text-slate-800">Registration Successful!</h2>
          <p className="text-sm text-gray-500 mt-2">Redirecting to your dashboard…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <span className="hover:text-green-600 cursor-pointer" onClick={() => navigate('/bidder/dashboard')}>Dashboard</span>
        <ChevronRight size={12} />
        <span className="text-slate-700 font-medium">Register as Bidder</span>
      </div>

      <div>
        <h1 className="page-title">Bidder Registration</h1>
        <p className="text-sm text-gray-500 mt-0.5">Register your company to participate in government procurement tenders</p>
      </div>

      {/* Notice */}
      <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-xl">
        <AlertCircle size={14} className="text-blue-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-800">
          Ensure your company details match <strong>exactly</strong> with your GST registration.
          All documents will be cross-verified with government databases during compliance evaluation.
        </p>
      </div>

      <div className="card p-6 space-y-5">
        {/* Company Details */}
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Building2 size={14} className="text-blue-600" /> Company Details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Legal Company Name <span className="text-red-500">*</span></label>
              <input type="text" value={form.name} onChange={(e) => update('name', e.target.value)}
                placeholder="Exactly as on GST certificate"
                className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${errors.name ? 'border-red-400 bg-red-50' : 'border-gray-200'}`} />
              {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
            </div>

            {[
              { key: 'gstin', label: 'GSTIN', placeholder: 'e.g. 27AABCA1234B1Z5', required: true },
              { key: 'pan', label: 'PAN Number', placeholder: 'e.g. AABCA1234B', required: true },
              { key: 'udyam_no', label: 'Udyam / MSME Number', placeholder: 'e.g. UDYAM-MH-12-0034567' },
              { key: 'cin', label: 'CIN (if applicable)', placeholder: 'e.g. U72200MH2009PTC195432' },
            ].map(({ key, label, placeholder, required }) => (
              <div key={key}>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {label} {required && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="text"
                  value={form[key]}
                  onChange={(e) => update(key, e.target.value)}
                  placeholder={placeholder}
                  className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 font-mono uppercase ${errors[key] ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}
                />
                {errors[key] && <p className="text-xs text-red-500 mt-1">{errors[key]}</p>}
              </div>
            ))}

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Company Type</label>
              <select value={form.type} onChange={(e) => update('type', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
                {COMPANY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Year of Incorporation</label>
              <input type="number" min="1900" max={new Date().getFullYear()}
                value={form.incorporation_year} onChange={(e) => update('incorporation_year', e.target.value)}
                placeholder="e.g. 2010"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
          </div>
        </div>

        <hr className="border-gray-100" />

        {/* Contact Details */}
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Mail size={14} className="text-green-600" /> Contact Details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { key: 'contact_person', label: 'Contact Person Name', placeholder: 'Authorized signatory name', icon: null },
              { key: 'email', label: 'Official Email', placeholder: 'company@email.com', required: true, type: 'email' },
              { key: 'phone', label: 'Phone Number', placeholder: '+91 98XXXXXXXX', type: 'tel' },
            ].map(({ key, label, placeholder, required, type = 'text' }) => (
              <div key={key}>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {label} {required && <span className="text-red-500">*</span>}
                </label>
                <input type={type} value={form[key]} onChange={(e) => update(key, e.target.value)}
                  placeholder={placeholder}
                  className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${errors[key] ? 'border-red-400 bg-red-50' : 'border-gray-200'}`} />
                {errors[key] && <p className="text-xs text-red-500 mt-1">{errors[key]}</p>}
              </div>
            ))}

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                <MapPin size={11} className="inline mr-1" />Registered Address
              </label>
              <textarea rows={2} value={form.address} onChange={(e) => update('address', e.target.value)}
                placeholder="Registered office address as per GST"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 resize-none" />
            </div>
          </div>
        </div>

        <hr className="border-gray-100" />

        {/* Tender Selection */}
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <FileText size={14} className="text-purple-600" /> Tender Registration
          </h2>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Tender ID <span className="text-red-500">*</span></label>
            <input type="text" value={form.tender_id} onChange={(e) => update('tender_id', e.target.value)}
              placeholder="e.g. GEM-DEMO-2026-001"
              className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 font-mono ${errors.tender_id ? 'border-red-400 bg-red-50' : 'border-gray-200'}`} />
            {errors.tender_id && <p className="text-xs text-red-500 mt-1">{errors.tender_id}</p>}
            <p className="text-xs text-gray-400 mt-1">You can find the Tender ID in the Browse Tenders section.</p>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pb-4">
        <button className="btn-secondary" onClick={() => navigate('/bidder/tenders')}>Browse Tenders</button>
        <button className="btn-primary bg-green-700 hover:bg-green-800" onClick={handleSubmit} disabled={saving}>
          {saving ? <><RefreshCw size={14} className="animate-spin" /> Registering…</> : <><Save size={14} /> Register Bidder</>}
        </button>
      </div>
    </div>
  )
}
