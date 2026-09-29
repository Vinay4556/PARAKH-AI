import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Printer, FileDown, FileSpreadsheet, Sparkles, Eye,
  ChevronUp, ChevronDown, AlertTriangle, CheckCircle, Clock,
  XCircle, FileText, Users, Award, TrendingUp, Shield
} from 'lucide-react'
import { getOfficerSummary, getOfficerSummaryReportUrl } from '../../services/api.js'
import api from '../../services/api.js'
import { RiskBadge } from '../../components/StatusBadge.jsx'
import { PageLoader } from '../../components/LoadingSkeleton.jsx'
import { useToast } from '../../components/Toast.jsx'

const DEFAULT_TENDER = 'GEM-DEMO-2026-001'

const FILTERS = [
  { key: 'ALL', label: 'All Bidders' },
  { key: 'COMPLIANT', label: 'Compliant' },
  { key: 'UNDER_REVIEW', label: 'Partially Compliant' },
  { key: 'NON_COMPLIANT', label: 'Non-Compliant' },
  { key: 'REVIEW', label: 'Under Review' },
  { key: 'MISSING', label: 'Missing Documents' },
  { key: 'PENDING', label: 'Pending Verification' },
]

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

// ── Download helper (works in Chrome/Edge/Firefox/Safari) ────────
function downloadBlob(content, mime, filename) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)   // Firefox requires the link to be in the DOM
  a.click()
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 1000)
}

// ── Excel export (valid SpreadsheetML 2003 — opens in Excel/LibreOffice) ──
function exportExcel(tenderId, tender, bidders, statistics) {
  const dateStr = new Date().toISOString().slice(0, 10)
  const esc = (v) => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // strip characters that are illegal in XML 1.0
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')

  const cell = (v, style) => {
    const isNum = typeof v === 'number' && Number.isFinite(v)
    return `<Cell${style ? ` ss:StyleID="${style}"` : ''}><Data ss:Type="${isNum ? 'Number' : 'String'}">${esc(v)}</Data></Cell>`
  }
  const row = (cells, style) => `<Row>${cells.map((c) => cell(c, style)).join('')}</Row>`
  const sheet = (name, header, rows) =>
    `<Worksheet ss:Name="${esc(name)}"><Table>` +
    (header ? row(header, 'hdr') : '') +
    rows.map((r) => row(r)).join('') +
    `</Table></Worksheet>`

  const summaryRows = [
    ['PARAKH AI — Consolidated Bidder Summary', ''],
    ['Tender ID', tenderId],
    ['Tender Name', tender.title],
    ['Department', tender.department],
    ['Report Generated', new Date().toLocaleString('en-IN')],
    ['', ''],
    ['Total Bidders', statistics.total_bidders],
    ['Compliant', statistics.compliant],
    ['Under Review', statistics.under_review],
    ['Non-Compliant', statistics.non_compliant],
    ['Pending', statistics.pending],
    ['With Missing Documents', statistics.with_missing_documents],
    ['Average Score', statistics.average_score],
    ['Highest Score', statistics.highest_score],
  ]

  const cmpHeader = ['S.No', 'Bidder Name', 'Bidder ID', 'GSTIN', 'Documents', 'Missing Items', 'Compliance', 'Verified', 'Review', 'Non-Compliant', 'Missing', 'Overall Score', 'Risk', 'Officer Decision', 'Issues']
  const cmpRows = bidders.map((b, i) => {
    const sc = b.status_counts || {}
    const missing = (b.missing_items || []).map((m) => m.title).join(', ') || 'None'
    return [i + 1, b.name, b.id, b.gstin || '—', `${b.document_count}/${b.total_requirements}`, missing,
      b.compliance_status, sc.VERIFIED || 0, sc.REVIEW || 0, sc.NON_COMPLIANT || 0, sc.MISSING || 0,
      b.overall_score, b.risk_level, b.officer_decision || '—', (b.issues || []).length]
  })

  const missHeader = ['Bidder Name', 'Bidder ID', 'Requirement', 'Category', 'Mandatory', 'Status', 'Detail']
  const missRows = []
  bidders.forEach((b) => {
    ;[...(b.missing_items || []), ...(b.review_items || [])].forEach((item) => {
      missRows.push([b.name, b.id, item.title, item.category, item.mandatory ? 'Yes' : 'No', item.status, item.concern || item.found_value || '—'])
    })
    if (!(b.missing_items || []).length && !(b.review_items || []).length) {
      missRows.push([b.name, b.id, '—', '—', '—', 'COMPLETE', 'No missing or pending items'])
    }
  })

  const catHeader = ['Bidder Name', 'Bidder ID', 'Category', 'Score %']
  const catRows = []
  bidders.forEach((b) => {
    const entries = Object.entries(b.category_scores || {})
    if (entries.length) entries.forEach(([cat, pct]) => catRows.push([b.name, b.id, cat, pct]))
    else catRows.push([b.name, b.id, '—', 'Not evaluated'])
  })

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Top" ss:WrapText="1"/></Style>
  <Style ss:ID="hdr"><Font ss:Bold="1"/><Interior ss:Color="#E8EDF5" ss:Pattern="Solid"/></Style>
 </Styles>
 ${sheet('Summary', null, summaryRows)}
 ${sheet('Bidder Comparison', cmpHeader, cmpRows)}
 ${sheet('Missing Documents', missHeader, missRows)}
 ${sheet('Evaluation', catHeader, catRows)}
</Workbook>`

  downloadBlob('\ufeff' + xml, 'application/vnd.ms-excel;charset=utf-8',
    `ParakhAI_Bidder_Summary_${tenderId}_${dateStr}.xls`)
}

export default function OfficerSummary() {
  const navigate = useNavigate()
  const { addToast: showToast } = useToast()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('ALL')
  const [sortKey, setSortKey] = useState('overall_score')
  const [sortDir, setSortDir] = useState('desc')
  const [aiSummary, setAiSummary] = useState(null)
  const [generatingAI, setGeneratingAI] = useState(false)

  const tenderId = DEFAULT_TENDER

  useEffect(() => {
    getOfficerSummary(tenderId)
      .then((res) => setData(res.data))
      .catch((e) => showToast(e.message || 'Failed to load summary', 'error'))
      .finally(() => setLoading(false))
  }, [tenderId])

  const bidders = data?.bidders || []
  const stats = data?.statistics
  const tender = data?.tender

  // ── Filtering ────────────────────────────────────────────────
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
    if (filter === 'COMPLIANT') list = list.filter((b) => b.compliance_status === 'COMPLIANT')
    else if (filter === 'UNDER_REVIEW') list = list.filter((b) => b.compliance_status === 'UNDER_REVIEW')
    else if (filter === 'NON_COMPLIANT') list = list.filter((b) => b.compliance_status === 'NON_COMPLIANT')
    else if (filter === 'REVIEW') list = list.filter((b) => b.review_items.length > 0)
    else if (filter === 'MISSING') list = list.filter((b) => b.missing_items.length > 0)
    else if (filter === 'PENDING') list = list.filter((b) => b.compliance_status === 'PENDING')

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
  }, [bidders, search, filter, sortKey, sortDir])

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  const SortIcon = ({ col }) => {
    if (sortKey !== col) return <ChevronDown size={12} className="text-gray-300" />
    return sortDir === 'asc'
      ? <ChevronUp size={12} className="text-blue-600" />
      : <ChevronDown size={12} className="text-blue-600" />
  }

  // ── Print / PDF ──────────────────────────────────────────────
  // Fetch the authenticated HTML report, render it in a hidden same-origin
  // iframe (no popup blocker, no missing "load" event) and call print().
  // "Download PDF" uses the browser's "Save as PDF" destination.
  const [reportBusy, setReportBusy] = useState(false)

  const openReport = async (message) => {
    if (reportBusy) return
    setReportBusy(true)
    try {
      const res = await api.get(getOfficerSummaryReportUrl(tenderId), { responseType: 'text' })
      const html = typeof res.data === 'string' ? res.data : String(res.data ?? '')
      if (!html.trim()) throw new Error('Report is empty')

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

      // give layout a moment, then print
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
    exportExcel(tenderId, tender, bidders, stats)
    showToast('Excel report downloaded', 'success')
  }

  // ── AI Executive Summary ─────────────────────────────────────
  const handleGenerateAI = () => {
    setGeneratingAI(true)
    setTimeout(() => {
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

      const allIssues = bidders.flatMap((b) => b.issues.map((i) => ({ bidder: b.name, ...i })))
      const highSeverity = allIssues.filter((i) => i.severity === 'HIGH')

      const lines = []
      lines.push(`Total bidders evaluated: ${total}.`)
      lines.push(`Compliance situation: ${compliant} compliant, ${underReview} under review, ${nonCompliant} non-compliant, ${pending} pending.`)
      lines.push(`Bidders with missing information: ${withMissing} of ${total}.`)
      if (mandatoryMissing.length > 0) {
        lines.push(`Mandatory documents missing across ${mandatoryMissing.length} bidder(s).`)
        if (recurringStr) lines.push(`Most common missing items: ${recurringStr}.`)
      }
      if (highSeverity.length > 0) {
        lines.push(`High-severity issues flagged: ${highSeverity.length} (cross-document mismatches or non-compliant mandatory requirements).`)
      }
      lines.push(`Evaluation completion: ${total - pending} of ${total} bidders analyzed.`)
      lines.push(`Average overall score: ${avg}%. Highest score: ${highest}%.`)
      if (nonCompliant > 0) {
        const ncNames = bidders.filter((b) => b.compliance_status === 'NON_COMPLIANT').map((b) => b.name)
        lines.push(`Non-compliant bidders: ${ncNames.join(', ')}.`)
      }

      setAiSummary(lines.join('\n'))
      setGeneratingAI(false)
    }, 1200)
  }

  if (loading) return <PageLoader />
  if (!data) return <div className="p-6 text-red-500">Failed to load officer summary.</div>

  const statCards = [
    { label: 'Total Bidders', value: stats.total_bidders, icon: Users, color: 'text-blue-700', bg: 'bg-blue-50' },
    { label: 'Compliant', value: stats.compliant, icon: CheckCircle, color: 'text-green-700', bg: 'bg-green-50' },
    { label: 'Under Review', value: stats.under_review, icon: AlertTriangle, color: 'text-amber-700', bg: 'bg-amber-50' },
    { label: 'Non-Compliant', value: stats.non_compliant, icon: XCircle, color: 'text-red-700', bg: 'bg-red-50' },
    { label: 'Missing Docs', value: stats.with_missing_documents, icon: FileText, color: 'text-orange-700', bg: 'bg-orange-50' },
    { label: 'Pending', value: stats.pending, icon: Clock, color: 'text-gray-500', bg: 'bg-gray-100' },
    { label: 'Average Score', value: `${stats.average_score}%`, icon: TrendingUp, color: 'text-indigo-700', bg: 'bg-indigo-50' },
    { label: 'Highest Score', value: `${stats.highest_score}%`, icon: Award, color: 'text-emerald-700', bg: 'bg-emerald-50' },
  ]

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Shield size={20} className="text-blue-700" />
            PARAKH AI — Consolidated Bidder Summary
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {tender.title} · {tender.department}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            Tender ID: {tender.id} · Generated: {formatDateTime(data.generated_at)}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap no-print">
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
            {generatingAI ? 'Generating…' : 'Generate Executive Summary'}
          </button>
        </div>
      </div>

      {/* AI Executive Summary */}
      {aiSummary && (
        <div className="card p-4 no-print">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} className="text-purple-600" />
            <h2 className="text-sm font-semibold text-slate-700">AI-Generated Executive Summary</h2>
            <span className="text-[10px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full font-semibold">AI-GENERATED</span>
          </div>
          <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed">{aiSummary}</p>
        </div>
      )}

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <div key={card.label} className="stat-card">
              <div className={`w-7 h-7 mx-auto mb-1.5 flex items-center justify-center ${card.bg}`} style={{ borderRadius: '2px' }}>
                <Icon size={14} className={card.color} />
              </div>
              <p className={`text-xl font-bold text-center ${card.color}`}>{card.value}</p>
              <p className="text-[10px] text-gray-500 text-center mt-0.5">{card.label}</p>
            </div>
          )
        })}
      </div>

      {/* Filters & Search */}
      <div className="card p-4 no-print">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by bidder name, ID, or GSTIN…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 focus:outline-none focus:border-blue-400"
              style={{ borderRadius: '2px' }}
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`text-xs px-3 py-1.5 font-semibold transition-colors ${
                  filter === f.key
                    ? 'bg-blue-700 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                style={{ borderRadius: '2px' }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">
            Bidder Comparison
            <span className="text-xs text-gray-400 font-normal ml-2">
              {filtered.length} of {bidders.length} bidder{bidders.length !== 1 ? 's' : ''}
            </span>
          </h2>
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
                  <span className="inline-flex items-center gap-1">Missing Items <SortIcon col="missing" /></span>
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
                <th>Key Remarks</th>
                <th className="no-print">Actions</th>
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
                    <td className="text-center text-sm">{b.document_count}/{b.total_requirements}</td>
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
                    <td className="text-[11px] text-gray-500">
                      {Object.entries(b.category_scores || {}).map(([cat, pct]) => (
                        <span key={cat} className="mr-2">
                          {cat.slice(0, 4)}: <span className={scoreColor(pct)}>{pct}%</span>
                        </span>
                      ))}
                      {!Object.keys(b.category_scores || {}).length && 'Not evaluated'}
                    </td>
                    <td className={`text-center font-bold text-lg ${scoreColor(b.overall_score)}`}>
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
                        <Eye size={11} /> View Details
                      </button>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={12} className="text-center py-8 text-gray-400 text-sm">
                    No bidders match the current filter/search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Missing / Pending Information */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
          <AlertTriangle size={14} className="text-amber-600" />
          Missing / Pending Information
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {bidders.map((b) => (
            <div key={b.id} className="border border-gray-100 p-3" style={{ borderRadius: '2px' }}>
              <div className="font-semibold text-sm text-slate-800">{b.name}</div>
              <div className="text-[10px] text-gray-400 font-mono mb-1.5">{b.id}</div>
              {b.missing_items.length === 0 && b.review_items.length === 0 ? (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle size={11} /> No missing documents. All mandatory requirements submitted.
                </p>
              ) : (
                <ul className="space-y-1">
                  {b.missing_items.map((item) => (
                    <li key={item.requirement_id} className="text-xs text-red-600 flex items-start gap-1">
                      <XCircle size={11} className="mt-0.5 flex-shrink-0" />
                      <span>
                        {item.title} – Missing
                        {item.mandatory && <span className="text-[9px] bg-red-50 text-red-600 px-1 ml-1 font-semibold">MANDATORY</span>}
                      </span>
                    </li>
                  ))}
                  {b.review_items.map((item) => (
                    <li key={item.requirement_id} className="text-xs text-amber-600 flex items-start gap-1">
                      <Clock size={11} className="mt-0.5 flex-shrink-0" />
                      <span>{item.title} – Pending Verification</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Key Observations */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
          <FileText size={14} className="text-blue-700" />
          Key Observations
        </h2>
        <div className="space-y-3">
          {bidders.map((b) => {
            const sc = b.status_counts
            const parts = []
            parts.push(`Bidder submitted ${b.document_count} of ${b.total_requirements} required documents.`)
            if (b.missing_items.length) {
              const mand = b.missing_items.filter((m) => m.mandatory)
              if (mand.length) {
                parts.push(`${mand.length} mandatory document(s) missing: ${mand.map((m) => m.title).join(', ')}.`)
              } else {
                parts.push(`${b.missing_items.length} optional document(s) not submitted.`)
              }
            } else {
              parts.push('All mandatory requirements submitted.')
            }
            if (b.review_items.length) {
              parts.push(`${b.review_items.length} item(s) pending verification: ${b.review_items.map((i) => i.title).join(', ')}.`)
            }
            if (b.non_compliant_items.length) {
              parts.push(`${b.non_compliant_items.length} requirement(s) non-compliant: ${b.non_compliant_items.map((i) => i.title).join(', ')}.`)
            }
            parts.push(
              `Compliance score: ${b.overall_score}% (${sc.VERIFIED || 0} verified, ${sc.REVIEW || 0} review, ${sc.NON_COMPLIANT || 0} non-compliant, ${sc.MISSING || 0} missing). Risk level: ${b.risk_level}.`
            )
            if (b.officer_decision) parts.push(`Officer decision: ${b.officer_decision}.`)

            return (
              <div key={b.id} className="border-l-2 border-blue-200 pl-3">
                <div className="text-sm font-semibold text-slate-800">Bidder: {b.name}</div>
                <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{parts.join(' ')}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Tender Info Footer */}
      <div className="card p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Tender ID</p>
            <p className="text-sm font-semibold text-slate-700">{tender.id}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Department</p>
            <p className="text-sm font-semibold text-slate-700">{tender.department}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Submission Deadline</p>
            <p className="text-sm font-semibold text-slate-700">{formatDate(tender.submission_deadline)}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Report Generated</p>
            <p className="text-sm font-semibold text-slate-700">{formatDateTime(data.generated_at)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
