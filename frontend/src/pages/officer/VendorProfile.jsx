import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ChevronRight, Building2, TrendingUp, TrendingDown, Minus,
  ShieldCheck, ShieldAlert, ShieldX, Award, AlertTriangle,
  CheckCircle, XCircle, Star, Clock, Package, Wrench,
  FileText, BarChart3, RefreshCw, ExternalLink, Trash2
} from 'lucide-react'
import { getVendorProfile, verifyBidder, getVendorIntegrity, deleteBidder } from '../../services/api.js'
import ScoreRing from '../../components/ScoreRing.jsx'
import { PageLoader } from '../../components/LoadingSkeleton.jsx'
import { useToast } from '../../components/Toast.jsx'

const TREND_CONFIG = {
  IMPROVING: { icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50', label: 'Improving' },
  STABLE: { icon: Minus, color: 'text-blue-600', bg: 'bg-blue-50', label: 'Stable' },
  DECLINING: { icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-50', label: 'Declining' },
  INSUFFICIENT_DATA: { icon: Minus, color: 'text-gray-400', bg: 'bg-gray-50', label: 'Insufficient Data' },
}

const RISK_CONFIG = {
  LOW: { color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200', icon: ShieldCheck, label: 'Low Risk' },
  MEDIUM: { color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', icon: ShieldAlert, label: 'Medium Risk' },
  HIGH: { color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', icon: ShieldX, label: 'High Risk' },
  UNKNOWN: { color: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-200', icon: ShieldAlert, label: 'Unknown' },
}

function MetricCard({ label, value, subtext, color = 'text-slate-800', icon: Icon, bg = 'bg-white' }) {
  return (
    <div className={`${bg} rounded-xl border border-gray-100 p-4 shadow-sm`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">{label}</p>
        {Icon && <Icon size={14} className="text-gray-300" />}
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {subtext && <p className="text-[10px] text-gray-400 mt-1">{subtext}</p>}
    </div>
  )
}

function ProgressBar({ label, value, color = 'bg-blue-500' }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-semibold text-slate-700">{value}%</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  )
}

export default function VendorProfile() {
  const { bidderId } = useParams()
  const navigate = useNavigate()
  const { addToast: showToast } = useToast()
  const [profile, setProfile] = useState(null)
  const [verification, setVerification] = useState(null)
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState(false)
  const [integrity, setIntegrity] = useState(null)
  const [checkingIntegrity, setCheckingIntegrity] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    getVendorProfile(bidderId)
      .then((res) => setProfile(res.data))
      .catch(() => showToast('Failed to load vendor profile', 'error'))
      .finally(() => setLoading(false))
  }, [bidderId])

  const handleVerify = async () => {
    setVerifying(true)
    try {
      const res = await verifyBidder(bidderId)
      setVerification(res.data)
      showToast('Government verification complete', 'success')
    } catch {
      showToast('Verification failed', 'error')
    } finally {
      setVerifying(false)
    }
  }

  const handleIntegrityCheck = async () => {
    setCheckingIntegrity(true)
    try {
      const res = await getVendorIntegrity(bidderId)
      setIntegrity(res.data)
      showToast('Vendor integrity check complete', 'success')
    } catch {
      showToast('Integrity check failed', 'error')
    } finally {
      setCheckingIntegrity(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteBidder(bidderId, 'Procurement Officer')
      showToast('Bidder and all associated data permanently removed', 'success')
      navigate('/bidders')
    } catch (err) {
      showToast(err.message || 'Failed to delete bidder', 'error')
      setDeleting(false)
      setDeleteConfirm(false)
    }
  }

  if (loading) return <PageLoader />
  if (!profile) return <div className="p-6 text-red-500">Vendor profile not found.</div>

  const trend = TREND_CONFIG[profile.performance_trend] || TREND_CONFIG.INSUFFICIENT_DATA
  const risk = RISK_CONFIG[profile.risk_signal] || RISK_CONFIG.UNKNOWN
  const TrendIcon = trend.icon
  const RiskIcon = risk.icon

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate('/')}>Dashboard</span>
        <ChevronRight size={12} />
        <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate('/bidders')}>Bidders</span>
        <ChevronRight size={12} />
        <span className="text-slate-700 font-medium">Vendor 360° — {profile.bidder_name}</span>
      </div>

      {/* Header */}
      <div className="card p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-5">
            <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
              {profile.bidder_name?.[0] || 'V'}
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">{profile.bidder_name}</h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs text-gray-500 font-mono">{profile.gstin}</span>
                <span className="text-gray-300">·</span>
                <span className="text-xs text-gray-500 font-mono">{profile.pan}</span>
                {profile.blacklisted && (
                  <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded-full border border-red-200">
                    ⛔ BLACKLISTED
                  </span>
                )}
                {profile.debarment_status && profile.debarment_status !== 'NONE' && (
                  <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded-full">
                    DEBARRED
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-3">
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${risk.bg} border ${risk.border}`}>
                  <RiskIcon size={12} className={risk.color} />
                  <span className={`text-[11px] font-semibold ${risk.color}`}>{risk.label}</span>
                </div>
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${trend.bg}`}>
                  <TrendIcon size={12} className={trend.color} />
                  <span className={`text-[11px] font-semibold ${trend.color}`}>{trend.label}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <button
              className="btn-secondary text-xs"
              onClick={handleVerify}
              disabled={verifying}
            >
              {verifying ? <RefreshCw size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
              {verifying ? 'Verifying…' : 'Gov. Verify'}
            </button>
            <button
              className="btn-secondary text-xs"
              onClick={handleIntegrityCheck}
              disabled={checkingIntegrity}
            >
              {checkingIntegrity ? <RefreshCw size={13} className="animate-spin" /> : <ShieldAlert size={13} />}
              {checkingIntegrity ? 'Checking…' : 'Integrity Check'}
            </button>
            <button
              className="btn-secondary text-xs"
              onClick={() => navigate(`/bidders/${bidderId}/compliance`)}
            >
              <BarChart3 size={13} /> Compliance
            </button>
            <button
              className="text-xs px-3 py-1.5 font-medium text-red-600 border border-red-200 hover:bg-red-50 transition-colors flex items-center gap-1.5"
              style={{ borderRadius: '2px' }}
              onClick={() => setDeleteConfirm(true)}
            >
              <Trash2 size={13} /> Delete Bidder
            </button>
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
          <div className="bg-white p-6 w-full max-w-sm shadow-2xl" style={{ borderRadius: '2px' }}>
            <div className="flex items-center gap-2 text-red-600 mb-2">
              <AlertTriangle size={18} />
              <h3 className="text-base font-bold text-slate-800">Delete Bidder Permanently?</h3>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              This removes <strong>{profile.bidder_name}</strong> ({bidderId}), all uploaded documents,
              compliance results, and audit history. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button className="btn-secondary flex-1 justify-center" onClick={() => setDeleteConfirm(false)} disabled={deleting}>
                Cancel
              </button>
              <button
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60"
                style={{ borderRadius: '2px' }}
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
                {deleting ? 'Deleting…' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Compliance Score"
          value={`${profile.avg_compliance_score || 0}%`}
          subtext="Avg across all tenders"
          color={profile.avg_compliance_score >= 85 ? 'text-green-700' : profile.avg_compliance_score >= 70 ? 'text-amber-700' : 'text-red-700'}
          icon={Award}
        />
        <MetricCard
          label="On-Time Delivery"
          value={`${profile.on_time_delivery_rate || 0}%`}
          subtext={`${profile.avg_delivery_delay_days || 0} avg delay days`}
          color={profile.on_time_delivery_rate >= 80 ? 'text-green-700' : 'text-amber-700'}
          icon={Clock}
        />
        <MetricCard
          label="Quality Pass Rate"
          value={`${profile.quality_pass_rate || 0}%`}
          subtext="Inspection acceptance"
          color={profile.quality_pass_rate >= 90 ? 'text-green-700' : 'text-amber-700'}
          icon={CheckCircle}
        />
        <MetricCard
          label="Contracts"
          value={profile.total_contracts_awarded || 0}
          subtext={`${profile.completed_contracts || 0} completed · ${profile.active_contracts || 0} active`}
          icon={Package}
        />
      </div>

      {/* Performance Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Track Record */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Track Record</h2>
          <div className="space-y-3">
            <ProgressBar label="Compliance Score" value={profile.avg_compliance_score || 0} color="bg-blue-500" />
            <ProgressBar label="On-Time Delivery" value={profile.on_time_delivery_rate || 0} color="bg-green-500" />
            <ProgressBar label="Quality Pass Rate" value={profile.quality_pass_rate || 0} color="bg-teal-500" />
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-3 gap-3 text-center">
            {[
              { label: 'Tenders', value: profile.total_tenders_participated || 0 },
              { label: 'Awarded', value: profile.total_contracts_awarded || 0 },
              { label: 'Completed', value: profile.completed_contracts || 0 },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xl font-bold text-slate-800">{value}</p>
                <p className="text-[10px] text-gray-400">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Risk Factors */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">
            Risk Intelligence
            <span className={`ml-2 text-[10px] font-normal px-2 py-0.5 rounded-full ${risk.bg} ${risk.color}`}>
              {risk.label}
            </span>
          </h2>
          {profile.risk_factors && profile.risk_factors.length > 0 ? (
            <div className="space-y-2">
              {profile.risk_factors.map((factor, i) => (
                <div key={i} className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-100 rounded-lg">
                  <AlertTriangle size={12} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <span className="text-xs text-amber-800">{factor}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-100 rounded-lg">
              <CheckCircle size={14} className="text-green-600" />
              <span className="text-xs text-green-800">No risk factors identified. Strong performance history.</span>
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-2">Complaints</p>
            <div className="flex gap-4">
              <div className="text-center">
                <p className="text-lg font-bold text-slate-700">{profile.total_complaints || 0}</p>
                <p className="text-[10px] text-gray-400">Total</p>
              </div>
              <div className="text-center">
                <p className={`text-lg font-bold ${(profile.verified_complaints || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {profile.verified_complaints || 0}
                </p>
                <p className="text-[10px] text-gray-400">Verified</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-amber-600">{profile.penalty_incidents || 0}</p>
                <p className="text-[10px] text-gray-400">Penalties</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Certifications */}
      {profile.certifications && profile.certifications.length > 0 && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Verified Certifications</h2>
          <div className="flex flex-wrap gap-2">
            {profile.certifications.map((cert) => (
              <span key={cert} className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-full text-xs font-semibold text-blue-700">
                <ShieldCheck size={11} /> {cert}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Recent Contracts */}
      {profile.recent_contracts && profile.recent_contracts.length > 0 && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Recent Contracts</h2>
          <div className="space-y-3">
            {profile.recent_contracts.map((contract) => (
              <div
                key={contract.id}
                className="flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => navigate(`/contracts?contract=${contract.id}`)}
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-blue-50 rounded-lg flex-shrink-0">
                    <Package size={13} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-700">{contract.id}</p>
                    <p className="text-xs text-gray-500">{contract.tender_id} · {contract.awarded_by}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-slate-700">{contract.contract_value_display}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                    contract.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                    contract.status === 'AWARDED' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {contract.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vendor Integrity Check Panel */}
      {integrity && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <ShieldAlert size={15} className="text-blue-600" />
            Vendor Integrity Check
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div className={`p-3 rounded-xl border ${integrity.blacklist_status ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-100'}`}>
              <p className="text-[10px] text-gray-500 uppercase font-semibold mb-1">Blacklist Status</p>
              <p className={`text-sm font-bold flex items-center gap-1 ${integrity.blacklist_status ? 'text-red-700' : 'text-green-700'}`}>
                {integrity.blacklist_status ? <ShieldX size={14} /> : <ShieldCheck size={14} />}
                {integrity.blacklist_status ? 'Blacklisted' : 'Clear'}
              </p>
            </div>
            <div className={`p-3 rounded-xl border ${integrity.debarment_status && integrity.debarment_status !== 'CLEAR' ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-100'}`}>
              <p className="text-[10px] text-gray-500 uppercase font-semibold mb-1">Debarment Status</p>
              <p className={`text-sm font-bold ${integrity.debarment_status && integrity.debarment_status !== 'CLEAR' ? 'text-amber-700' : 'text-green-700'}`}>
                {integrity.debarment_status || 'CLEAR'}
              </p>
            </div>
            <div className="p-3 rounded-xl border bg-gray-50 border-gray-200">
              <p className="text-[10px] text-gray-500 uppercase font-semibold mb-1">AI Overrides</p>
              <p className="text-sm font-bold text-slate-700">{integrity.ai_overrides_count || 0}</p>
            </div>
          </div>
          {integrity.conflict_of_interest && integrity.conflict_of_interest.length > 0 ? (
            <div className="space-y-2 mb-3">
              <p className="text-[10px] font-semibold uppercase text-gray-400">Conflict of Interest</p>
              {integrity.conflict_of_interest.map((c, i) => (
                <div key={i} className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-100 rounded-lg">
                  <AlertTriangle size={12} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <span className="text-xs text-amber-800">{typeof c === 'string' ? c : JSON.stringify(c)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-100 rounded-lg mb-3">
              <CheckCircle size={14} className="text-green-600" />
              <span className="text-xs text-green-800">No declared conflicts of interest.</span>
            </div>
          )}
          {integrity.notes && <p className="text-xs text-gray-500 italic">{integrity.notes}</p>}
          <p className="text-[10px] text-gray-400 mt-3">
            Source: {integrity.verification_source}
            {integrity.last_checked ? ` · Last checked ${new Date(integrity.last_checked).toLocaleString('en-IN')}` : ''}
          </p>
        </div>
      )}

      {/* Government Verification Panel */}
      {verification && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <ShieldCheck size={15} className="text-blue-600" />
            Government Source Verification
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${
              verification.overall_status === 'CLEAR' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
            }`}>
              {verification.overall_status}
            </span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(verification.results || []).map((result, i) => (
              <div key={i} className={`p-3 rounded-xl border ${result.verified ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-slate-700">{result.adapter}</span>
                  {result.verified
                    ? <CheckCircle size={13} className="text-green-600" />
                    : <XCircle size={13} className="text-red-600" />
                  }
                </div>
                <p className="text-[10px] text-gray-600">{result.entity_name || result.notes || 'No data'}</p>
                <div className="flex items-center justify-between mt-1.5">
                  <span className={`text-[10px] font-bold ${result.verified ? 'text-green-700' : 'text-red-700'}`}>
                    {result.status}
                  </span>
                  <span className="text-[10px] text-gray-400">{result.source}</span>
                </div>
                {result.mismatch_flags && result.mismatch_flags.length > 0 && (
                  <div className="mt-1.5 space-y-1">
                    {result.mismatch_flags.map((flag, j) => (
                      <p key={j} className="text-[10px] text-red-600 bg-red-100 px-2 py-0.5 rounded">⚠ {flag}</p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 mt-3">
            Verified at {new Date(verification.verified_at).toLocaleString('en-IN')} · {verification.verified_count}/{verification.total_checks} checks passed
          </p>
        </div>
      )}

      {/* Future Risk Signal */}
      <div className={`card p-5 border-2 ${
        profile.risk_signal === 'LOW' ? 'border-green-200 bg-green-50' :
        profile.risk_signal === 'HIGH' ? 'border-red-200 bg-red-50' :
        'border-amber-200 bg-amber-50'
      }`}>
        <div className="flex items-start gap-3">
          <RiskIcon size={20} className={risk.color} />
          <div>
            <h3 className="text-sm font-bold text-slate-800">Future Procurement Risk Signal</h3>
            <p className={`text-xs mt-1 ${risk.color}`}>
              Based on historical compliance, delivery, quality, and complaint data, this vendor is classified as{' '}
              <strong>{risk.label}</strong> for future procurement consideration.
            </p>
            <p className="text-xs text-gray-500 mt-1">
              This signal is advisory only. Final procurement decisions remain with authorized officials per applicable rules.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
