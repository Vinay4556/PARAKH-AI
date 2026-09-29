import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileText, CheckCircle, AlertTriangle, Clock, ArrowRight,
  TrendingUp, Bell, Package, MessageSquare, RefreshCw
} from 'lucide-react'
import api from '../../services/api.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { PageLoader } from '../../components/LoadingSkeleton.jsx'
import { useLanguage } from '../../context/LanguageContext.jsx'

export default function BidderDashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { t } = useLanguage()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const bidderId = user?.organization_id || 'BID-001'

  useEffect(() => {
    api.get(`/bidder/dashboard?bidder_id=${bidderId}`)
      .then((res) => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [bidderId])

  if (loading) return <PageLoader />
  if (!data) return <div className="p-6 text-red-500">Failed to load dashboard.</div>

  const { stats, bidder, readiness_summary, clarifications_required } = data
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening'

  const readinessColor = stats.bid_readiness >= 85 ? 'text-green-600' : stats.bid_readiness >= 70 ? 'text-amber-600' : 'text-red-600'
  const readinessBg = stats.bid_readiness >= 85 ? 'bg-green-50 border-green-200' : stats.bid_readiness >= 70 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">{greeting},</p>
          <h1 className="text-xl font-bold text-slate-800">{user?.name || 'Bidder'}</h1>
          <p className="text-sm text-blue-700 font-medium mt-0.5">{bidder?.name}</p>
        </div>
        <button className="btn-primary text-sm" onClick={() => navigate('/bidder/tenders')}>
          Browse Tenders <ArrowRight size={14} />
        </button>
      </div>

      {/* Bid Readiness Card */}
      <div className={`rounded-2xl border-2 p-5 ${readinessBg}`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">{t('ai_bid_readiness')}</p>
            <div className="flex items-end gap-2">
              <span className={`text-4xl font-bold ${readinessColor}`}>{stats.bid_readiness}%</span>
              <span className={`text-sm font-semibold ${readinessColor} mb-1`}>
                {readiness_summary?.status?.replace('_', ' ')}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">For GEM-DEMO-2026-001</p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-white/70 rounded-xl p-2.5">
              <p className="text-lg font-bold text-red-600">{readiness_summary?.critical_issues || 0}</p>
              <p className="text-[9px] text-gray-500">{t('critical_issues')}</p>
            </div>
            <div className="bg-white/70 rounded-xl p-2.5">
              <p className="text-lg font-bold text-amber-600">{readiness_summary?.warnings || 0}</p>
              <p className="text-[9px] text-gray-500">{t('warnings')}</p>
            </div>
            <div className="bg-white/70 rounded-xl p-2.5">
              <p className="text-lg font-bold text-gray-500">{readiness_summary?.missing_mandatory || 0}</p>
              <p className="text-[9px] text-gray-500">{t('missing')}</p>
            </div>
          </div>
        </div>
        <button
          className="mt-3 text-xs font-semibold text-blue-700 hover:underline flex items-center gap-1"
          onClick={() => navigate('/bidder/readiness')}
        >
          View Issues & Fix <ArrowRight size={11} />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: t('active_applications'), value: stats.active_applications, icon: Package, color: 'text-blue-700', bg: 'bg-blue-50' },
          { label: t('submitted_bids'), value: stats.submitted_bids, icon: CheckCircle, color: 'text-green-700', bg: 'bg-green-50' },
          { label: t('clarifications_pending'), value: stats.clarifications_pending, icon: MessageSquare, color: 'text-amber-700', bg: 'bg-amber-50' },
          { label: t('available_tenders'), value: data.available_tenders, icon: FileText, color: 'text-purple-700', bg: 'bg-purple-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="stat-card">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-500">{label}</p>
                <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
              </div>
              <div className={`p-2 rounded-lg ${bg}`}>
                <Icon className={color} size={16} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Clarifications Required */}
      {clarifications_required?.length > 0 && (
        <div className="card p-5 border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <AlertTriangle size={15} className="text-amber-500" />
              {t('action_required')}
            </h2>
            <button className="text-xs text-blue-600 font-semibold hover:underline" onClick={() => navigate('/bidder/clarifications')}>
              {t('view_all')} →
            </button>
          </div>
          {clarifications_required.map((clr) => (
            <div key={clr.id} className="flex items-start gap-3 p-3 bg-amber-50 rounded-xl mb-2">
              <AlertTriangle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-700">{clr.subject}</p>
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{clr.message}</p>
                <p className="text-[10px] text-amber-600 mt-1 font-semibold">{t('pending_response')}</p>
              </div>
              <button
                className="btn-primary text-xs py-1.5 flex-shrink-0"
                onClick={() => navigate('/bidder/clarifications')}
              >
                {t('respond')}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { label: 'Browse Tenders', desc: 'Discover active procurement tenders', icon: FileText, path: '/bidder/tenders', color: 'bg-blue-50 border-blue-200 hover:bg-blue-100' },
          { label: 'My Bids', desc: 'Track your submitted bids', icon: Package, path: '/bidder/bids', color: 'bg-green-50 border-green-200 hover:bg-green-100' },
          { label: 'Document Center', desc: 'Manage compliance documents', icon: CheckCircle, path: '/bidder/documents', color: 'bg-purple-50 border-purple-200 hover:bg-purple-100' },
        ].map(({ label, desc, icon: Icon, path, color }) => (
          <div
            key={label}
            className={`border rounded-xl p-4 cursor-pointer transition-all ${color}`}
            onClick={() => navigate(path)}
          >
            <Icon size={20} className="text-slate-600 mb-2" />
            <p className="text-sm font-semibold text-slate-700">{label}</p>
            <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
