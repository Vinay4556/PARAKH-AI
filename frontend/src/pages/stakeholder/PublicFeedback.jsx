import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  MessageSquare, ChevronRight, Send, RefreshCw,
  CheckCircle, AlertTriangle, Info, FileText,
  Search, Calendar, Building2
} from 'lucide-react'
import api from '../../services/api.js'
import { useToast } from '../../components/Toast.jsx'

const CATEGORIES = [
  'Process Concern', 'Technical Issue', 'Accessibility',
  'Delay', 'Tender Information Issue', 'Integrity Concern', 'Other',
]

export default function PublicFeedback() {
  const { tenderId: paramTenderId } = useParams()
  const navigate = useNavigate()
  const { addToast } = useToast()

  const [tenders, setTenders]         = useState([])
  const [selectedId, setSelectedId]   = useState(paramTenderId || '')
  const [loadingList, setLoadingList] = useState(true)
  const [search, setSearch]           = useState('')
  const [submitted, setSubmitted]     = useState(null)
  const [submitting, setSubmitting]   = useState(false)
  const [myFeedback, setMyFeedback]   = useState([])

  const [form, setForm] = useState({
    category: 'Process Concern',
    subject: '',
    description: '',
  })

  // Load all public tenders
  useEffect(() => {
    api.get('/public/tenders')
      .then((res) => setTenders(res.data || []))
      .catch(console.error)
      .finally(() => setLoadingList(false))
  }, [])

  // Load previous feedback when tender changes
  useEffect(() => {
    if (!selectedId) { setMyFeedback([]); return }
    api.get(`/public/feedback?tender_id=${selectedId}&submitted_by=USR-003`)
      .then((res) => setMyFeedback(res.data || []))
      .catch(console.error)
  }, [selectedId])

  const selectedTender = tenders.find((t) => t.id === selectedId)

  const filteredTenders = tenders.filter((t) =>
    !search ||
    t.id.toLowerCase().includes(search.toLowerCase()) ||
    t.title.toLowerCase().includes(search.toLowerCase()) ||
    (t.department || '').toLowerCase().includes(search.toLowerCase())
  )

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedId) { addToast('Please select a tender first', 'warning'); return }
    if (!form.subject.trim() || !form.description.trim()) {
      addToast('Please fill all required fields', 'warning'); return
    }
    setSubmitting(true)
    try {
      const res = await api.post(`/public/tenders/${selectedId}/feedback`, {
        ...form,
        submitted_by: 'USR-003',
        submitter_name: 'Priya Sharma',
      })
      setSubmitted(res.data)
      addToast('Feedback submitted successfully', 'success')
      setMyFeedback((prev) => [...prev, {
        id: res.data.feedback_id, ...form,
        status: 'SUBMITTED', tender_id: selectedId,
      }])
    } catch (err) {
      addToast(err.message || 'Submission failed', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const resetForm = () => {
    setSubmitted(null)
    setForm({ category: 'Process Concern', subject: '', description: '' })
  }

  return (
    <div className="p-6 space-y-5 max-w-2xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate('/public/dashboard')}>Public Portal</span>
        <ChevronRight size={12} />
        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>Submit Feedback</span>
      </div>

      <div className="flex items-center gap-2">
        <MessageSquare size={20} className="text-purple-600" />
        <div>
          <h1 className="page-title">Submit Feedback</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Select a tender and share your concern with the procurement team
          </p>
        </div>
      </div>

      {/* ── Tender Selector ─────────────────────────────────── */}
      <div className="card p-5">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-3">
          Step 1 — Select Tender <span className="text-red-500">*</span>
        </label>

        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by tender ID, title or department…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-gray-50"
            style={{ borderRadius: '2px' }}
          />
        </div>

        {loadingList ? (
          <p className="text-xs text-gray-400 text-center py-4">Loading tenders…</p>
        ) : filteredTenders.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">No tenders found.</p>
        ) : (
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {filteredTenders.map((t) => (
              <div
                key={t.id}
                onClick={() => { setSelectedId(t.id); setSubmitted(null) }}
                className={`flex items-start gap-3 p-3 cursor-pointer transition-all border-2 ${
                  selectedId === t.id
                    ? 'border-purple-600 bg-purple-50'
                    : 'border-gray-100 hover:border-purple-200 hover:bg-gray-50'
                }`}
                style={{ borderRadius: '2px' }}
              >
                <FileText size={15} className={selectedId === t.id ? 'text-purple-600 flex-shrink-0 mt-0.5' : 'text-gray-400 flex-shrink-0 mt-0.5'} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-blue-700">{t.id}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 font-semibold ${
                      t.status === 'active' || t.status === 'OPEN'
                        ? 'bg-green-50 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`} style={{ borderRadius: '2px' }}>
                      {(t.status || 'OPEN').toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-slate-700 mt-0.5 leading-snug truncate">{t.title}</p>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-400">
                    <span className="flex items-center gap-1"><Building2 size={10} />{t.department}</span>
                    <span className="flex items-center gap-1">
                      <Calendar size={10} />Deadline: {t.submission_deadline ? new Date(t.submission_deadline).toLocaleDateString('en-IN') : '—'}
                    </span>
                  </div>
                </div>
                {selectedId === t.id && (
                  <CheckCircle size={16} className="text-purple-600 flex-shrink-0 mt-1" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── No tender selected ───────────────────────────────── */}
      {!selectedId && (
        <div className="card p-10 text-center text-gray-400">
          <MessageSquare size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-semibold">Select a tender above to submit feedback</p>
        </div>
      )}

      {/* ── Feedback Form ─────────────────────────────────────── */}
      {selectedId && (
        <>
          {/* Selected tender banner */}
          <div className="p-3 bg-purple-50 border border-purple-200 flex items-center gap-3" style={{ borderRadius: '2px' }}>
            <FileText size={14} className="text-purple-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-purple-800">Submitting feedback for:</p>
              <p className="text-sm font-semibold text-slate-700 truncate">{selectedTender?.title || selectedId}</p>
            </div>
            <span className="text-xs font-mono text-purple-600 flex-shrink-0">{selectedId}</span>
          </div>

          <div className="bg-blue-50 border border-blue-100 p-3 flex items-start gap-2" style={{ borderRadius: '2px' }}>
            <Info size={13} className="text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-800 leading-relaxed">
              Feedback is reviewed by the Procurement Officer. High-priority concerns are escalated.
              AI classifies your feedback to ensure it reaches the right team.
              Do not share personal or confidential information.
            </p>
          </div>

          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Step 2 — Fill Your Feedback
          </div>

          {submitted ? (
            <div className="card p-6 text-center">
              <div className="w-12 h-12 bg-green-100 flex items-center justify-center mx-auto mb-3" style={{ borderRadius: '50%' }}>
                <CheckCircle size={24} className="text-green-600" />
              </div>
              <h3 className="font-bold text-slate-800 mb-1">Feedback Submitted</h3>
              <p className="text-xs text-gray-500 mb-3">For tender: <strong>{selectedId}</strong></p>
              <div className="bg-gray-50 p-3 mb-4" style={{ borderRadius: '2px' }}>
                <p className="text-[10px] text-gray-400 font-semibold mb-1">Feedback ID</p>
                <p className="text-lg font-bold text-slate-700 font-mono">{submitted.feedback_id}</p>
              </div>
              <div className="bg-amber-50 border border-amber-200 p-3 mb-4 text-left" style={{ borderRadius: '2px' }}>
                <p className="text-xs text-amber-800">
                  <span className="font-semibold">AI Priority: {submitted.ai_priority}</span><br />
                  Your feedback has been classified and routed to the procurement team.
                </p>
              </div>
              <button className="btn-secondary" onClick={resetForm}>
                Submit Another Feedback
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="card p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Category</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-gray-50"
                  style={{ borderRadius: '2px' }}
                >
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Subject <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder="Brief description of your concern"
                  required
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-gray-50"
                  style={{ borderRadius: '2px' }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={4}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Provide detailed information about your concern…"
                  required
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none bg-gray-50"
                  style={{ borderRadius: '2px' }}
                />
              </div>
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-white text-sm font-semibold transition-colors"
                style={{ background: '#4a0080', borderRadius: '2px' }}
                disabled={submitting}
              >
                {submitting ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                {submitting ? 'Submitting…' : 'Submit Feedback'}
              </button>
            </form>
          )}

          {/* Previous feedback for this tender */}
          {myFeedback.length > 0 && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">
                My Submitted Feedback — {selectedId}
              </h2>
              <div className="space-y-2">
                {myFeedback.map((fb, i) => (
                  <div key={fb.id || i} className="flex items-start gap-3 p-3 bg-gray-50" style={{ borderRadius: '2px' }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-[10px] font-mono text-gray-400">{fb.id}</span>
                        <span className={`text-[10px] px-2 py-0.5 border font-semibold ${
                          fb.status === 'RESOLVED'
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : fb.status === 'UNDER_REVIEW'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-gray-100 text-gray-500 border-gray-200'
                        }`} style={{ borderRadius: '2px' }}>
                          {fb.status || 'SUBMITTED'}
                        </span>
                        <span className="text-[10px] text-gray-400">{fb.category}</span>
                      </div>
                      <p className="text-sm font-medium text-slate-700">{fb.subject}</p>
                      {fb.public_response && (
                        <div className="mt-2 p-2 bg-green-50 border border-green-200" style={{ borderRadius: '2px' }}>
                          <p className="text-[10px] text-green-600 font-semibold mb-0.5">Official Response</p>
                          <p className="text-xs text-slate-700">{fb.public_response}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
