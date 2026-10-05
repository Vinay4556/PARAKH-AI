import React, { useEffect, useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Search, FileText, Clock, CheckCircle, Bell, ChevronRight,
  Filter, MapPin, Building2, IndianRupee, Calendar, X,
  Shield, BookOpen, ChevronDown
} from 'lucide-react'
import api from '../../services/api.js'
import { PageLoader } from '../../components/LoadingSkeleton.jsx'
import { useLanguage } from '../../context/LanguageContext.jsx'

// ── Value bands for filter ────────────────────────────────────
const VALUE_BANDS = [
  { label: 'Any value',        min: 0,           max: Infinity },
  { label: 'Up to ₹10 Lakh',  min: 0,           max: 1_000_000 },
  { label: '₹10L – ₹1 Cr',   min: 1_000_000,   max: 10_000_000 },
  { label: '₹1 Cr – ₹10 Cr', min: 10_000_000,  max: 100_000_000 },
  { label: 'Above ₹10 Cr',    min: 100_000_000, max: Infinity },
]

const STATUS_OPTIONS = [
  { value: '',        label: 'All statuses' },
  { value: 'active',  label: 'Active / Open' },
  { value: 'closed',  label: 'Closed' },
  { value: 'awarded', label: 'Awarded' },
]

// Parse estimated_value_display back to a number for filtering
function parseValue(display) {
  if (!display) return 0
  const n = parseFloat(display.replace(/[^0-9.]/g, ''))
  if (isNaN(n)) return 0
  const upper = display.toUpperCase()
  if (upper.includes('CR')) return n * 10_000_000
  if (upper.includes('L'))  return n * 100_000
  if (upper.includes('K'))  return n * 1_000
  return n
}

// Tender result card
function TenderCard({ tender, onClick }) {
  const statusColor = {
    active:  'bg-green-50 text-green-700 border-green-200',
    OPEN:    'bg-green-50 text-green-700 border-green-200',
    closed:  'bg-gray-100 text-gray-500 border-gray-200',
    awarded: 'bg-blue-50 text-blue-700 border-blue-200',
  }
  const color = statusColor[tender.status] || 'bg-gray-100 text-gray-500 border-gray-200'

  return (
    <article
      className="card p-4 hover:shadow-md transition-all cursor-pointer hover:border-blue-200 border border-transparent"
      onClick={onClick}
      aria-label={`Tender ${tender.id}: ${tender.title}`}
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      role="button"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* ID + status row */}
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded font-mono">
              {tender.id}
            </span>
            <span className={`text-[10px] px-2 py-0.5 border font-semibold rounded uppercase ${color}`}>
              {tender.status}
            </span>
            {tender.current_stage && (
              <span className="text-[10px] text-gray-400 hidden sm:inline">
                · {tender.current_stage}
              </span>
            )}
          </div>

          {/* Title */}
          <h3 className="text-sm font-semibold text-slate-800 leading-snug line-clamp-2">
            {tender.title}
          </h3>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
            <span className="flex items-center gap-1 text-[11px] text-gray-500">
              <Building2 size={10} aria-hidden="true" />
              {tender.department}
            </span>
            {tender.location && (
              <span className="flex items-center gap-1 text-[11px] text-gray-500">
                <MapPin size={10} aria-hidden="true" />
                {tender.location}
              </span>
            )}
            {tender.estimated_value_display && (
              <span className="flex items-center gap-1 text-[11px] text-gray-500">
                <IndianRupee size={10} aria-hidden="true" />
                {tender.estimated_value_display}
              </span>
            )}
            {tender.submission_deadline && (
              <span className="flex items-center gap-1 text-[11px] text-gray-500">
                <Calendar size={10} aria-hidden="true" />
                Due {new Date(tender.submission_deadline).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
            )}
          </div>
        </div>
        <ChevronRight size={14} className="text-gray-300 flex-shrink-0 mt-1" aria-hidden="true" />
      </div>
    </article>
  )
}

export default function PublicDashboard() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { t } = useLanguage()

  // Stats + tender list
  const [stats,    setStats]    = useState(null)
  const [tenders,  setTenders]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [showAll,  setShowAll]  = useState(false)

  // Filter state
  const [search,     setSearch]     = useState(searchParams.get('search') || '')
  const [deptFilter, setDeptFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [valueBand,  setValueBand]  = useState(0)          // index into VALUE_BANDS
  const [showFilters, setShowFilters] = useState(false)

  // Fetch dashboard stats + all public tenders in parallel
  useEffect(() => {
    Promise.all([
      api.get('/public/dashboard'),
      api.get('/public/tenders'),
    ])
      .then(([statsRes, tendersRes]) => {
        setStats(statsRes.data)
        setTenders(tendersRes.data || [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // Derived lists
  const departments = useMemo(
    () => Array.from(new Set(tenders.map((t) => t.department).filter(Boolean))).sort(),
    [tenders]
  )

  const filtered = useMemo(() => {
    const q    = search.trim().toLowerCase()
    const band = VALUE_BANDS[valueBand]
    return tenders.filter((t) => {
      if (q && !t.title?.toLowerCase().includes(q) &&
               !t.id?.toLowerCase().includes(q) &&
               !t.department?.toLowerCase().includes(q)) return false
      if (deptFilter   && t.department !== deptFilter)                  return false
      if (statusFilter && t.status !== statusFilter)                     return false
      if (valueBand > 0) {
        const v = parseValue(t.estimated_value_display)
        if (v < band.min || v >= band.max) return false
      }
      return true
    })
  }, [tenders, search, deptFilter, statusFilter, valueBand])

  const activeFilterCount = [deptFilter, statusFilter, valueBand > 0 ? 'band' : ''].filter(Boolean).length

  const clearFilters = () => {
    setSearch('')
    setDeptFilter('')
    setStatusFilter('')
    setValueBand(0)
  }

  // Sync search param into URL so "Browse Tenders" from other pages carries the query
  useEffect(() => {
    if (search) setSearchParams({ search }, { replace: true })
    else setSearchParams({}, { replace: true })
  }, [search])

  const displayedTenders = showAll ? filtered : filtered.slice(0, 6)

  if (loading) return <PageLoader />

  return (
    <div className="p-6 space-y-5 max-w-4xl">

      {/* ── Page header ───────────────────────────────────── */}
      <header>
        <h1 className="page-title">{t('public_procurement_portal')}</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {t('gem_transparent_procurement')}
        </p>
      </header>

      {/* ── Search + filter bar ───────────────────────────── */}
      <section aria-label="Search and filter tenders">
        <div className="card p-4">
          {/* Main search row */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <label htmlFor="tender-search" className="sr-only">
                Search tenders by ID, title, or department
              </label>
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <input
                id="tender-search"
                type="search"
                placeholder="Search by tender ID, title or department…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                aria-label="Search tenders"
              />
            </div>
            <button
              className="btn-primary text-sm"
              onClick={() => navigate(`/public/tenders${search ? `?search=${encodeURIComponent(search)}` : ''}`)}
              aria-label="Search tenders"
            >
              {t('search')}
            </button>
            <button
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border rounded-xl transition-colors ${
                showFilters || activeFilterCount > 0
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
              onClick={() => setShowFilters((v) => !v)}
              aria-expanded={showFilters}
              aria-controls="advanced-filters"
              aria-label={`${showFilters ? 'Hide' : 'Show'} filters${activeFilterCount > 0 ? ` (${activeFilterCount} active)` : ''}`}
            >
              <Filter size={13} aria-hidden="true" />
              {t('filter')}
              {activeFilterCount > 0 && (
                <span className="ml-0.5 w-4 h-4 rounded-full bg-white text-blue-700 text-[10px] font-bold flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
              <ChevronDown
                size={12}
                className={`transition-transform ${showFilters ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
          </div>

          {/* Advanced filter row */}
          {showFilters && (
            <div
              id="advanced-filters"
              className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-3 gap-3"
              role="group"
              aria-label="Advanced filters"
            >
              {/* Department */}
              <div>
                <label htmlFor="dept-filter" className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Department
                </label>
                <select
                  id="dept-filter"
                  value={deptFilter}
                  onChange={(e) => setDeptFilter(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label="Filter by department"
                >
                  <option value="">All departments</option>
                  {departments.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              {/* Status */}
              <div>
                <label htmlFor="status-filter" className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Status
                </label>
                <select
                  id="status-filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label="Filter by status"
                >
                  {STATUS_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              {/* Value band */}
              <div>
                <label htmlFor="value-filter" className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Value Band
                </label>
                <select
                  id="value-filter"
                  value={valueBand}
                  onChange={(e) => setValueBand(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label="Filter by value band"
                >
                  {VALUE_BANDS.map(({ label }, i) => (
                    <option key={i} value={i}>{label}</option>
                  ))}
                </select>
              </div>

              {/* Clear */}
              {activeFilterCount > 0 && (
                <div className="sm:col-span-3 flex justify-end">
                  <button
                    className="flex items-center gap-1 text-xs text-red-600 font-semibold hover:underline"
                    onClick={clearFilters}
                    aria-label="Clear all filters"
                  >
                    <X size={12} aria-hidden="true" /> Clear filters
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Stats ─────────────────────────────────────────── */}
      <section aria-label="Procurement statistics">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: t('active_tenders'),    value: stats?.active_tenders || 0,            icon: FileText,     color: 'text-blue-700',   bg: 'bg-blue-50'   },
            { label: t('under_evaluation'),  value: stats?.tenders_under_evaluation || 0,  icon: Clock,        color: 'text-amber-700',  bg: 'bg-amber-50'  },
            { label: t('awards_published'),  value: stats?.completed_awards || 0,           icon: CheckCircle,  color: 'text-green-700',  bg: 'bg-green-50'  },
            { label: t('public_notices'),    value: stats?.public_notices || 0,             icon: Bell,         color: 'text-purple-700', bg: 'bg-purple-50' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="stat-card" aria-label={`${label}: ${value}`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
                </div>
                <div className={`p-2 rounded-lg ${bg}`} aria-hidden="true">
                  <Icon className={color} size={16} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Tender list ───────────────────────────────────── */}
      <section aria-label="Tender results" aria-live="polite">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700">
            {search || activeFilterCount > 0 ? 'Search Results' : t('recent_tenders')}
            <span className="text-gray-400 font-normal ml-2 text-xs">
              {filtered.length} tender{filtered.length !== 1 ? 's' : ''}
            </span>
          </h2>
          {filtered.length > 6 && (
            <button
              className="text-xs text-blue-600 font-semibold hover:underline"
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll ? 'Show less' : `View all ${filtered.length} →`}
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="card p-10 text-center text-gray-400">
            <FileText size={28} className="mx-auto mb-2 opacity-30" aria-hidden="true" />
            <p className="text-sm">No tenders match your search.</p>
            {(search || activeFilterCount > 0) && (
              <button className="btn-secondary mt-3 text-xs" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3" role="list" aria-label="Tender search results">
            {displayedTenders.map((tender) => (
              <div key={tender.id} role="listitem">
                <TenderCard
                  tender={tender}
                  onClick={() => navigate(`/public/tenders/${tender.id}`)}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Quick access cards ────────────────────────────── */}
      <section aria-label="Quick access">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Quick Access</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            {
              label: t('procurement_timeline'),
              desc:  'View the evaluation progress for any tender',
              path:  '/public/tenders/GEM-DEMO-2026-001/timeline',
              color: 'bg-blue-50 border-blue-200',
              icon:  Clock,
              iconClass: 'text-blue-600',
            },
            {
              label: t('trust_centre'),
              desc:  'How decisions work, AI limits, and your rights',
              path:  '/public/trust-centre',
              color: 'bg-green-50 border-green-200',
              icon:  Shield,
              iconClass: 'text-green-700',
            },
            {
              label: t('procurement_glossary'),
              desc:  'Plain-language definitions for procurement terms',
              path:  '/public/glossary',
              color: 'bg-indigo-50 border-indigo-200',
              icon:  BookOpen,
              iconClass: 'text-indigo-700',
            },
          ].map(({ label, desc, path, color, icon: Icon, iconClass }) => (
            <button
              key={label}
              className={`border rounded-xl p-4 text-left hover:shadow-sm transition-all ${color}`}
              onClick={() => navigate(path)}
              aria-label={`${label}: ${desc}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon size={14} className={iconClass} aria-hidden="true" />
                <p className="text-sm font-semibold text-slate-700">{label}</p>
              </div>
              <p className="text-xs text-gray-500 leading-snug">{desc}</p>
            </button>
          ))}
        </div>
      </section>

    </div>
  )
}
