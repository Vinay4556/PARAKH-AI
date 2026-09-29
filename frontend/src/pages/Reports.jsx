import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronRight, Download, FileText, RefreshCw,
  CheckCircle, AlertTriangle, XCircle, MinusCircle,
  BarChart2, ExternalLink, Shield, List
} from 'lucide-react'
import { getBidderReport, getTenderBidders } from '../services/api.js'
import ScoreRing from '../components/ScoreRing.jsx'
import { RiskBadge } from '../components/StatusBadge.jsx'
import { useToast } from '../components/Toast.jsx'

const STATIC_BIDDERS = [
  { id: 'BID-001', name: 'ABC Technologies Pvt Ltd', score: 87, risk: 'MEDIUM', verified: 14, review: 3, non_compliant: 1, missing: 2 },
  { id: 'BID-002', name: 'Bharat Industrial Systems Pvt Ltd', score: 61, risk: 'HIGH', verified: 7, review: 1, non_compliant: 3, missing: 9 },
  { id: 'BID-003', name: 'Nova Engineering Solutions Pvt Ltd', score: 91, risk: 'LOW', verified: 16, review: 1, non_compliant: 0, missing: 3 },
]

export default function Reports() {
  const navigate = useNavigate()
  const { addToast: showToast } = useToast()
  const [generating, setGenerating] = useState({})
  const [bidders, setBidders] = useState(STATIC_BIDDERS)

  useEffect(() => {
    getTenderBidders('GEM-DEMO-2026-001')
      .then((res) => {
        const loaded = res.data || []
        if (loaded.length > 0) {
          // Merge dynamic scores with static counts (compliance counts need separate API)
          setBidders(STATIC_BIDDERS.map((sb) => {
            const live = loaded.find((b) => b.id === sb.id)
            return live ? { ...sb, score: live.compliance_score || sb.score, risk: live.risk_level || sb.risk } : sb
          }))
        }
      })
      .catch(() => {}) // fallback to static
  }, [])

  const handleReport = async (bidderId, bidderName) => {
    setGenerating((p) => ({ ...p, [bidderId]: true }))
    showToast(`Generating report for ${bidderName}…`, 'info')
    try {
      const res = await getBidderReport(bidderId)
      const html = res.data?.html
      if (!html) throw new Error('Empty report')
      const win = window.open('', '_blank')
      win.document.write(html)
      win.document.close()
      showToast('Report opened in new tab', 'success')
    } catch {
      showToast('Report generation failed. Please try again.', 'error')
    } finally {
      setGenerating((p) => ({ ...p, [bidderId]: false }))
    }
  }

  const handleDownload = (bidderId) => {
    // Direct download via the new download endpoint
    const link = document.createElement('a')
    link.href = `/api/bidders/${bidderId}/report/download`
    link.download = `compliance_report_${bidderId}.html`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    showToast('Downloading report…', 'info')
  }

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate('/')}>Dashboard</span>
        <ChevronRight size={12} />
        <span className="text-slate-700 font-medium">Reports</span>
      </div>

      <div>
        <h1 className="page-title">Compliance Reports</h1>
        <p className="text-sm text-gray-500 mt-0.5">Generate and download detailed compliance reports for tender GEM-DEMO-2026-001</p>
      </div>

      {/* Tender Summary Banner */}
      <div className="card p-5 bg-gradient-to-r from-blue-700 to-blue-800 text-white border-0">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <Shield size={20} className="text-white" />
            </div>
            <div>
              <p className="text-xs text-blue-200 font-semibold">GEM-DEMO-2026-001</p>
              <h2 className="font-bold text-white text-sm leading-tight mt-0.5">
                Supply and Installation of Industrial IoT Monitoring Equipment
              </h2>
              <p className="text-xs text-blue-300 mt-1">Government Industrial Procurement Division · ₹4.8 Crore</p>
            </div>
          </div>
          <button
            className="flex-shrink-0 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5"
            onClick={() => navigate('/tenders/GEM-DEMO-2026-001')}
          >
            View Tender <ExternalLink size={12} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-white/20">
          <div className="text-center">
            <p className="text-xl font-bold text-white">3</p>
            <p className="text-xs text-blue-300">Total Bidders</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-white">20</p>
            <p className="text-xs text-blue-300">Requirements</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-white">80%</p>
            <p className="text-xs text-blue-300">Avg Compliance</p>
          </div>
        </div>
      </div>

      {/* Bidder Report Cards */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-700">Individual Bidder Reports</h2>
        {bidders.map((b, idx) => (
          <div key={b.id} className="card p-5">
            <div className="flex items-start gap-5">
              {/* Rank */}
              <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mt-1 ${idx === 0 && b.score === 91 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>
                {[...bidders].sort((a, z) => z.score - a.score).findIndex((x) => x.id === b.id) + 1}
              </div>

              <ScoreRing score={b.score} size={72} strokeWidth={6} />

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-800">{b.name}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{b.id}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <RiskBadge risk={b.risk} />
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      className="btn-secondary text-xs py-2"
                      onClick={() => navigate(`/bidders/${b.id}/compliance`)}
                    >
                      <BarChart2 size={13} /> Compliance
                    </button>
                    <button
                      className="btn-secondary text-xs py-2"
                      onClick={() => handleDownload(b.id)}
                    >
                      <Download size={13} /> Download
                    </button>
                    <button
                      className="btn-primary text-xs py-2"
                      onClick={() => handleReport(b.id, b.name)}
                      disabled={generating[b.id]}
                    >
                      {generating[b.id]
                        ? <><RefreshCw size={13} className="animate-spin" /> Generating…</>
                        : <><ExternalLink size={13} /> View Report</>
                      }
                    </button>
                  </div>
                </div>

                {/* Status summary */}
                <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-gray-100">
                  {[
                    { label: 'Verified', count: b.verified, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
                    { label: 'Review', count: b.review, icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50' },
                    { label: 'Non-Compliant', count: b.non_compliant, icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
                    { label: 'Missing', count: b.missing, icon: MinusCircle, color: 'text-gray-500', bg: 'bg-gray-100' },
                  ].map(({ label, count, icon: Icon, color, bg }) => (
                    <div key={label} className={`${bg} rounded-lg p-2 text-center`}>
                      <Icon size={13} className={`mx-auto mb-0.5 ${color}`} />
                      <p className={`text-base font-bold ${color}`}>{count}</p>
                      <p className="text-[9px] text-gray-500">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Report Contents */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Report Contents</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            'Tender & bidder overview',
            'Overall compliance score',
            'Risk level assessment',
            'Full requirement matrix',
            'Verified requirements (20)',
            'Non-compliant items',
            'Missing documents',
            'Needs review items',
            'Cross-document checks',
            'Evidence references',
            'AI explanations',
            'Category score breakdown',
          ].map((item) => (
            <div key={item} className="flex items-center gap-2 text-xs text-gray-600">
              <CheckCircle size={12} className="text-green-500 flex-shrink-0" />
              {item}
            </div>
          ))}
        </div>
      </div>

      {/* Export Options */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Export Options</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="p-3 rounded-xl border border-gray-200 bg-gray-50">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                <FileText size={16} className="text-red-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">HTML Report</p>
                <p className="text-xs text-gray-500">Full printable report with all evidence</p>
              </div>
            </div>
            <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
              <CheckCircle size={11} /> Available — opens in browser tab
            </p>
          </div>
          <div className="p-3 rounded-xl border border-gray-200 bg-gray-50">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                <FileText size={16} className="text-green-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">CSV Export</p>
                <p className="text-xs text-gray-500">Requirement-level data for analysis</p>
              </div>
            </div>
            <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
              <AlertTriangle size={11} /> Coming in next release
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
