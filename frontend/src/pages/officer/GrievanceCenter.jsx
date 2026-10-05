/**
 * GrievanceCenter.jsx — Officer Grievance Management Center
 * View, assign, respond to, escalate, and close grievances.
 */
import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronRight, MessageSquare, AlertTriangle, CheckCircle,
  RefreshCw, User, Clock, ArrowRight, Filter
} from 'lucide-react'
import { getGrievances, assignGrievance, respondToGrievance } from '../../services/api.js'
import { PageLoader } from '../../components/LoadingSkeleton.jsx'
import { useToast } from '../../components/Toast.jsx'

const STATUS_CONFIG = {
  SUBMITTED:     { label: 'Submitted',     color: 'text-blue-700 bg-blue-50 border-blue-200' },
  UNDER_REVIEW:  { label: 'Under Review',  color: 'text-amber-700 bg-amber-50 border-amber-200' },
  RESPONDED:     { label: 'Responded',     color: 'text-green-700 bg-green-50 border-green-200' },
  ESCALATED:     { label: 'Escalated',     color: 'text-red-700 bg-red-50 border-red-200' },
  CLOSED:        { label: 'Closed',        color: 'text-gray-600 bg-gray-100 border-gray-200' },
  REJECTED:      { label: 'Rejected',      color: 'text-gray-600 bg-gray-100 border-gray-200' },
}

const PRIORITY_COLOR = {
  LOW: 'text-green-600', MEDIUM: 'text-amber-600', HIGH: 'text-red-600', CRITICAL: 'text-red-800 font-bold',
}

export default function GrievanceCenter() {
  const navigate = useNavigate()
  const { addToast } = useToast()
  const [grievances, setGrievances] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [filterStatus, setFilterStatus] = useState('ALL')
  const [response, setResponse] = useState('')
  const [publicNote, setPublicNote] = useState('')
  const [responding, setResponding] = useState(false)
  const [newStatus, setNewStatus] = useState('RESPONDED')

  const load = () => {
    setLoading(true)
    getGrievances()
      .then((res) => setGrievances(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const filtered = filterStatus === 'ALL' ? grievances : grievances.filter((g) => g.status === filterStatus)

  const handleAssign = async (id) => {
    try {
      await assignGrievance(id, { assigned_to: 'Rajesh Kumar' })
      addToast('Grievance assigned', 'success')
      load()
    } catch { addToast('Assignment failed', 'error') }
  }

  const handleRespond = async () => {
    if (!response.trim()) { addToast('Response text is required', 'warning'); return }
    setResponding(true)
    try {
      await respondToGrievance(selected.id, {
        response, status: newStatus, public_note: publicNote, officer: 'Rajesh Kumar',
      })
      addToast('Response submitted', 'success')
      setResponse(''); setPublicNote(''); setSelected(null)
      load()
    } catch { addToast('Response failed', 'error') }
    finally { setResponding(false) }
  }

  if (loading) return <PageLoader />

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate('/')}>Dashboard</span>
        <ChevronRight size={12} />
        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>Grievance Centre</span>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="page-title flex items-center gap-2"><MessageSquare size={20} className="text-blue-600" /> Grievance Centre</h1>
        <div className="flex gap-1.5">
          {['ALL', 'SUBMITTED', 'UNDER_REVIEW', 'ESCALATED', 'CLOSED'].map((s) => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`text-xs px-3 py-1.5 font-medium transition-colors ${filterStatus === s ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              style={{ borderRadius: '2px' }}>
              {s === 'ALL' ? `All (${grievances.length})` : STATUS_CONFIG[s]?.label || s}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* List */}
        <div className="space-y-3 lg:col-span-1">
          {filtered.length === 0 ? (
            <div className="card p-10 text-center text-gray-400">
              <MessageSquare size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No grievances in this filter.</p>
            </div>
          ) : filtered.map((g) => {
            const cfg = STATUS_CONFIG[g.status] || STATUS_CONFIG.SUBMITTED
            return (
              <div key={g.id}
                className={`card p-4 cursor-pointer hover:shadow-md transition-all ${selected?.id === g.id ? 'border-2 border-blue-600 bg-blue-50/30' : ''}`}
                onClick={() => { setSelected(g); setResponse(''); setPublicNote('') }}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="text-xs font-mono text-gray-400">{g.id}</span>
                  <span className={`text-[10px] px-2 py-0.5 border font-semibold ${cfg.color}`} style={{ borderRadius: '2px' }}>{cfg.label}</span>
                </div>
                <p className="text-sm font-semibold text-slate-800 leading-snug">{g.subject}</p>
                <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                  <span className={PRIORITY_COLOR[g.priority]}>{g.priority}</span>
                  <span>·</span>
                  <span>{g.category?.replace(/_/g, ' ')}</span>
                  <span className="ml-auto">{g.submitted_at ? new Date(g.submitted_at).toLocaleDateString('en-IN') : ''}</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Detail */}
        {selected ? (
          <div className="lg:col-span-2 space-y-4">
            <div className="card p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <span className="text-xs font-mono text-gray-400">{selected.id}</span>
                  <h2 className="text-base font-bold text-slate-800 mt-0.5">{selected.subject}</h2>
                  <p className="text-xs text-gray-500 mt-0.5">{selected.category?.replace(/_/g, ' ')} · Tender: {selected.tender_id || '—'}</p>
                </div>
                {selected.status === 'SUBMITTED' && (
                  <button className="btn-primary text-xs" onClick={() => handleAssign(selected.id)}>
                    <User size={12} /> Assign to Me
                  </button>
                )}
              </div>
              <p className="text-sm text-slate-700 leading-relaxed bg-gray-50 p-3" style={{ borderRadius: '2px' }}>
                {selected.description}
              </p>
              {selected.officer_response && (
                <div className="mt-3 p-3 bg-green-50 border border-green-200" style={{ borderRadius: '2px' }}>
                  <p className="text-[10px] font-semibold uppercase text-green-600 mb-1">Officer Response</p>
                  <p className="text-sm text-green-800">{selected.officer_response}</p>
                  <p className="text-[10px] text-gray-400 mt-1">{selected.response_at ? new Date(selected.response_at).toLocaleString('en-IN') : ''}</p>
                </div>
              )}
            </div>

            {selected.status !== 'CLOSED' && selected.status !== 'REJECTED' && (
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Respond to Grievance</h3>
                <textarea rows={4} value={response} onChange={(e) => setResponse(e.target.value)}
                  placeholder="Enter officer response…"
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-3"
                  style={{ borderRadius: '2px' }} />
                <textarea rows={2} value={publicNote} onChange={(e) => setPublicNote(e.target.value)}
                  placeholder="Public-safe note (optional — visible on public portal)…"
                  className="w-full px-3 py-2 text-sm border border-gray-200 focus:outline-none resize-none mb-3"
                  style={{ borderRadius: '2px' }} />
                <div className="flex items-center gap-3">
                  <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}
                    className="text-sm border border-gray-300 px-3 py-2 focus:outline-none" style={{ borderRadius: '2px' }}>
                    <option value="RESPONDED">Responded</option>
                    <option value="UNDER_REVIEW">Under Review</option>
                    <option value="ESCALATED">Escalate</option>
                    <option value="CLOSED">Close</option>
                    <option value="REJECTED">Reject</option>
                  </select>
                  <button className="btn-primary flex-1 justify-center" onClick={handleRespond} disabled={responding}>
                    {responding ? <RefreshCw size={13} className="animate-spin" /> : <ArrowRight size={13} />}
                    {responding ? 'Submitting…' : 'Submit Response'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="lg:col-span-2 card p-10 text-center text-gray-400">
            <MessageSquare size={28} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Select a grievance to view details.</p>
          </div>
        )}
      </div>
    </div>
  )
}
