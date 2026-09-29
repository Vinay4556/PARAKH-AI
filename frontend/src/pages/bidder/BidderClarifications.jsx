import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MessageSquare, ChevronRight, AlertTriangle, CheckCircle,
  Clock, Send, RefreshCw, X
} from 'lucide-react'
import api from '../../services/api.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { PageLoader } from '../../components/LoadingSkeleton.jsx'
import { useToast } from '../../components/Toast.jsx'

const STATUS_CONFIG = {
  PENDING_BIDDER: { label: 'Your Response Required', color: 'text-amber-700 bg-amber-50 border-amber-200', icon: AlertTriangle },
  PENDING_OFFICER: { label: 'Awaiting Officer Review', color: 'text-blue-700 bg-blue-50 border-blue-200', icon: Clock },
  RESOLVED: { label: 'Resolved', color: 'text-green-700 bg-green-50 border-green-200', icon: CheckCircle },
}

export default function BidderClarifications() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { addToast } = useToast()
  const bidderId = user?.organization_id || 'BID-001'

  const [clarifications, setClarifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [responding, setResponding] = useState(null) // clarification id being responded to
  const [responseText, setResponseText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = () => {
    api.get(`/bidder/clarifications?bidder_id=${bidderId}`)
      .then((res) => setClarifications(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleRespond = async (clrId) => {
    if (!responseText.trim()) { addToast('Please enter a response', 'warning'); return }
    setSubmitting(true)
    try {
      await api.post(`/bidder/clarifications/${clrId}/respond`, { response: responseText })
      addToast('Response submitted successfully', 'success')
      setResponding(null)
      setResponseText('')
      load()
    } catch {
      addToast('Failed to submit response', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <PageLoader />

  const pending = clarifications.filter((c) => c.status === 'PENDING_BIDDER')
  const others = clarifications.filter((c) => c.status !== 'PENDING_BIDDER')

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate('/bidder/dashboard')}>Dashboard</span>
        <ChevronRight size={12} />
        <span className="text-slate-700 font-medium">Clarifications</span>
      </div>

      <div className="flex items-center gap-2">
        <MessageSquare size={20} className="text-amber-600" />
        <div>
          <h1 className="page-title">Clarifications</h1>
          <p className="text-sm text-gray-500">{pending.length} requiring your response</p>
        </div>
      </div>

      {clarifications.length === 0 ? (
        <div className="card p-10 text-center text-gray-400">
          <MessageSquare size={28} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No clarifications requested yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {[...pending, ...others].map((clr) => {
            const cfg = STATUS_CONFIG[clr.status] || STATUS_CONFIG.PENDING_OFFICER
            const Icon = cfg.icon
            const isResponding = responding === clr.id

            return (
              <div key={clr.id} className="card p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-gray-400">{clr.id}</span>
                      <span className={`status-badge text-[10px] border ${cfg.color}`}>
                        <Icon size={10} /> {cfg.label}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-slate-800">{clr.subject}</h3>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      Requested by {clr.requested_by} · {new Date(clr.requested_at).toLocaleDateString('en-IN')}
                    </p>
                  </div>
                  <div className={`px-2 py-1 rounded-lg text-[10px] font-semibold ${clr.severity === 'HIGH' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                    {clr.severity}
                  </div>
                </div>

                {/* Officer message */}
                <div className="bg-gray-50 rounded-xl p-3 mb-3">
                  <p className="text-[10px] text-gray-400 font-semibold uppercase mb-1">Officer Query</p>
                  <p className="text-sm text-slate-700 leading-relaxed">{clr.message}</p>
                </div>

                {/* Existing response */}
                {clr.response && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-3">
                    <p className="text-[10px] text-green-600 font-semibold uppercase mb-1">Your Response</p>
                    <p className="text-sm text-slate-700 leading-relaxed">{clr.response}</p>
                    {clr.responded_at && (
                      <p className="text-[10px] text-gray-400 mt-1">
                        Submitted {new Date(clr.responded_at).toLocaleDateString('en-IN')}
                      </p>
                    )}
                  </div>
                )}

                {/* Response form */}
                {clr.status === 'PENDING_BIDDER' && (
                  <>
                    {isResponding ? (
                      <div className="mt-3">
                        <textarea
                          rows={3}
                          value={responseText}
                          onChange={(e) => setResponseText(e.target.value)}
                          placeholder="Type your clarification response here…"
                          className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-gray-50"
                        />
                        <div className="flex gap-2 mt-2">
                          <button className="btn-secondary text-xs py-2" onClick={() => { setResponding(null); setResponseText('') }}>
                            Cancel
                          </button>
                          <button className="btn-primary text-xs py-2" onClick={() => handleRespond(clr.id)} disabled={submitting}>
                            {submitting ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />}
                            {submitting ? 'Submitting…' : 'Submit Response'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        className="btn-primary text-xs mt-2"
                        onClick={() => { setResponding(clr.id); setResponseText('') }}
                      >
                        <MessageSquare size={12} /> Respond to Clarification
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
