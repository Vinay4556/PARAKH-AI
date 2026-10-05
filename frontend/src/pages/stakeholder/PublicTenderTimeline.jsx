import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  CheckCircle, Clock, Circle, AlertTriangle, ChevronRight,
  MessageSquare, Calendar, Building2, FileText, Search
} from 'lucide-react'
import api from '../../services/api.js'
import { PageLoader } from '../../components/LoadingSkeleton.jsx'

const STAGE_ICON = {
  COMPLETED:   <CheckCircle size={18} className="text-green-600" />,
  IN_PROGRESS: <Clock size={18} className="text-blue-600" />,
  PENDING:     <Circle size={18} className="text-gray-300" />,
}

export default function PublicTenderTimeline() {
  const { tenderId: paramTenderId } = useParams()
  const navigate = useNavigate()

  const [tenders, setTenders]       = useState([])
  const [selectedId, setSelectedId] = useState(paramTenderId || '')
  const [tender, setTender]         = useState(null)
  const [timeline, setTimeline]     = useState(null)
  const [loading, setLoading]       = useState(false)
  const [loadingList, setLoadingList] = useState(true)
  const [search, setSearch]         = useState('')

  // Load all public tenders for the selector
  useEffect(() => {
    api.get('/public/tenders')
      .then((res) => setTenders(res.data || []))
      .catch(console.error)
      .finally(() => setLoadingList(false))
  }, [])

  // When a tender is selected, load its timeline
  useEffect(() => {
    if (!selectedId) { setTender(null); setTimeline(null); return }
    setLoading(true)
    Promise.all([
      api.get(`/public/tenders/${selectedId}`),
      api.get(`/public/tenders/${selectedId}/timeline`),
    ])
      .then(([tRes, tlRes]) => {
        setTender(tRes.data)
        setTimeline(tlRes.data)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [selectedId])

  const filteredTenders = tenders.filter((t) =>
    !search ||
    t.id.toLowerCase().includes(search.toLowerCase()) ||
    t.title.toLowerCase().includes(search.toLowerCase()) ||
    (t.department || '').toLowerCase().includes(search.toLowerCase())
  )

  const hasDelay = timeline?.timeline?.some((s) => s.delayed)

  return (
    <div className="p-6 space-y-5 max-w-2xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate('/public/dashboard')}>Public Portal</span>
        <ChevronRight size={12} />
        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>Procurement Timeline</span>
      </div>

      <div>
        <h1 className="page-title flex items-center gap-2">
          <Clock size={20} className="text-blue-600" /> Procurement Timeline
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Select a tender to view its 11-stage procurement timeline
        </p>
      </div>

      {/* ── Tender Selector ─────────────────────────────────── */}
      <div className="card p-5">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-3">
          Select Tender to View Timeline
        </label>

        {/* Search box */}
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by tender ID, title or department…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
            style={{ borderRadius: '2px' }}
          />
        </div>

        {loadingList ? (
          <p className="text-xs text-gray-400 text-center py-4">Loading tenders…</p>
        ) : filteredTenders.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">No tenders found.</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {filteredTenders.map((t) => (
              <div
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={`flex items-start gap-3 p-3 cursor-pointer transition-all border-2 ${
                  selectedId === t.id
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-100 hover:border-blue-200 hover:bg-gray-50'
                }`}
                style={{ borderRadius: '2px' }}
              >
                <FileText size={15} className={selectedId === t.id ? 'text-blue-600 flex-shrink-0 mt-0.5' : 'text-gray-400 flex-shrink-0 mt-0.5'} />
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
                    <span className="flex items-center gap-1"><Calendar size={10} />Deadline: {t.submission_deadline ? new Date(t.submission_deadline).toLocaleDateString('en-IN') : '—'}</span>
                  </div>
                </div>
                {selectedId === t.id && (
                  <CheckCircle size={16} className="text-blue-600 flex-shrink-0 mt-1" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── No tender selected state ─────────────────────────── */}
      {!selectedId && (
        <div className="card p-10 text-center text-gray-400">
          <Clock size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-semibold">Select a tender above to view its procurement timeline</p>
        </div>
      )}

      {/* ── Loading timeline ─────────────────────────────────── */}
      {selectedId && loading && <PageLoader />}

      {/* ── Timeline content ─────────────────────────────────── */}
      {selectedId && !loading && tender && timeline && (
        <>
          {/* Tender Header */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5" style={{ borderRadius: '2px' }}>{tender.id}</span>
              <span className="text-[10px] px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 font-semibold" style={{ borderRadius: '2px' }}>
                {(tender.status || 'ACTIVE').toUpperCase()}
              </span>
            </div>
            <h2 className="text-base font-bold text-slate-800 leading-snug">{tender.title}</h2>
            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 flex-wrap">
              <span className="flex items-center gap-1"><Building2 size={11} />{tender.department}</span>
              <span className="flex items-center gap-1">
                <Calendar size={11} />Deadline: {tender.submission_deadline ? new Date(tender.submission_deadline).toLocaleDateString('en-IN') : '—'}
              </span>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-500">
                Current Stage: <span className="font-semibold text-blue-700">{timeline.current_stage}</span>
              </p>
            </div>
          </div>

          {/* Delay warning */}
          {hasDelay && (
            <div className="bg-amber-50 border border-amber-200 p-3 flex items-start gap-2" style={{ borderRadius: '2px' }}>
              <AlertTriangle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                One or more evaluation milestones appear delayed. The procurement team is reviewing the timeline.
              </p>
            </div>
          )}

          {/* Timeline */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-5">Procurement Timeline</h2>
            <div className="relative">
              {timeline.timeline?.map((item, idx) => {
                const isLast = idx === timeline.timeline.length - 1
                return (
                  <div key={idx} className="flex gap-4 relative">
                    {!isLast && (
                      <div className="absolute left-[17px] top-7 bottom-0 w-0.5 bg-gray-100" />
                    )}
                    <div
                      className="flex-shrink-0 w-9 h-9 rounded-full border-2 flex items-center justify-center bg-white relative z-10"
                      style={{ borderColor: item.status === 'COMPLETED' ? '#16a34a' : item.status === 'IN_PROGRESS' ? '#2563eb' : '#e5e7eb' }}
                    >
                      {STAGE_ICON[item.status] || STAGE_ICON.PENDING}
                    </div>
                    <div className={`flex-1 ${isLast ? 'pb-0' : 'pb-6'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm font-semibold ${item.status === 'PENDING' ? 'text-gray-400' : 'text-slate-700'}`}>
                          {item.stage}
                        </p>
                        <div className="text-right flex-shrink-0">
                          <p className={`text-xs font-medium ${
                            item.status === 'COMPLETED' ? 'text-green-600' :
                            item.status === 'IN_PROGRESS' ? 'text-blue-600' : 'text-gray-400'
                          }`}>
                            {item.status === 'COMPLETED' ? '✓ Completed' :
                             item.status === 'IN_PROGRESS' ? '● In Progress' : '○ Pending'}
                          </p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{item.date}</p>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{item.public_note}</p>
                      {item.delayed && (
                        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-amber-600 font-semibold">
                          <AlertTriangle size={10} />
                          Delayed by {item.delay_days} day{item.delay_days > 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Feedback CTA */}
          <div className="p-4 bg-purple-50 border border-purple-100 flex items-center justify-between gap-3" style={{ borderRadius: '2px' }}>
            <div>
              <p className="text-sm font-semibold text-slate-700">Have a concern about this tender?</p>
              <p className="text-xs text-gray-500 mt-0.5">Submit structured feedback for the procurement team.</p>
            </div>
            <button
              className="btn-primary text-xs flex-shrink-0"
              onClick={() => navigate(`/public/tenders/${selectedId}/feedback`)}
            >
              <MessageSquare size={12} /> Submit Feedback
            </button>
          </div>
        </>
      )}
    </div>
  )
}
