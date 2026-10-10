import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Calendar, Building2, IndianRupee, FileText,
  ChevronRight, ArrowRight, Filter, MapPin, MessageSquare,
  RefreshCw, CheckCircle, AlertTriangle, Send, ChevronDown, ChevronUp
} from 'lucide-react'
import api, { getTender, getPreBid, submitPreBidQuestion, acknowledgeCorrigendum } from '../../services/api.js'
import { PageLoader } from '../../components/LoadingSkeleton.jsx'
import { useToast } from '../../components/Toast.jsx'
import { useAuth } from '../../context/AuthContext.jsx'

export default function BidderTenders() {
  const navigate = useNavigate()
  const { addToast } = useToast()
  const { user } = useAuth()
  const bidderId = user?.organization_id || 'BID-SUB-001'
  const [tenders, setTenders] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(null) // tender id currently expanded
  const [detail, setDetail] = useState({}) // { [tenderId]: { corrigenda, prebid, loading } }
  const [newQuestion, setNewQuestion] = useState('')
  const [askingQuestion, setAskingQuestion] = useState(false)
  const [acknowledging, setAcknowledging] = useState(null)

  useEffect(() => {
    api.get('/bidder/tenders')
      .then((res) => setTenders(res.data || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const toggleExpand = (tenderId) => {
    if (expanded === tenderId) { setExpanded(null); return }
    setExpanded(tenderId)
    if (!detail[tenderId]) {
      setDetail((p) => ({ ...p, [tenderId]: { loading: true } }))
      Promise.all([getTender(tenderId), getPreBid(tenderId)])
        .then(([tRes, pRes]) => {
          setDetail((p) => ({
            ...p,
            [tenderId]: {
              loading: false,
              corrigenda: tRes.data?.corrigenda || [],
              prebid: pRes.data,
            },
          }))
        })
        .catch(() => {
          addToast('Failed to load pre-bid & corrigendum details', 'error')
          setDetail((p) => ({ ...p, [tenderId]: { loading: false, corrigenda: [], prebid: null } }))
        })
    }
  }

  const handleAcknowledge = async (tenderId, corrigendumNumber) => {
    setAcknowledging(`${tenderId}-${corrigendumNumber}`)
    try {
      await acknowledgeCorrigendum(tenderId, corrigendumNumber)
      addToast(`Corrigendum #${corrigendumNumber} acknowledged`, 'success')
      setDetail((p) => ({
        ...p,
        [tenderId]: {
          ...p[tenderId],
          corrigenda: (p[tenderId]?.corrigenda || []).map((c) =>
            c.number === corrigendumNumber
              ? { ...c, acknowledged_by: [...(c.acknowledged_by || []), bidderId] }
              : c
          ),
        },
      }))
    } catch {
      addToast('Failed to acknowledge corrigendum', 'error')
    } finally {
      setAcknowledging(null)
    }
  }

  const handleAskQuestion = async (tenderId) => {
    if (!newQuestion.trim()) { addToast('Enter a question first', 'warning'); return }
    setAskingQuestion(true)
    try {
      const res = await submitPreBidQuestion(tenderId, { question: newQuestion, bidder_id: bidderId })
      addToast('Question submitted to the procurement officer', 'success')
      setNewQuestion('')
      setDetail((p) => ({
        ...p,
        [tenderId]: {
          ...p[tenderId],
          prebid: {
            ...p[tenderId]?.prebid,
            questions: [...(p[tenderId]?.prebid?.questions || []), res.data.question],
          },
        },
      }))
    } catch {
      addToast('Failed to submit question', 'error')
    } finally {
      setAskingQuestion(false)
    }
  }

  const filtered = tenders.filter((t) =>
    !search || t.title?.toLowerCase().includes(search.toLowerCase()) ||
    t.id?.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <PageLoader />

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate('/bidder/dashboard')}>Dashboard</span>
        <ChevronRight size={12} />
        <span className="text-slate-700 font-medium">Tenders</span>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Available Tenders</h1>
          <p className="text-sm text-gray-500 mt-0.5">{filtered.length} tenders available</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search tenders by title or ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="card p-10 text-center text-gray-400">
          <FileText size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No tenders found.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((tender) => (
            <div key={tender.id} className="card p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{tender.id}</span>
                    <span className={`status-badge text-[10px] ${['active', 'open'].includes(String(tender.status).toLowerCase()) ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
                      {tender.status?.toUpperCase()}
                    </span>
                  </div>
                  <h2 className="text-base font-semibold text-slate-800 leading-snug">{tender.title}</h2>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Building2 size={11} className="flex-shrink-0" />
                      <span className="truncate">{tender.department}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <IndianRupee size={11} className="flex-shrink-0" />
                      <span>{tender.estimated_value_display}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Calendar size={11} className="flex-shrink-0" />
                      <span>Due {new Date(tender.submission_deadline).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <MapPin size={11} className="flex-shrink-0" />
                      <span>{tender.location}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100">
                    <span className="text-xs text-gray-400">{tender.requirement_count} Requirements</span>
                    <span className="text-xs text-gray-400">·</span>
                    <span className="text-xs text-gray-400">{tender.bidder_count} Bids Received</span>
                    <span className="text-xs text-gray-400">·</span>
                    <span className="text-xs text-gray-400">{tender.category}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                <button
                  className="btn-secondary text-xs py-2"
                  onClick={() => navigate('/bidder/readiness')}
                >
                  Check Eligibility
                </button>
                <button
                  className="btn-primary text-xs py-2"
                  onClick={() => navigate(`/bidder/submit-bid?tender=${encodeURIComponent(tender.id)}`)}
                >
                  Start Bid <ArrowRight size={12} />
                </button>
                <button
                  className="text-xs py-2 px-3 text-blue-600 hover:underline flex items-center gap-1 ml-auto"
                  onClick={() => toggleExpand(tender.id)}
                >
                  <MessageSquare size={12} /> Pre-Bid Q&amp;A &amp; Corrigenda
                  {expanded === tender.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              </div>

              {expanded === tender.id && (
                <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
                  {detail[tender.id]?.loading ? (
                    <p className="text-xs text-gray-400 flex items-center gap-2"><RefreshCw size={12} className="animate-spin" /> Loading…</p>
                  ) : (
                    <>
                      {/* Corrigenda */}
                      <div>
                        <p className="text-[10px] font-semibold uppercase text-gray-400 mb-2">Corrigenda</p>
                        {(detail[tender.id]?.corrigenda || []).length === 0 ? (
                          <p className="text-xs text-gray-400">No corrigenda issued for this tender yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {detail[tender.id].corrigenda.map((c) => {
                              const acked = (c.acknowledged_by || []).includes(bidderId)
                              return (
                                <div key={c.number} className="p-2.5 bg-amber-50 border border-amber-100 rounded-lg">
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <p className="text-xs font-semibold text-amber-800">Corrigendum #{c.number}</p>
                                      <p className="text-xs text-amber-700 mt-0.5">{c.description}</p>
                                      <p className="text-[10px] text-gray-400 mt-1">{new Date(c.issued_at).toLocaleString('en-IN')}</p>
                                    </div>
                                    {acked ? (
                                      <span className="text-[10px] text-green-700 font-semibold flex items-center gap-1 flex-shrink-0">
                                        <CheckCircle size={11} /> Acknowledged
                                      </span>
                                    ) : (
                                      <button
                                        className="text-[10px] px-2 py-1 bg-amber-600 text-white font-semibold hover:bg-amber-700 flex-shrink-0"
                                        style={{ borderRadius: '2px' }}
                                        onClick={() => handleAcknowledge(tender.id, c.number)}
                                        disabled={acknowledging === `${tender.id}-${c.number}`}
                                      >
                                        {acknowledging === `${tender.id}-${c.number}` ? '…' : 'Acknowledge'}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>

                      {/* Pre-Bid Q&A */}
                      <div>
                        <p className="text-[10px] font-semibold uppercase text-gray-400 mb-2">Pre-Bid Questions &amp; Answers</p>
                        {(detail[tender.id]?.prebid?.questions || []).length === 0 ? (
                          <p className="text-xs text-gray-400 mb-2">No questions submitted yet.</p>
                        ) : (
                          <div className="space-y-2 mb-2">
                            {detail[tender.id].prebid.questions.map((q) => (
                              <div key={q.id} className="p-2.5 bg-gray-50 border border-gray-200 rounded-lg">
                                <p className="text-xs font-medium text-slate-700">Q: {q.question}</p>
                                {q.answer ? (
                                  <p className="text-xs text-green-700 mt-1">A: {q.answer}</p>
                                ) : (
                                  <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1"><AlertTriangle size={10} /> Awaiting officer response</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <input
                            type="text" value={newQuestion} onChange={(e) => setNewQuestion(e.target.value)}
                            placeholder="Ask a pre-bid clarification question…"
                            className="flex-1 px-3 py-2 text-xs border border-gray-300 focus:outline-none"
                            style={{ borderRadius: '2px' }}
                          />
                          <button
                            className="px-3 py-2 bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 flex items-center gap-1"
                            style={{ borderRadius: '2px' }}
                            onClick={() => handleAskQuestion(tender.id)}
                            disabled={askingQuestion}
                          >
                            {askingQuestion ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
