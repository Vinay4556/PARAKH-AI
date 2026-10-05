import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Printer, FileDown, FileSpreadsheet, Sparkles, Eye,
  ChevronUp, ChevronDown, AlertTriangle, CheckCircle, Clock,
  XCircle, FileText, Users, Award, TrendingUp, Shield, RefreshCw,
  Filter, X, BarChart3, PieChart as PieChartIcon, AlertOctagon,
  FileWarning, CheckCircle2, ArrowUpDown, Activity, Upload,
  MessageSquare, ChevronRight, Tag, Layers,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'
import { getOfficerSummary, getOfficerSummaryReportUrl, downloadFile } from '../../services/api.js'
import api from '../../services/api.js'
import { RiskBadge } from '../../components/StatusBadge.jsx'
import { PageLoader } from '../../components/LoadingSkeleton.jsx'
import { useToast } from '../../components/Toast.jsx'

const DEFAULT_TENDER = 'GEM-DEMO-2026-001'

const STATUS_STYLE = {
  COMPLIANT: 'bg-green-50 text-green-700 border-green-200',
  UNDER_REVIEW: 'bg-amber-50 text-amber-700 border-amber-200',
  NON_COMPLIANT: 'bg-red-50 text-red-700 border-red-200',
  PENDING: 'bg-gray-100 text-gray-500 border-gray-200',
}

const STATUS_ICON = {
  COMPLIANT: CheckCircle,
  UNDER_REVIEW: AlertTriangle,
  NON_COMPLIANT: XCircle,
  PENDING: Clock,
}

const COMPLIANCE_COLORS = {
  COMPLIANT: '#146c2e',
  UNDER_REVIEW: '#d97706',
  NON_COMPLIANT: '#a3180a',
  PENDING: '#6b7a8d',
}

const DOC_STATUS_COLORS = {
  VERIFIED: '#146c2e',
  REVIEW: '#d97706',
  NON_COMPLIANT: '#a3180a',
  MISSING: '#6b7a8d',
}

const CATEGORY_COLORS = ['#003380', '#146c2e', '#d97706', '#7c3aed', '#a3180a', '#0891b2']

function scoreColor(score) {
  if (score >= 85) return 'text-green-600'
  if (score >= 70) return 'text-amber-600'
  return 'text-red-600'
}

function formatDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return '—' }
}

function formatDateTime(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return '—' }
}

function downloadBlob(content, mime, filename) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 1000)
}

function downloadExcel(tenderId) {
  return downloadFile(
    `/officer/tenders/${tenderId}/summary/excel`,
    `ParakhAI_Bidder_Summary_${tenderId}_${new Date().toISOString().slice(0, 10)}.xlsx`,
  )
}

// ── Skeleton components ──────────────────────────────────────────
function SkeletonKpiCards() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="stat-card animate-pulse">
          <div className="w-7 h-7 mx-auto mb-1.5 bg-gray-200" style={{ borderRadius: '2px' }} />
          <div className="h-6 w-12 mx-auto bg-gray-200 rounded" />
          <div className="h-3 w-16 mx-auto bg-gray-100 rounded mt-1" />
        </div>
      ))}
    </div>
  )
}

function SkeletonCharts() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="card p-5 animate-pulse">
          <div className="h-4 w-40 bg-gray-200 rounded mb-4" />
          <div className="h-48 bg-gray-100 rounded" />
        </div>
      ))}
    </div>
  )
}

function SkeletonTable() {
  return (
    <div className="card overflow-hidden animate-pulse">
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="h-4 w-32 bg-gray-200 rounded" />
      </div>
      <div className="p-4 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-4">
            <div className="h-4 w-8 bg-gray-100 rounded" />
            <div className="h-4 flex-1 bg-gray-100 rounded" />
            <div className="h-4 w-16 bg-gray-100 rounded" />
            <div className="h-4 w-20 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Custom tooltip for charts ────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div className="bg-white border border-gray-200 shadow-lg px-3 py-2 text-xs" style={{ borderRadius: '2px' }}>
      {label && <p className="font-semibold text-slate-700 mb-1">{label}</p>}
      {payload.map((entry, i) => (
        <p key={i} className="text-gray-600">
          <span style={{ color: entry.color || entry.fill }} className="font-semibold">
            {entry.name}:
          </span>{' '}
          {entry.value}{entry.name.includes('Score') ? '%' : ''}
        </p>
      ))}
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────
export default function OfficerSummary() {
  const navigate = useNavigate()
  const { addToast: showToast } = useToast()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [docFilter, setDocFilter] = useState('ALL')
  const [scoreFilter, setScoreFilter] = useState('ALL')
  const [sortKey, setSortKey] = useState('overall_score')
  const [sortDir, setSortDir] = useState('desc')
  const [aiSummary, setAiSummary] = useState(null)
  const [generatingAI, setGeneratingAI] = useState(false)
  const [reportBusy, setReportBusy] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')   // 'overview' | 'activity'
  const [activitySource, setActivitySource] = useState('all') // filter by source type
  const [activitySearch, setActivitySearch] = useState('')

  // Tender selector — starts with default, switches when user picks from dropdown
  const [tenderId, setTenderId] = useState(DEFAULT_TENDER)
  const [allTenders, setAllTenders] = useState([{ id: DEFAULT_TENDER, title: DEFAULT_TENDER }])

  const fetchData = useCallback(() => {
    setLoading(true)
    setError(null)
    getOfficerSummary(tenderId)
      .then((res) => {
        setData(res.data)
        setLastUpdated(new Date())
        // Populate tender dropdown from response
        if (res.data.all_tenders?.length) {
          setAllTenders(res.data.all_tenders)
        }
      })
      .catch((e) => {
        setError(e.message || 'Failed to load summary')
        showToast(e.message || 'Failed to load summary', 'error')
      })
      .finally(() => setLoading(false))
  }, [tenderId])

  useEffect(() => { fetchData() }, [fetchData])

  const bidders = data?.bidders || []
  const stats = data?.statistics
  const tender = data?.tender

  // ── Derived chart data ─────────────────────────────────────────
  const scoreDistribution = useMemo(() => {
    return bidders.map((b) => ({
      name: b.name.length > 20 ? b.name.slice(0, 20) + '…' : b.name,
      fullName: b.name,
      score: b.overall_score,
      id: b.id,
    })).sort((a, b) => b.score - a.score)
  }, [bidders])

  const complianceData = useMemo(() => {
    if (!stats) return []
    return [
      { name: 'Compliant', value: stats.compliant, key: 'COMPLIANT' },
      { name: 'Under Review', value: stats.under_review, key: 'UNDER_REVIEW' },
      { name: 'Non-Compliant', value: stats.non_compliant, key: 'NON_COMPLIANT' },
      { name: 'Pending', value: stats.pending, key: 'PENDING' },
    ].filter((d) => d.value > 0)
  }, [stats])

  const docStatusData = useMemo(() => {
    const totals = { VERIFIED: 0, REVIEW: 0, NON_COMPLIANT: 0, MISSING: 0 }
    bidders.forEach((b) => {
      const sc = b.status_counts || {}
      totals.VERIFIED += sc.VERIFIED || 0
      totals.REVIEW += sc.REVIEW || 0
      totals.NON_COMPLIANT += sc.NON_COMPLIANT || 0
      totals.MISSING += sc.MISSING || 0
    })
    return [
      { name: 'Verified', value: totals.VERIFIED, key: 'VERIFIED' },
      { name: 'Review', value: totals.REVIEW, key: 'REVIEW' },
      { name: 'Non-Compliant', value: totals.NON_COMPLIANT, key: 'NON_COMPLIANT' },
      { name: 'Missing', value: totals.MISSING, key: 'MISSING' },
    ]
  }, [bidders])

  const scoreComparison = useMemo(() => {
    const categories = new Set()
    bidders.forEach((b) => {
      Object.keys(b.category_scores || {}).forEach((c) => categories.add(c))
    })
    const catList = [...categories]
    return bidders.map((b) => {
      const row = { name: b.name.length > 15 ? b.name.slice(0, 15) + '…' : b.name, fullName: b.name, id: b.id }
      catList.forEach((cat) => {
        row[cat] = (b.category_scores || {})[cat] ?? 0
      })
      return row
    })
  }, [bidders])

  const comparisonCategories = useMemo(() => {
    const cats = new Set()
    bidders.forEach((b) => Object.keys(b.category_scores || {}).forEach((c) => cats.add(c)))
    return [...cats]
  }, [bidders])

  // ── Filtering + Sorting ────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...bidders]
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((b) =>
        (b.name || '').toLowerCase().includes(q) ||
        (b.id || '').toLowerCase().includes(q) ||
        (b.gstin || '').toLowerCase().includes(q)
      )
    }
    if (statusFilter !== 'ALL') {
      list = list.filter((b) => b.compliance_status === statusFilter)
    }
    if (docFilter === 'COMPLETE') list = list.filter((b) => b.missing_items.length === 0 && b.review_items.length === 0)
    else if (docFilter === 'MISSING') list = list.filter((b) => b.missing_items.length > 0)
    else if (docFilter === 'PENDING') list = list.filter((b) => b.review_items.length > 0)
    else if (docFilter === 'REJECTED') list = list.filter((b) => (b.status_counts?.NON_COMPLIANT || 0) > 0)

    if (scoreFilter !== 'ALL') {
      const [min, max] = scoreFilter.split('-').map(Number)
      list = list.filter((b) => b.overall_score >= min && b.overall_score < max)
    }

    list.sort((a, b) => {
      let va, vb
      switch (sortKey) {
        case 'name': va = (a.name || '').toLowerCase(); vb = (b.name || '').toLowerCase(); break
        case 'documents': va = a.document_count; vb = b.document_count; break
        case 'missing': va = a.missing_items.length; vb = b.missing_items.length; break
        case 'compliance': va = a.compliance_pct; vb = b.compliance_pct; break
        case 'risk': va = a.risk_level; vb = b.risk_level; break
        case 'overall_score':
        default: va = a.overall_score; vb = b.overall_score; break
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [bidders, search, statusFilter, docFilter, scoreFilter, sortKey, sortDir])

  // ── Missing documents (filtered) ───────────────────────────────
  const missingDocs = useMemo(() => {
    const items = []
    filtered.forEach((b) => {
      b.missing_items.forEach((item) => items.push({ bidder: b, item, type: 'Missing' }))
      b.review_items.forEach((item) => items.push({ bidder: b, item, type: 'Pending Verification' }))
    })
    return items
  }, [filtered])

  // ── Issues (filtered) ──────────────────────────────────────────
  const allIssues = useMemo(() => {
    const items = []
    filtered.forEach((b) => {
      b.issues.forEach((issue) => items.push({ bidder: b, issue }))
      b.non_compliant_items.forEach((item) => items.push({
        bidder: b,
        issue: { type: 'Non-Compliant', detail: item.title, severity: 'HIGH' }
      }))
    })
    return items
  }, [filtered])

  // ── KPI card click handler ─────────────────────────────────────
  const handleKpiClick = (key) => {
    if (key === 'ALL') {
      setStatusFilter('ALL')
      setDocFilter('ALL')
    } else if (key === 'MISSING') {
      setDocFilter('MISSING')
      setStatusFilter('ALL')
    } else {
      setStatusFilter(key)
      setDocFilter('ALL')
    }
  }

  // ── Chart click handlers ───────────────────────────────────────
  const handleComplianceClick = (entry) => {
    const key = entry?.key || entry?.name?.toUpperCase().replace(/ /g, '_')
    if (key === 'COMPLIANT' || key === 'UNDER_REVIEW' || key === 'NON_COMPLIANT' || key === 'PENDING') {
      setStatusFilter(key === statusFilter ? 'ALL' : key)
    }
  }

  const handleDocStatusClick = (entry) => {
    const key = entry?.key
    if (key === 'MISSING') setDocFilter(docFilter === 'MISSING' ? 'ALL' : 'MISSING')
    else if (key === 'REVIEW') setDocFilter(docFilter === 'PENDING' ? 'ALL' : 'PENDING')
    else if (key === 'NON_COMPLIANT') setDocFilter(docFilter === 'REJECTED' ? 'ALL' : 'REJECTED')
  }

  // ── Sort handler ───────────────────────────────────────────────
  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  const SortIcon = ({ col }) => {
    if (sortKey !== col) return <ArrowUpDown size={11} className="text-gray-300" />
    return sortDir === 'asc'
      ? <ChevronUp size={12} className="text-blue-600" />
      : <ChevronDown size={12} className="text-blue-600" />
  }

  // ── Activity timeline data ─────────────────────────────────────
  const activityEvents = useMemo(() => {
    const raw = data?.activity || []
    let list = [...raw]
    if (activitySource !== 'all') list = list.filter(e => e.source === activitySource)
    if (activitySearch.trim()) {
      const q = activitySearch.toLowerCase()
      list = list.filter(e =>
        (e.action || '').toLowerCase().includes(q) ||
        (e.detail || '').toLowerCase().includes(q) ||
        (e.actor || '').toLowerCase().includes(q) ||
        (e.bidder_id || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [data, activitySource, activitySearch])

  const activitySources = useMemo(() => {
    const sources = new Set((data?.activity || []).map(e => e.source))
    return ['all', ...sources]
  }, [data])

  // ── Reset ──────────────────────────────────────────────────────
  const resetDashboard = () => {
    setSearch('')
    setStatusFilter('ALL')
    setDocFilter('ALL')
    setScoreFilter('ALL')
    setSortKey('overall_score')
    setSortDir('desc')
  }

  const hasActiveFilters = search || statusFilter !== 'ALL' || docFilter !== 'ALL' || scoreFilter !== 'ALL'

  // ── Print / PDF ───────────────────────────────────────────────
  const openReport = async (message) => {
    if (reportBusy) return
    setReportBusy(true)
    try {
      const res = await api.get(getOfficerSummaryReportUrl(tenderId), { responseType: 'text' })
      let html = typeof res.data === 'string' ? res.data : String(res.data ?? '')
      if (!html.trim()) throw new Error('Report is empty')

      if (aiSummary && !html.includes('Executive Summary')) {
        const summaryHtml = `<div class="section-title">Executive Summary</div>
        <div style="background:#f8f9fc;border:1px solid #c8d0db;padding:14px 16px;font-size:12px;line-height:1.7;color:#3d4a5c">${aiSummary.replace(/\n/g, '<br>')}</div>`
        html = html.replace('<div class="section-title">Key Observations</div>', summaryHtml + '\n  <div class="section-title">Key Observations</div>')
      }

      const old = document.getElementById('parakh-report-frame')
      if (old) old.remove()
      const iframe = document.createElement('iframe')
      iframe.id = 'parakh-report-frame'
      iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
      document.body.appendChild(iframe)

      const doc = iframe.contentWindow.document
      doc.open()
      doc.write(html)
      doc.close()

      setTimeout(() => {
        try {
          iframe.contentWindow.focus()
          iframe.contentWindow.print()
          if (message) showToast(message, 'info')
        } catch (err) {
          showToast('Could not open print dialog: ' + err.message, 'error')
        }
      }, 500)
    } catch (e) {
      showToast(e.message || 'Failed to load report', 'error')
    } finally {
      setReportBusy(false)
    }
  }

  const handlePrint = () => openReport()
  const handleDownloadPDF = () => openReport('In the print dialog choose "Save as PDF" as the destination')

  const handleExportExcel = () => {
    if (!data) return
    downloadExcel(tenderId)
      .then(() => showToast('Excel report downloaded', 'success'))
      .catch(() => showToast('Excel download failed. Please try again.', 'error'))
  }

  // ── AI Executive Summary ─────────────────────────────────────
  const handleGenerateAI = () => {
    if (!stats || !bidders.length) {
      showToast('No data available to generate summary', 'error')
      return
    }
    setGeneratingAI(true)
    setTimeout(() => {
      try {
        const total = stats.total_bidders
        const compliant = stats.compliant
        const nonCompliant = stats.non_compliant
        const underReview = stats.under_review
        const pending = stats.pending
        const withMissing = stats.with_missing_documents
        const avg = stats.average_score
        const highest = stats.highest_score

        const allMissing = bidders.flatMap((b) =>
          b.missing_items.map((m) => ({ bidder: b.name, item: m.title, mandatory: m.mandatory }))
        )
        const mandatoryMissing = allMissing.filter((m) => m.mandatory)
        const recurringIssues = {}
        mandatoryMissing.forEach((m) => {
          recurringIssues[m.item] = (recurringIssues[m.item] || 0) + 1
        })
        const recurringStr = Object.entries(recurringIssues)
          .map(([item, count]) => `${item} (${count} bidder${count > 1 ? 's' : ''})`)
          .join(', ')

        const allIssuesList = bidders.flatMap((b) => b.issues.map((i) => ({ bidder: b.name, ...i })))
        const highSeverity = allIssuesList.filter((i) => i.severity === 'HIGH')

        const lines = []
        lines.push(`${total} bidders have been received.`)
        lines.push(`${compliant} bidders are fully compliant.`)
        lines.push(`${underReview} bidders require additional review.`)
        if (nonCompliant > 0) lines.push(`${nonCompliant} bidder${nonCompliant > 1 ? 's are' : ' is'} non-compliant.`)
        if (pending > 0) lines.push(`${pending} bidder${pending > 1 ? 's are' : ' is'} pending analysis.`)
        if (withMissing > 0) lines.push(`${withMissing} bidder${withMissing > 1 ? 's have' : ' has'} outstanding documentation.`)
        if (mandatoryMissing.length > 0) {
          lines.push(`Mandatory documents missing across ${mandatoryMissing.length} bidder(s).`)
          if (recurringStr) lines.push(`Most common missing items: ${recurringStr}.`)
        }
        if (highSeverity.length > 0) {
          lines.push(`High-severity issues flagged: ${highSeverity.length} (cross-document mismatches or non-compliant mandatory requirements).`)
        }
        lines.push(`Average overall score: ${avg}%. Highest score: ${highest}%.`)
        if (nonCompliant > 0) {
          const ncNames = bidders.filter((b) => b.compliance_status === 'NON_COMPLIANT').map((b) => b.name)
          lines.push(`Non-compliant bidders: ${ncNames.join(', ')}.`)
        }

        setAiSummary(lines.join('\n'))
      } catch (err) {
        showToast('Failed to generate summary: ' + err.message, 'error')
      } finally {
        setGeneratingAI(false)
      }
    }, 800)
  }

  // ── Loading / Error states ────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 space-y-5">
        <div className="animate-pulse">
          <div className="h-6 w-64 bg-gray-200 rounded mb-2" />
          <div className="h-3 w-48 bg-gray-100 rounded" />
        </div>
        <SkeletonKpiCards />
        <SkeletonCharts />
        <SkeletonTable />
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="p-6 flex items-center justify-center" style={{ minHeight: '400px' }}>
        <div className="text-center">
          <AlertOctagon size={40} className="text-red-400 mx-auto mb-3" />
          <p className="text-red-600 font-semibold mb-1">Unable to load bidder summary.</p>
          <p className="text-sm text-gray-500 mb-4">{error}</p>
          <button className="btn-primary text-sm" onClick={fetchData}>
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const statCards = [
    { label: 'Total Bidders', value: stats.total_bidders, icon: Users, color: 'text-blue-700', bg: 'bg-blue-50', key: 'ALL', border: 'border-blue-500' },
    { label: 'Fully Compliant', value: stats.compliant, icon: CheckCircle, color: 'text-green-700', bg: 'bg-green-50', key: 'COMPLIANT', border: 'border-green-500' },
    { label: 'Under Review', value: stats.under_review, icon: AlertTriangle, color: 'text-amber-700', bg: 'bg-amber-50', key: 'UNDER_REVIEW', border: 'border-amber-500' },
    { label: 'Non-Compliant', value: stats.non_compliant, icon: XCircle, color: 'text-red-700', bg: 'bg-red-50', key: 'NON_COMPLIANT', border: 'border-red-500' },
    { label: 'Missing Documents', value: stats.with_missing_documents, icon: FileWarning, color: 'text-orange-700', bg: 'bg-orange-50', key: 'MISSING', border: 'border-orange-500' },
    { label: 'Average Score', value: `${stats.average_score}%`, icon: TrendingUp, color: 'text-indigo-700', bg: 'bg-indigo-50', key: 'AVG', border: 'border-indigo-500' },
  ]

  const scoreRanges = [
    { key: 'ALL', label: 'All' },
    { key: '0-50', label: '0–50' },
    { key: '50-70', label: '50–70' },
    { key: '70-80', label: '70–80' },
    { key: '80-90', label: '80–90' },
    { key: '90-100', label: '90–100' },
  ]

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Shield size={20} className="text-blue-700" />
            Officer Summary
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Consolidated Bidder Evaluation, Compliance &amp; Activity
          </p>
        </div>
        <div className="flex gap-2 flex-wrap no-print">
          <button className="btn-secondary text-xs" onClick={fetchData} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button className="btn-primary text-xs" onClick={handlePrint} disabled={reportBusy}>
            <Printer size={13} /> Print Report
          </button>
          <button className="btn-secondary text-xs" onClick={handleDownloadPDF} disabled={reportBusy}>
            <FileDown size={13} /> Download PDF
          </button>
          <button className="btn-secondary text-xs" onClick={handleExportExcel}>
            <FileSpreadsheet size={13} /> Export Excel
          </button>
          <button className="btn-secondary text-xs" onClick={handleGenerateAI} disabled={generatingAI}>
            <Sparkles size={13} className={generatingAI ? 'animate-pulse' : ''} />
            {generatingAI ? 'Generating…' : 'Executive Summary'}
          </button>
        </div>
      </div>

      {/* ── Tender Selector ────────────────────────────────── */}
      <div className="card p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-xs font-bold text-slate-600 uppercase tracking-wide whitespace-nowrap">
            Select Tender
          </label>
          <div className="relative flex-1 min-w-[260px]">
            <select
              value={tenderId}
              onChange={e => {
                setTenderId(e.target.value)
                setActiveTab('overview')
                setActivitySearch('')
                setActivitySource('all')
              }}
              className="w-full pl-3 pr-8 py-2 text-sm border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
              style={{ borderRadius: '2px' }}
            >
              {allTenders.map(t => (
                <option key={t.id} value={t.id}>
                  {t.id} — {t.title?.length > 60 ? t.title.slice(0, 60) + '…' : t.title}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
          {tender && (
            <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
              <span className="flex items-center gap-1">
                <span className="font-medium text-slate-600">{tender.department}</span>
              </span>
              <span className="text-gray-300">|</span>
              <span>{tender.estimated_value_display || '—'}</span>
              <span className="text-gray-300">|</span>
              <span>Deadline: <strong className="text-slate-600">{formatDate(tender.submission_deadline)}</strong></span>
              <span
                className={`px-2 py-0.5 font-semibold text-[10px] ${
                  tender.status === 'OPEN' ? 'bg-green-50 text-green-700' :
                  tender.status === 'CLOSED' ? 'bg-gray-100 text-gray-600' :
                  'bg-amber-50 text-amber-700'
                }`}
                style={{ borderRadius: '2px' }}
              >
                {tender.status}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Tab Bar ────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-gray-200 no-print">
        {[
          { key: 'overview',  label: 'Overview & Bidders',  icon: Users },
          { key: 'activity',  label: `Activity Timeline (${data?.activity?.length || 0})`, icon: Activity },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold transition-colors border-b-2 ${
              activeTab === key
                ? 'border-blue-600 text-blue-700 bg-blue-50/50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
            style={{ borderRadius: '2px 2px 0 0' }}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════
          ACTIVITY TIMELINE TAB
      ══════════════════════════════════════════════════════ */}
      {activeTab === 'activity' && (
        <ActivityTimeline
          events={activityEvents}
          sources={activitySources}
          activeSource={activitySource}
          onSourceChange={setActivitySource}
          search={activitySearch}
          onSearch={setActivitySearch}
          navigate={navigate}
        />
      )}

      {/* ══════════════════════════════════════════════════════
          OVERVIEW TAB — everything that was there before
      ══════════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (<>

      {/* ── KPI Cards ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map((card) => {
          const Icon = card.icon
          const isActive = card.key === 'ALL' ? (statusFilter === 'ALL' && docFilter === 'ALL')
            : card.key === 'MISSING' ? docFilter === 'MISSING'
            : card.key === 'AVG' ? false
            : statusFilter === card.key
          return (
            <div
              key={card.label}
              className={`stat-card cursor-pointer transition-all duration-150 hover:shadow-md ${isActive ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
              style={{ borderLeft: `4px solid ${isActive ? '#003380' : 'var(--goi-navy)'}` }}
              onClick={() => handleKpiClick(card.key)}
              title={card.key === 'ALL' ? 'Show all bidders' : `Filter: ${card.label}`}
            >
              <div className={`w-7 h-7 mx-auto mb-1.5 flex items-center justify-center ${card.bg}`} style={{ borderRadius: '2px' }}>
                <Icon size={14} className={card.color} />
              </div>
              <p className={`text-xl font-bold text-center ${card.color}`}>{card.value}</p>
              <p className="text-[10px] text-gray-500 text-center mt-0.5">{card.label}</p>
            </div>
          )
        })}
      </div>

      {/* ── Active Filter Bar ──────────────────────────────── */}
      {hasActiveFilters && (
        <div className="card p-3 no-print">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-gray-500 flex items-center gap-1">
              <Filter size={12} /> ACTIVE FILTERS:
            </span>
            {statusFilter !== 'ALL' && (
              <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 border border-blue-200" style={{ borderRadius: '2px' }}>
                {statusFilter.replace(/_/g, ' ')}
                <button onClick={() => setStatusFilter('ALL')} className="hover:text-blue-900"><X size={11} /></button>
              </span>
            )}
            {docFilter !== 'ALL' && (
              <span className="inline-flex items-center gap-1 text-xs bg-orange-50 text-orange-700 px-2 py-0.5 border border-orange-200" style={{ borderRadius: '2px' }}>
                Docs: {docFilter}
                <button onClick={() => setDocFilter('ALL')} className="hover:text-orange-900"><X size={11} /></button>
              </span>
            )}
            {scoreFilter !== 'ALL' && (
              <span className="inline-flex items-center gap-1 text-xs bg-purple-50 text-purple-700 px-2 py-0.5 border border-purple-200" style={{ borderRadius: '2px' }}>
                Score: {scoreFilter}
                <button onClick={() => setScoreFilter('ALL')} className="hover:text-purple-900"><X size={11} /></button>
              </span>
            )}
            {search && (
              <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 border border-gray-200" style={{ borderRadius: '2px' }}>
                Search: "{search}"
                <button onClick={() => setSearch('')} className="hover:text-gray-900"><X size={11} /></button>
              </span>
            )}
            <button className="text-xs text-red-600 hover:text-red-800 font-semibold ml-auto flex items-center gap-1" onClick={resetDashboard}>
              <X size={12} /> Clear All
            </button>
          </div>
        </div>
      )}

      {/* ── Charts Row 1: Score Distribution + Compliance ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Score Distribution */}
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <BarChart3 size={14} className="text-blue-700" />
            Bidder Score Distribution
          </h2>
          {scoreDistribution.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No score data available.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, scoreDistribution.length * 36)}>
              <BarChart data={scoreDistribution} layout="vertical" margin={{ top: 0, right: 40, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="score" name="Score" radius={[0, 2, 2, 0]}>
                  {scoreDistribution.map((entry, i) => (
                    <Cell key={i} fill={entry.score >= 85 ? '#146c2e' : entry.score >= 70 ? '#d97706' : '#a3180a'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Compliance Overview */}
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <PieChartIcon size={14} className="text-blue-700" />
            Bidder Compliance Overview
          </h2>
          {complianceData.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No compliance data available.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={complianceData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                  dataKey="value"
                  onClick={handleComplianceClick}
                  className="cursor-pointer"
                >
                  {complianceData.map((entry, i) => (
                    <Cell key={i} fill={COMPLIANCE_COLORS[entry.key]} opacity={statusFilter === entry.key ? 1 : 0.7} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  verticalAlign="bottom"
                  iconType="circle"
                  iconSize={8}
                  formatter={(value, entry) => (
                    <span style={{ color: COMPLIANCE_COLORS[entry.payload.key], fontSize: 12 }}>{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
          <div className="flex justify-center gap-4 mt-2 flex-wrap">
            {complianceData.map((d) => (
              <button
                key={d.key}
                onClick={() => handleComplianceClick(d)}
                className="flex items-center gap-1.5 text-xs hover:underline"
                style={{ color: COMPLIANCE_COLORS[d.key] }}
              >
                <span className="w-2.5 h-2.5 inline-block" style={{ backgroundColor: COMPLIANCE_COLORS[d.key], borderRadius: '2px' }} />
                {d.name} ({d.value})
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Charts Row 2: Document Status + Score Comparison ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Document Status */}
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <FileText size={14} className="text-blue-700" />
            Document Submission Status
          </h2>
          {docStatusData.every((d) => d.value === 0) ? (
            <p className="text-sm text-gray-400 text-center py-8">No document data available.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={docStatusData} margin={{ top: 0, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="value" name="Documents" radius={[2, 2, 0, 0]} onClick={handleDocStatusClick} className="cursor-pointer">
                    {docStatusData.map((entry, i) => (
                      <Cell key={i} fill={DOC_STATUS_COLORS[entry.key]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 mt-2 flex-wrap">
                {docStatusData.map((d) => (
                  <button
                    key={d.key}
                    onClick={() => handleDocStatusClick(d)}
                    className="flex items-center gap-1.5 text-xs hover:underline"
                    style={{ color: DOC_STATUS_COLORS[d.key] }}
                  >
                    <span className="w-2.5 h-2.5 inline-block" style={{ backgroundColor: DOC_STATUS_COLORS[d.key], borderRadius: '2px' }} />
                    {d.name} ({d.value})
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Score Comparison by Category */}
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <BarChart3 size={14} className="text-blue-700" />
            Score Comparison by Category
          </h2>
          {comparisonCategories.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No category score data available.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={scoreComparison} margin={{ top: 0, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  {comparisonCategories.map((cat, i) => (
                    <Bar key={cat} dataKey={cat} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} radius={[2, 2, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </>
          )}
        </div>
      </div>

      {/* ── Bidder Comparison Table ─────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-sm font-semibold text-slate-700">
              Bidder Comparison
              <span className="text-xs text-gray-400 font-normal ml-2">
                {filtered.length} of {bidders.length} bidder{bidders.length !== 1 ? 's' : ''}
              </span>
            </h2>
          </div>
          {/* Search + Filters */}
          <div className="flex items-center gap-3 flex-wrap mt-3 no-print">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search bidder..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 focus:outline-none focus:border-blue-400"
                style={{ borderRadius: '2px' }}
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs px-2 py-2 border border-gray-200 focus:outline-none focus:border-blue-400 bg-white"
              style={{ borderRadius: '2px' }}
            >
              <option value="ALL">Status: All</option>
              <option value="COMPLIANT">Compliant</option>
              <option value="UNDER_REVIEW">Partially Compliant</option>
              <option value="NON_COMPLIANT">Non-Compliant</option>
              <option value="PENDING">Under Review</option>
            </select>
            <select
              value={docFilter}
              onChange={(e) => setDocFilter(e.target.value)}
              className="text-xs px-2 py-2 border border-gray-200 focus:outline-none focus:border-blue-400 bg-white"
              style={{ borderRadius: '2px' }}
            >
              <option value="ALL">Docs: All</option>
              <option value="COMPLETE">Complete</option>
              <option value="MISSING">Missing</option>
              <option value="PENDING">Pending</option>
              <option value="REJECTED">Rejected</option>
            </select>
            <select
              value={scoreFilter}
              onChange={(e) => setScoreFilter(e.target.value)}
              className="text-xs px-2 py-2 border border-gray-200 focus:outline-none focus:border-blue-400 bg-white"
              style={{ borderRadius: '2px' }}
            >
              {scoreRanges.map((r) => (
                <option key={r.key} value={r.key}>Score: {r.label}</option>
              ))}
            </select>
            {hasActiveFilters && (
              <button className="text-xs text-red-600 hover:text-red-800 font-semibold flex items-center gap-1" onClick={resetDashboard}>
                <X size={12} /> Reset
              </button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="gov-table">
            <thead>
              <tr>
                <th className="w-10">S.No</th>
                <th className="cursor-pointer select-none" onClick={() => handleSort('name')}>
                  <span className="inline-flex items-center gap-1">Bidder <SortIcon col="name" /></span>
                </th>
                <th>ID</th>
                <th className="cursor-pointer select-none" onClick={() => handleSort('documents')}>
                  <span className="inline-flex items-center gap-1">Docs <SortIcon col="documents" /></span>
                </th>
                <th className="cursor-pointer select-none" onClick={() => handleSort('missing')}>
                  <span className="inline-flex items-center gap-1">Missing <SortIcon col="missing" /></span>
                </th>
                <th className="cursor-pointer select-none" onClick={() => handleSort('compliance')}>
                  <span className="inline-flex items-center gap-1">Compliance <SortIcon col="compliance" /></span>
                </th>
                <th>Score Breakdown</th>
                <th className="cursor-pointer select-none" onClick={() => handleSort('overall_score')}>
                  <span className="inline-flex items-center gap-1">Overall <SortIcon col="overall_score" /></span>
                </th>
                <th className="cursor-pointer select-none" onClick={() => handleSort('risk')}>
                  <span className="inline-flex items-center gap-1">Risk <SortIcon col="risk" /></span>
                </th>
                <th>Status</th>
                <th>Key Issue</th>
                <th className="no-print">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b, idx) => {
                const sc = b.status_counts
                const StatusIcon = STATUS_ICON[b.compliance_status] || Clock
                const missingStr = b.missing_items.length
                  ? b.missing_items.map((m) => m.title).join(', ')
                  : 'None'
                const remarks = []
                if (b.review_items.length) remarks.push(`${b.review_items.length} item(s) pending verification`)
                if (b.non_compliant_items.length) remarks.push(`${b.non_compliant_items.length} non-compliant`)
                if (b.issues.length) remarks.push(`${b.issues.length} issue(s) flagged`)
                if (b.officer_decision) remarks.push(`Officer: ${b.officer_decision}`)
                if (!remarks.length) remarks.push(b.missing_items.length ? 'Missing documents' : 'All requirements satisfied')

                return (
                  <tr key={b.id}>
                    <td className="text-center text-gray-400">{idx + 1}</td>
                    <td>
                      <div className="font-semibold text-slate-800 text-sm">{b.name}</div>
                      {b.gstin && <div className="text-[10px] text-gray-400 font-mono">{b.gstin}</div>}
                    </td>
                    <td className="text-xs font-mono text-gray-500">{b.id}</td>
                    <td className="text-center text-sm" title={`${b.document_count} documents submitted out of ${b.total_requirements} required documents.`}>
                      {b.document_count}/{b.total_requirements}
                    </td>
                    <td className="text-xs text-gray-600 max-w-[180px]">
                      {b.missing_items.length > 0 ? (
                        <span className="text-red-600">{missingStr}</span>
                      ) : (
                        <span className="text-green-600">None</span>
                      )}
                    </td>
                    <td>
                      <span className={`status-badge ${STATUS_STYLE[b.compliance_status] || 'bg-gray-100 text-gray-500'}`}>
                        <StatusIcon size={11} />
                        {b.compliance_status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="text-[11px] text-gray-500" title={Object.entries(b.category_scores || {}).map(([c, p]) => `${c}: ${p}%`).join(', ') || 'Not evaluated'}>
                      {Object.entries(b.category_scores || {}).map(([cat, pct]) => (
                        <span key={cat} className="mr-2">
                          {cat.slice(0, 4)}: <span className={scoreColor(pct)}>{pct}%</span>
                        </span>
                      ))}
                      {!Object.keys(b.category_scores || {}).length && 'Not evaluated'}
                    </td>
                    <td className={`text-center font-bold text-lg ${scoreColor(b.overall_score)}`} title={Object.entries(b.category_scores || {}).map(([c, p]) => `${c}: ${p}%`).join(', ')}>
                      {b.overall_score}%
                    </td>
                    <td><RiskBadge risk={b.risk_level} /></td>
                    <td className="text-xs">
                      {b.officer_decision ? (
                        <span className={`font-bold ${b.officer_decision === 'QUALIFY' ? 'text-green-600' : b.officer_decision === 'DISQUALIFY' ? 'text-red-600' : 'text-amber-600'}`}>
                          {b.officer_decision}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="text-xs text-gray-600 max-w-[200px]">
                      {remarks.join('; ')}
                    </td>
                    <td className="no-print">
                      <button
                        className="btn-secondary text-[11px] py-1 px-2"
                        onClick={() => navigate(`/bidders/${b.id}`)}
                      >
                        <Eye size={11} /> View
                      </button>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={12} className="text-center py-8 text-gray-400 text-sm">
                    {bidders.length === 0 ? 'No bidders have been submitted yet.' : 'No bidders match the current filter/search.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Missing / Pending Documents Panel ───────────────── */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
          <FileWarning size={14} className="text-amber-600" />
          Missing / Pending Documents
          {missingDocs.length > 0 && (
            <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 border border-amber-200" style={{ borderRadius: '2px' }}>
              {missingDocs.length} item{missingDocs.length !== 1 ? 's' : ''}
            </span>
          )}
        </h2>
        {missingDocs.length === 0 ? (
          <p className="text-sm text-green-600 flex items-center gap-1">
            <CheckCircle2 size={14} /> No missing documents identified.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="gov-table">
              <thead>
                <tr>
                  <th>Bidder</th>
                  <th>Document</th>
                  <th>Status</th>
                  <th>Reason</th>
                  <th className="no-print">Action</th>
                </tr>
              </thead>
              <tbody>
                {missingDocs.map((doc, i) => (
                  <tr key={`${doc.bidder.id}-${doc.item.requirement_id}-${i}`}>
                    <td>
                      <div className="font-semibold text-slate-800 text-sm">{doc.bidder.name}</div>
                      <div className="text-[10px] text-gray-400 font-mono">{doc.bidder.id}</div>
                    </td>
                    <td className="text-sm">
                      {doc.item.title}
                      {doc.item.mandatory && (
                        <span className="text-[9px] bg-red-50 text-red-600 px-1 ml-1.5 font-semibold" style={{ borderRadius: '2px' }}>MANDATORY</span>
                      )}
                    </td>
                    <td>
                      <span className={`status-badge ${doc.type === 'Missing' ? 'status-noncompliant' : 'status-review'}`}>
                        {doc.type === 'Missing' ? <XCircle size={11} /> : <Clock size={11} />}
                        {doc.type}
                      </span>
                    </td>
                    <td className="text-xs text-gray-600 max-w-[250px]">
                      {doc.item.concern || doc.item.found_value || '—'}
                    </td>
                    <td className="no-print">
                      <button
                        className="btn-secondary text-[11px] py-1 px-2"
                        onClick={() => navigate(`/bidders/${doc.bidder.id}`)}
                      >
                        <Eye size={11} /> View Bidder
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Issues & Alerts Panel ────────────────────────────── */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
          <AlertOctagon size={14} className="text-red-600" />
          Attention Required
          {allIssues.length > 0 && (
            <span className="text-xs bg-red-50 text-red-700 px-2 py-0.5 border border-red-200" style={{ borderRadius: '2px' }}>
              {allIssues.length} issue{allIssues.length !== 1 ? 's' : ''}
            </span>
          )}
        </h2>
        {allIssues.length === 0 ? (
          <p className="text-sm text-green-600 flex items-center gap-1">
            <CheckCircle2 size={14} /> No issues currently require attention.
          </p>
        ) : (
          <div className="space-y-2">
            {allIssues.map((item, i) => (
              <div
                key={`${item.bidder.id}-${i}`}
                className={`border-l-4 pl-3 py-2 pr-3 ${
                  item.issue.severity === 'HIGH'
                    ? 'border-red-500 bg-red-50'
                    : item.issue.severity === 'WARNING'
                    ? 'border-amber-500 bg-amber-50'
                    : 'border-blue-500 bg-blue-50'
                }`}
                style={{ borderRadius: '0 2px 2px 0' }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-sm font-semibold text-slate-800">{item.bidder.name}</span>
                    <span className="text-[10px] text-gray-400 font-mono ml-2">{item.bidder.id}</span>
                    <p className="text-xs text-gray-600 mt-0.5">
                      <span className="font-semibold">{item.issue.type}:</span> {item.issue.detail}
                    </p>
                  </div>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 flex-shrink-0 ${
                    item.issue.severity === 'HIGH' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                  }`} style={{ borderRadius: '2px' }}>
                    {item.issue.severity}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── AI Executive Summary ────────────────────────────── */}
      {aiSummary && (
        <div className="card p-4 no-print">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} className="text-purple-600" />
            <h2 className="text-sm font-semibold text-slate-700">Executive Summary</h2>
            <span className="text-[10px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full font-semibold">AI-GENERATED</span>
          </div>
          <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed">{aiSummary}</p>
        </div>
      )}

      {/* ── Report Actions ───────────────────────────────────── */}
      <div className="card p-4 no-print">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs text-gray-400">
              Report generated: {formatDateTime(data.generated_at)}
              {lastUpdated && <span className="ml-2">· Refreshed: {formatDateTime(lastUpdated.toISOString())}</span>}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button className="btn-primary text-xs" onClick={handlePrint} disabled={reportBusy}>
              <Printer size={13} /> Print Report
            </button>
            <button className="btn-secondary text-xs" onClick={handleDownloadPDF} disabled={reportBusy}>
              <FileDown size={13} /> Download PDF
            </button>
            <button className="btn-secondary text-xs" onClick={handleExportExcel}>
              <FileSpreadsheet size={13} /> Export Excel
            </button>
            <button className="btn-secondary text-xs" onClick={handleGenerateAI} disabled={generatingAI}>
              <Sparkles size={13} className={generatingAI ? 'animate-pulse' : ''} />
              {generatingAI ? 'Generating…' : 'Executive Summary'}
            </button>
          </div>
        </div>
      </div>

      </>)}  {/* end overview tab */}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// ACTIVITY TIMELINE COMPONENT
// ─────────────────────────────────────────────────────────────────

const SOURCE_META = {
  audit:                { label: 'Officer Action',        color: 'bg-blue-100 text-blue-700 border-blue-200',   dot: 'bg-blue-500'   },
  document:             { label: 'Document Upload',       color: 'bg-purple-100 text-purple-700 border-purple-200', dot: 'bg-purple-500' },
  rejection:            { label: 'Disqualification',      color: 'bg-red-100 text-red-700 border-red-200',      dot: 'bg-red-500'    },
  rejection_feedback:   { label: 'Feedback Sent',         color: 'bg-green-100 text-green-700 border-green-200', dot: 'bg-green-500' },
  bid:                  { label: 'Bid Submitted',         color: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  bid_stage:            { label: 'Bid Stage Change',      color: 'bg-indigo-100 text-indigo-700 border-indigo-200', dot: 'bg-indigo-500' },
  clarification:        { label: 'Clarification',         color: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  clarification_response: { label: 'Clarification Reply', color: 'bg-teal-100 text-teal-700 border-teal-200',   dot: 'bg-teal-500'  },
}

const SEVERITY_LEFT = {
  error:   'border-l-red-500',
  warning: 'border-l-amber-500',
  info:    'border-l-blue-300',
}

function fmtFull(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  } catch { return iso }
}

function ActivityTimeline({ events, sources, activeSource, onSourceChange, search, onSearch, navigate }) {
  const [expanded, setExpanded] = useState(null)

  const sourceLabel = (s) => SOURCE_META[s]?.label || s.replace(/_/g, ' ')

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="card p-4">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Source filter chips */}
          <div className="flex gap-1.5 flex-wrap">
            {sources.map(s => (
              <button
                key={s}
                onClick={() => onSourceChange(s)}
                className={`text-xs px-2.5 py-1 font-medium transition-colors ${
                  activeSource === s ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                style={{ borderRadius: '2px' }}
              >
                {s === 'all' ? `All (${events.length + (events.length === 0 && activeSource !== 'all' ? 0 : 0)})` : sourceLabel(s)}
              </button>
            ))}
          </div>
          {/* Search */}
          <div className="relative ml-auto">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search activity…"
              value={search}
              onChange={e => onSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
              style={{ borderRadius: '2px' }}
            />
            {search && (
              <button className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                onClick={() => onSearch('')}>
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Empty state */}
      {events.length === 0 && (
        <div className="card p-12 text-center">
          <Activity size={32} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-500">No activity events match the current filter.</p>
        </div>
      )}

      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        {events.length > 0 && (
          <div className="absolute left-[19px] top-0 bottom-0 w-px bg-gray-200 z-0" />
        )}
        <div className="space-y-2">
          {events.map((ev, idx) => {
            const meta    = SOURCE_META[ev.source] || { label: ev.source, color: 'bg-gray-100 text-gray-600 border-gray-200', dot: 'bg-gray-400' }
            const isOpen  = expanded === idx
            const leftBorder = SEVERITY_LEFT[ev.severity] || 'border-l-gray-300'

            return (
              <div key={idx} className="flex items-start gap-3 relative z-10">
                {/* Dot */}
                <div className={`w-10 h-10 flex-shrink-0 rounded-full ${meta.dot} flex items-center justify-center shadow-sm`} style={{ minWidth: '2.5rem' }}>
                  {ev.source === 'document'           && <Upload size={13} className="text-white" />}
                  {ev.source === 'rejection'          && <XCircle size={13} className="text-white" />}
                  {ev.source === 'rejection_feedback' && <MessageSquare size={13} className="text-white" />}
                  {ev.source === 'bid' || ev.source === 'bid_stage' ? <FileText size={13} className="text-white" /> : null}
                  {ev.source === 'clarification' || ev.source === 'clarification_response' ? <MessageSquare size={13} className="text-white" /> : null}
                  {ev.source === 'audit'              && <Shield size={13} className="text-white" />}
                </div>

                {/* Card */}
                <div
                  className={`flex-1 card border-l-4 ${leftBorder} overflow-hidden cursor-pointer hover:shadow-sm transition-shadow`}
                  onClick={() => setExpanded(isOpen ? null : idx)}
                >
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className={`text-[10px] font-bold px-2 py-0.5 border ${meta.color}`} style={{ borderRadius: '2px' }}>
                            {meta.label}
                          </span>
                          <span className="text-xs font-semibold text-slate-700">{ev.action}</span>
                          {ev.bidder_id && (
                            <button
                              className="text-[10px] text-blue-600 font-mono bg-blue-50 border border-blue-200 px-1.5 py-0.5 hover:bg-blue-100 transition-colors"
                              style={{ borderRadius: '2px' }}
                              onClick={e => { e.stopPropagation(); navigate(`/bidders/${ev.bidder_id}`) }}
                            >
                              {ev.bidder_id}
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 truncate">{ev.detail}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[10px] text-gray-400 whitespace-nowrap">{fmtFull(ev.timestamp)}</span>
                        {isOpen ? <ChevronUp size={13} className="text-gray-400" /> : <ChevronDown size={13} className="text-gray-400" />}
                      </div>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-2">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-[10px] uppercase text-gray-400 font-semibold">Actor</p>
                          <p className="text-slate-700 font-medium mt-0.5">{ev.actor}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase text-gray-400 font-semibold">Time</p>
                          <p className="text-slate-700 font-medium mt-0.5">{fmtFull(ev.timestamp)}</p>
                        </div>
                      </div>

                      {/* Full detail */}
                      <div>
                        <p className="text-[10px] uppercase text-gray-400 font-semibold mb-1">Details</p>
                        <p className="text-xs text-slate-600 leading-relaxed bg-white border border-gray-200 px-3 py-2" style={{ borderRadius: '2px' }}>
                          {ev.detail}
                        </p>
                      </div>

                      {/* Rejection fields */}
                      {ev.rejection_reason && (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <Layers size={11} className="text-red-400" />
                            <span className="text-[10px] uppercase text-gray-400 font-semibold">Stage</span>
                            <span className="text-xs text-slate-700 font-medium">{ev.rejection_stage}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Tag size={11} className="text-red-400" />
                            <span className="text-[10px] uppercase text-gray-400 font-semibold">Category</span>
                            <span className="text-xs text-slate-700 font-medium">{ev.rejection_category}</span>
                          </div>
                          <div className="bg-red-50 border border-red-200 px-3 py-2" style={{ borderRadius: '2px' }}>
                            <p className="text-[10px] uppercase font-bold text-red-600 tracking-wide mb-1">Rejection Reason</p>
                            <p className="text-xs text-red-900 leading-relaxed">"{ev.rejection_reason}"</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
