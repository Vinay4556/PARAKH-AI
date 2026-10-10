import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell, ChevronRight, AlertTriangle, XCircle, CheckCircle,
  Info, Clock, RefreshCw, Shield
} from 'lucide-react'
import { getAuditTrail } from '../services/api.js'
import { PageLoader } from '../components/LoadingSkeleton.jsx'
import { useToast } from '../components/Toast.jsx'

const SEVERITY_CONFIG = {
  error: {
    icon: XCircle,
    iconColor: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200',
    badge: 'bg-red-100 text-red-700',
    dot: 'bg-red-500',
    label: 'High Risk',
  },
  warning: {
    icon: AlertTriangle,
    iconColor: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    badge: 'bg-amber-100 text-amber-700',
    dot: 'bg-amber-500',
    label: 'Warning',
  },
  info: {
    icon: Info,
    iconColor: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    badge: 'bg-blue-100 text-blue-700',
    dot: 'bg-blue-400',
    label: 'Info',
  },
  success: {
    icon: CheckCircle,
    iconColor: 'text-green-600',
    bg: 'bg-green-50',
    border: 'border-green-200',
    badge: 'bg-green-100 text-green-700',
    dot: 'bg-green-500',
    label: 'Verified',
  },
}

const BIDDER_NAMES = {
  'BID-SUB-001': 'ABC Technologies Pvt Ltd',
  'BID-SUB-002': 'Bharat Industrial Systems Pvt Ltd',
  'BID-SUB-003': 'Nova Engineering Solutions Pvt Ltd',
}

function timeAgo(ts) {
  if (!ts) return ''
  const diff = (Date.now() - new Date(ts).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function Alerts() {
  const navigate = useNavigate()
  const { addToast: showToast } = useToast()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [dismissed, setDismissed] = useState(new Set())

  useEffect(() => {
    getAuditTrail({ tender_id: 'GEM-DEMO-2026-001' })
      .then((res) => {
        // Show only warning/error/important entries as alerts
        const alertable = (res.data || []).filter((e) =>
          ['error', 'warning'].includes(e.severity) ||
          e.action?.toLowerCase().includes('completed') ||
          e.action?.toLowerCase().includes('critical')
        )
        setEntries(alertable)
      })
      .catch(() => showToast('Failed to load alerts', 'error'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = entries.filter((e) => {
    if (dismissed.has(e.id)) return false
    if (filter === 'all') return true
    if (filter === 'high') return e.severity === 'error'
    if (filter === 'warning') return e.severity === 'warning'
    if (filter === 'info') return e.severity === 'info' || e.severity === 'success'
    return true
  })

  const errorCount = entries.filter((e) => e.severity === 'error' && !dismissed.has(e.id)).length
  const warnCount = entries.filter((e) => e.severity === 'warning' && !dismissed.has(e.id)).length

  if (loading) return <PageLoader />

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate('/')}>Dashboard</span>
        <ChevronRight size={12} />
        <span className="text-slate-700 font-medium">Alerts</span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="page-title">Alerts & Notifications</h1>
            {(errorCount + warnCount) > 0 && (
              <span className="w-5 h-5 bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {errorCount + warnCount}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">Compliance alerts for GEM-DEMO-2026-001</p>
        </div>
        <button className="btn-secondary text-xs py-2" onClick={() => window.location.reload()}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'High Risk', count: errorCount, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', icon: XCircle },
          { label: 'Warnings', count: warnCount, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', icon: AlertTriangle },
          { label: 'Total Active', count: filtered.length, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', icon: Bell },
        ].map(({ label, count, color, bg, border, icon: Icon }) => (
          <div key={label} className={`${bg} border ${border} rounded-xl p-3 text-center`}>
            <Icon size={16} className={`mx-auto mb-1 ${color}`} />
            <p className={`text-xl font-bold ${color}`}>{count}</p>
            <p className="text-[10px] text-gray-500">{label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {[
          { key: 'all', label: 'All' },
          { key: 'high', label: '🔴 High Risk' },
          { key: 'warning', label: '⚠ Warning' },
          { key: 'info', label: 'ℹ Info' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${filter === key ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Alert list */}
      {filtered.length === 0 ? (
        <div className="card p-10 text-center">
          <CheckCircle size={32} className="mx-auto mb-2 text-green-400" />
          <p className="text-sm font-semibold text-slate-700">No active alerts</p>
          <p className="text-xs text-gray-400 mt-1">All compliance checks are up to date.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((entry) => {
            const cfg = SEVERITY_CONFIG[entry.severity] || SEVERITY_CONFIG.info
            const Icon = cfg.icon
            const bidderName = entry.bidder_id ? (BIDDER_NAMES[entry.bidder_id] || entry.bidder_id) : null

            return (
              <div
                key={entry.id}
                className={`card p-4 border-l-4 ${entry.severity === 'error' ? 'border-l-red-500' : entry.severity === 'warning' ? 'border-l-amber-500' : entry.severity === 'success' ? 'border-l-green-500' : 'border-l-blue-500'} cursor-pointer hover:shadow-md transition-shadow`}
                onClick={() => entry.bidder_id && navigate(`/bidders/${entry.bidder_id}/compliance`)}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 ${cfg.bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                    <Icon size={15} className={cfg.iconColor} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-700 leading-snug">{entry.action}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${cfg.badge}`}>
                        {cfg.label}
                      </span>
                    </div>
                    {bidderName && (
                      <p className="text-xs font-medium text-blue-700 mt-0.5">{bidderName}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{entry.detail}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="flex items-center gap-1 text-[10px] text-gray-400">
                        <Clock size={10} />
                        {new Date(entry.timestamp).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="text-[10px] text-gray-400">· {entry.actor}</span>
                    </div>
                  </div>
                </div>

                {entry.bidder_id && (
                  <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-[10px] text-gray-400 font-mono">{entry.bidder_id}</span>
                    <span className="text-xs text-blue-600 font-semibold flex items-center gap-1">
                      View Compliance <ChevronRight size={11} />
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Dismiss all */}
      {filtered.length > 0 && (
        <div className="flex justify-end">
          <button
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            onClick={() => setDismissed(new Set(entries.map((e) => e.id)))}
          >
            Dismiss all alerts
          </button>
        </div>
      )}

      {/* Footer note */}
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <Shield size={11} className="text-blue-400" />
        All alerts are generated from the Veritas AI compliance engine and audit trail. Clicking an alert navigates to the relevant compliance view.
      </div>
    </div>
  )
}
