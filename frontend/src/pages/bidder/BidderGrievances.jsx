/**
 * BidderGrievances.jsx — Bidder submits and tracks grievances/representations
 */
import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, MessageSquare, Plus, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react'
import { getBidderGrievances, submitGrievance } from '../../services/api.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../components/Toast.jsx'
import { PageLoader } from '../../components/LoadingSkeleton.jsx'

const CATEGORIES = [
  { value: 'CLARIFICATION', label: 'Request Clarification' },
  { value: 'TECHNICAL_OBJECTION', label: 'Technical Objection' },
  { value: 'FINANCIAL_OBJECTION', label: 'Financial Objection' },
  { value: 'TENDER_GRIEVANCE', label: 'Tender Grievance' },
  { value: 'PROCESS_COMPLAINT', label: 'Process Complaint' },
  { value: 'GENERAL', label: 'General' },
]

const STATUS_COLOR = {
  SUBMITTED: 'text-blue-700 bg-blue-50 border-blue-200',
  UNDER_REVIEW: 'text-amber-700 bg-amber-50 border-amber-200',
  RESPONDED: 'text-green-700 bg-green-50 border-green-200',
  ESCALATED: 'text-red-700 bg-red-50 border-red-200',
  CLOSED: 'text-gray-600 bg-gray-100 border-gray-200',
}

export default function BidderGrievances() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { addToast } = useToast()
  const [grievances, setGrievances] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    tender_id: 'GEM-DEMO-2026-001', category: 'CLARIFICATION',
    subject: '', description: '', priority: 'MEDIUM',
  })

  const load = () => {
    setLoading(true)
    getBidderGrievances()
      .then((res) => setGrievances(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleSubmit = async () => {
    if (!form.subject.trim() || !form.description.trim()) {
      addToast('Subject and description are required', 'warning'); return
    }
    setSubmitting(true)
    try {
      await submitGrievance({
        ...form,
        bidder_id: user?.organization_id || 'BID-001',
        submitter_name: user?.name || 'Bidder',
      })
      addToast('Grievance submitted successfully', 'success')
      setShowForm(false)
      setForm({ tender_id: 'GEM-DEMO-2026-001', category: 'CLARIFICATION', subject: '', description: '', priority: 'MEDIUM' })
      load()
    } catch { addToast('Submission failed', 'error') }
    finally { setSubmitting(false) }
  }

  if (loading) return <PageLoader />

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate('/bidder/dashboard')}>Dashboard</span>
        <ChevronRight size={12} />
        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>Grievances & Representations</span>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="page-title">Grievances &amp; Representations</h1>
        <button className="btn-primary text-xs" onClick={() => setShowForm(!showForm)}>
          <Plus size={13} /> New Grievance
        </button>
      </div>

      {showForm && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Submit Grievance / Representation</h2>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Category</label>
                <select value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none" style={{ borderRadius: '2px' }}>
                  {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Priority</label>
                <select value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none" style={{ borderRadius: '2px' }}>
                  {['LOW', 'MEDIUM', 'HIGH'].map((p) => <option key={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Tender ID</label>
              <input value={form.tender_id} onChange={(e) => setForm((p) => ({ ...p, tender_id: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none" style={{ borderRadius: '2px' }} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Subject *</label>
              <input value={form.subject} onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
                placeholder="Brief subject of your grievance"
                className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none" style={{ borderRadius: '2px' }} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Description *</label>
              <textarea rows={4} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Detailed description of your grievance, representation, or objection…"
                className="w-full px-3 py-2.5 text-sm border border-gray-300 focus:outline-none resize-none" style={{ borderRadius: '2px' }} />
            </div>
            <div className="flex gap-3">
              <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn-primary flex-1 justify-center" onClick={handleSubmit} disabled={submitting}>
                {submitting ? <><RefreshCw size={13} className="animate-spin" /> Submitting…</> : 'Submit Grievance'}
              </button>
            </div>
          </div>
        </div>
      )}

      {grievances.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <MessageSquare size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No grievances submitted yet.</p>
          <button className="btn-primary mt-3 text-xs" onClick={() => setShowForm(true)}><Plus size={13} /> Submit First</button>
        </div>
      ) : (
        <div className="space-y-3">
          {grievances.map((g) => (
            <div key={g.id} className="card p-4">
              <div className="flex items-start justify-between mb-2">
                <span className="text-xs font-mono text-gray-400">{g.id}</span>
                <span className={`text-[10px] px-2 py-0.5 border font-semibold ${STATUS_COLOR[g.status] || STATUS_COLOR.SUBMITTED}`}
                  style={{ borderRadius: '2px' }}>
                  {g.status?.replace(/_/g, ' ')}
                </span>
              </div>
              <p className="text-sm font-semibold text-slate-800">{g.subject}</p>
              <p className="text-xs text-gray-500 mt-0.5">{g.category?.replace(/_/g, ' ')} · {g.tender_id || '—'}</p>
              {g.officer_response && (
                <div className="mt-3 p-3 bg-green-50 border border-green-200" style={{ borderRadius: '2px' }}>
                  <p className="text-[10px] font-semibold text-green-600 uppercase mb-1">Officer Response</p>
                  <p className="text-xs text-green-800">{g.officer_response}</p>
                </div>
              )}
              <p className="text-[10px] text-gray-400 mt-2">{g.submitted_at ? new Date(g.submitted_at).toLocaleDateString('en-IN') : ''}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
