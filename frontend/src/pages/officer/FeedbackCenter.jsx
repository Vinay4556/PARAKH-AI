import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MessageSquare, ChevronRight, CheckCircle, AlertTriangle,
  XCircle, Clock, Send, RefreshCw
} from 'lucide-react'
import api from '../../services/api.js'
import { PageLoader } from '../../components/LoadingSkeleton.jsx'
import { useToast } from '../../components/Toast.jsx'

const STATUS_STYLES = {
  SUBMITTED: 'bg-blue-50 text-blue-700 border-blue-200',
  UNDER_REVIEW: 'bg-amber-50 text-amber-700 border-amber-200',
  RESOLVED: 'bg-green-50 text-green-700 border-green-200',
}

const PRIORITY_STYLES = {
  CRITICAL: 'bg-red-100 text-red-800',
  HIGH: 'bg-red-50 text-red-700',
  MEDIUM: 'bg-amber-50 text-amber-700',
  LOW: 'bg-gray-100 text-gray-600',
}

export default function FeedbackCenter() {
  const navigate = useNavigate()
  const { addToast } = useToast()
  const [feedback, setFeedback] = useState([])
  const [loading, setLoading] = useState(true)
  const [responding, setResponding] = useState(null)
  const [form, setForm] = useState({ public_response: '', internal_notes: '', status: 'RESOLVED' })
  const [submitting, setSubmitting] = useState(false)
  const [filter, setFilter] = useState('all')
  const [tenderFilter, setTenderFilter] = useState('all')

  const load = () => {
    api.get('/officer/feedback')
      .then((res) => setFeedback(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleRespond = async (fbId) => {
    if (!form.public_response.trim()) { addToast('Public response required', 'warning'); return }
    setSubmitting(true)
    try {
      await api.post(`/officer/feedback/${fbId}/respond`, form)
      addToast('Response submitted', 'success')
      setResponding(null)
      setForm({ public_response: '', internal_notes: '', status: 'RESOLVED' })
      load()
    } catch {
      addToast('Failed to submit', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // Unique tender IDs for the filter dropdown
  const tenderIds = ['all', ...new Set(feedback.map((f) => f.tender_id).filter(Boolean))]

  const filtered = feedback.filter((f) => {
    if (filter === 'pending' && f.status !== 'SUBMITTED') return false
    if (filter === 'review' && f.status !== 'UNDER_REVIEW') return false
    if (filter === 'resolved' && f.status !== 'RESOLVED') return false
    if (tenderFilter !== 'all' && f.tender_id !== tenderFilter) return false
    return true
  })

  if (loading) return <PageLoader />

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate('/')}>Dashboard</span>
        <ChevronRight size={12} />
        <span className="text-slate-700 font-medium">Feedback Center</span>
      </div>

      <div className="flex items-center gap-2">
        <MessageSquare size={20} className="text-purple-600" />
        <div>
          <h1 className="page-title">Stakeholder Feedback</h1>
          <p className="text-sm text-gray-500">{feedback.filter((f) => f.status === 'SUBMITTED').length} pending response</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Status filter */}
        <div className="flex gap-1.5">
          {[
            { key: 'all',      label: `All (${feedback.length})` },
            { key: 'pending',  label: `Pending (${feedback.filter(f => f.status === 'SUBMITTED').length})` },
            { key: 'review',   label: 'Under Review' },
            { key: 'resolved', label: 'Resolved' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`text-xs px-3 py-1.5 font-medium transition-colors ${filter === key ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              style={{ borderRadius: '2px' }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tender filter */}
        {tenderIds.length > 1 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-gray-500 font-semibold whitespace-nowrap">Tender:</span>
            <select
              value={tenderFilter}
              onChange={(e) => setTenderFilter(e.target.value)}
              className="text-xs border border-gray-300 px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{ borderRadius: '2px' }}
            >
              <option value="all">All Tenders</option>
              {tenderIds.filter(id => id !== 'all').map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="card p-10 text-center text-gray-400">
          <MessageSquare size={28} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No feedback items.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((fb) => {
            const isResponding = responding === fb.id
            return (
              <div key={fb.id} className="card p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-mono text-gray-400">{fb.id}</span>
                      <span className={`status-badge text-[10px] border ${STATUS_STYLES[fb.status] || ''}`}>
                        {fb.status?.replace('_', ' ')}
                      </span>
                      <span className={`status-badge text-[10px] ${PRIORITY_STYLES[fb.priority] || ''}`}>
                        {fb.priority}
                      </span>
                    </div>
                    {/* ── Tender reference ─────────────────────────────── */}
                    {fb.tender_id && (
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Tender:</span>
                        <button
                          className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 hover:bg-blue-100 transition-colors"
                          style={{ borderRadius: '2px' }}
                          onClick={() => navigate(`/tenders/${fb.tender_id}`)}
                        >
                          {fb.tender_id}
                        </button>
                      </div>
                    )}
                    <h3 className="text-sm font-semibold text-slate-800">{fb.subject}</h3>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {fb.submitter_name} · {new Date(fb.submitted_at).toLocaleDateString('en-IN')} · {fb.category}
                    </p>
                  </div>
                  {fb.ai_priority && (
                    <div className="bg-purple-50 border border-purple-200 rounded-lg px-2.5 py-1.5 text-center flex-shrink-0">
                      <p className="text-[9px] text-purple-500 font-semibold">AI Priority</p>
                      <p className="text-xs font-bold text-purple-700">{fb.ai_priority}</p>
                    </div>
                  )}
                </div>

                <div className="bg-gray-50 rounded-xl p-3 mb-3">
                  <p className="text-[10px] text-gray-400 font-semibold uppercase mb-1">Feedback</p>
                  <p className="text-sm text-slate-700 leading-relaxed">{fb.description}</p>
                </div>

                {fb.public_response && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-3">
                    <p className="text-[10px] text-green-600 font-semibold uppercase mb-1">Public Response (Published)</p>
                    <p className="text-sm text-slate-700">{fb.public_response}</p>
                  </div>
                )}

                {fb.internal_notes && (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-3">
                    <p className="text-[10px] text-blue-500 font-semibold uppercase mb-1">Internal Notes</p>
                    <p className="text-sm text-slate-600">{fb.internal_notes}</p>
                  </div>
                )}

                {fb.status !== 'RESOLVED' && (
                  <>
                    {isResponding ? (
                      <div className="space-y-3 mt-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">
                            Public Response <span className="text-[10px] text-gray-400 font-normal">(visible to stakeholder)</span>
                          </label>
                          <textarea
                            rows={3}
                            value={form.public_response}
                            onChange={(e) => setForm({ ...form, public_response: e.target.value })}
                            placeholder="Official public response…"
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-gray-50"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">
                            Internal Notes <span className="text-[10px] text-gray-400 font-normal">(officer only)</span>
                          </label>
                          <textarea
                            rows={2}
                            value={form.internal_notes}
                            onChange={(e) => setForm({ ...form, internal_notes: e.target.value })}
                            placeholder="Internal notes…"
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-gray-50"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button className="btn-secondary text-xs py-2" onClick={() => setResponding(null)}>Cancel</button>
                          <button className="btn-primary text-xs py-2" onClick={() => handleRespond(fb.id)} disabled={submitting}>
                            {submitting ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />}
                            {submitting ? 'Submitting…' : 'Submit & Resolve'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        className="btn-primary text-xs mt-2"
                        onClick={() => setResponding(fb.id)}
                      >
                        <MessageSquare size={12} /> Respond to Feedback
                      </button>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
