import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronRight, CheckCircle, AlertTriangle, XCircle, Info,
  Clock, User, Shield, Search, Filter, RefreshCw, Download
} from 'lucide-react'
import { getAuditTrail } from '../services/api.js'
import { PageLoader } from '../components/LoadingSkeleton.jsx'
import { useToast } from '../components/Toast.jsx'

const SEVERITY_CONFIG = {
  info: {
    icon: <Info size={14} className="text-blue-500" />,
    badge: 'bg-blue-50 text-blue-700 border border-blue-200',
    dot: 'bg-blue-400',
  },
  success: {
    icon: <CheckCircle size={14} className="text-green-500" />,
    badge: 'bg-green-50 text-green-700 border border-green-200',
    dot: 'bg-green-500',
  },
  warning: {
    icon: <AlertTriangle size={14} className="text-amber-500" />,
    badge: 'bg-amber-50 text-amber-700 border border-amber-200',
    dot: 'bg-amber-500',
  },
  error: {
    icon: <XCircle size={14} className="text-red-500" />,
    badge: 'bg-red-50 text-red-700 border border-red-200',
    dot: 'bg-red-500',
  },
}

const ACTOR_ICON = {
  'System': <Shield size={12} className="text-blue-600" />,
  'AI Engine': <Shield size={12} className="text-purple-600" />,
  'Officer': <User size={12} className="text-slate-600" />,
}

export default function AuditTrail() {
  const navigate = useNavigate()
  const { addToast: showToast } = useToast()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterSeverity, setFilterSeverity] = useState('all')
  const [filterBidder, setFilterBidder] = useState('all')

  const fetchAudit = () => {
    setLoading(true)
    getAuditTrail({ tender_id: 'GEM-DEMO-2026-001' })
      .then((res) => setEntries(res.data || []))
      .catch(() => showToast('Failed to load audit trail', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchAudit() }, [])

  const filtered = entries.filter((e) => {
    const matchSearch = !search || e.action?.toLowerCase().includes(search.toLowerCase()) ||
      e.entity?.toLowerCase().includes(search.toLowerCase()) ||
      e.actor?.toLowerCase().includes(search.toLowerCase())
    const matchSeverity = filterSeverity === 'all' || e.severity === filterSeverity
    const matchBidder = filterBidder === 'all' || e.bidder_id === filterBidder
    return matchSearch && matchSeverity && matchBidder
  })

  const uniqueBidders = [...new Set(entries.filter((e) => e.bidder_id).map((e) => e.bidder_id))]

  if (loading) return <PageLoader />

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate('/')}>Dashboard</span>
        <ChevronRight size={12} />
        <span className="text-slate-700 font-medium">Audit Trail</span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Audit Trail</h1>
          <p className="text-sm text-gray-500 mt-0.5">Complete activity log for GEM-DEMO-2026-001</p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn-secondary text-xs py-2"
            onClick={fetchAudit}
          >
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Events', value: entries.length, color: 'text-slate-700' },
          { label: 'Info', value: entries.filter((e) => e.severity === 'info').length, color: 'text-blue-600' },
          { label: 'Warnings', value: entries.filter((e) => e.severity === 'warning').length, color: 'text-amber-600' },
          { label: 'Errors', value: entries.filter((e) => e.severity === 'error').length, color: 'text-red-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="stat-card text-center">
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="flex-1 min-w-48 relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search events…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50"
            />
          </div>

          {/* Severity Filter */}
          <div className="flex items-center gap-1.5">
            <Filter size={13} className="text-gray-400" />
            <div className="flex gap-1">
              {['all', 'info', 'success', 'warning', 'error'].map((s) => (
                <button
                  key={s}
                  onClick={() => setFilterSeverity(s)}
                  className={`text-xs px-2.5 py-1.5 rounded-full font-medium transition-colors ${filterSeverity === s ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Bidder Filter */}
          {uniqueBidders.length > 0 && (
            <select
              value={filterBidder}
              onChange={(e) => setFilterBidder(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-2 bg-gray-50 text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Bidders</option>
              {uniqueBidders.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          )}

          <span className="text-xs text-gray-400 ml-auto">
            {filtered.length} of {entries.length} events
          </span>
        </div>
      </div>

      {/* Timeline */}
      <div className="card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Clock size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No events match your filters.</p>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-14 top-0 bottom-0 w-px bg-gray-100" />
            <div className="divide-y divide-gray-50">
              {filtered.map((entry, idx) => {
                const cfg = SEVERITY_CONFIG[entry.severity] || SEVERITY_CONFIG.info
                return (
                  <div key={entry.id || idx} className="flex items-start gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
                    {/* Time */}
                    <div className="w-10 flex-shrink-0 text-right">
                      <span className="text-[10px] font-mono text-gray-400 leading-none">
                        {entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </span>
                    </div>

                    {/* Dot */}
                    <div className="relative flex-shrink-0 mt-1.5">
                      <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot} z-10 relative`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5">{cfg.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-slate-700 leading-snug">{entry.action}</p>
                          <span className={`status-badge text-[10px] flex-shrink-0 ${cfg.badge}`}>
                            {entry.severity}
                          </span>
                        </div>
                        {entry.entity && (
                          <p className="text-xs text-gray-400 mt-0.5">{entry.entity}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5">
                          <div className="flex items-center gap-1 text-[10px] text-gray-400">
                            {ACTOR_ICON[entry.actor] || <User size={10} className="text-gray-400" />}
                            <span>{entry.actor || 'System'}</span>
                          </div>
                          {entry.bidder_id && (
                            <span className="text-[10px] text-blue-500 font-mono">{entry.bidder_id}</span>
                          )}
                          {entry.timestamp && (
                            <span className="text-[10px] text-gray-400">
                              {new Date(entry.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
        <span className="font-medium text-slate-600">Legend:</span>
        {Object.entries(SEVERITY_CONFIG).map(([key, cfg]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
            <span className="capitalize">{key}</span>
          </div>
        ))}
        <span className="ml-auto flex items-center gap-1">
          <Clock size={11} /> All times in IST
        </span>
      </div>
    </div>
  )
}
