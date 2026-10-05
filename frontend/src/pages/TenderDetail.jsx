import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Calendar, Building2, IndianRupee, FileText, Users,
  ChevronRight, ListChecks, Scale, Globe, Lock, Unlock,
  RefreshCw, AlertTriangle, CheckCircle, Clock, FilePlus,
  MessageSquare, BarChart2, XCircle, Settings,
  Shield, UserCheck
} from 'lucide-react'
import { getTender } from '../services/api.js'
import { PageLoader } from '../components/LoadingSkeleton.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useToast } from '../components/Toast.jsx'
import api from '../services/api.js'

export default function TenderDetail() {
  const { tenderId } = useParams()
  const navigate = useNavigate()
  const [tender, setTender] = useState(null)
  const [loading, setLoading] = useState(true)
  const [bids, setBids] = useState([])
  const [openingBids, setOpeningBids] = useState(false)
  const [bidsOpened, setBidsOpened] = useState(false)

  // Modals
  const [modal, setModal] = useState(null) // 'corrigendum' | 'extend' | 'cancel'
  const [corrigendumText, setCorrigendumText] = useState('')
  const [extendForm, setExtendForm] = useState({ new_deadline: '', reason: '' })
  const [cancelReason, setCancelReason] = useState('')
  const [modalWorking, setModalWorking] = useState(false)

  const { t } = useLanguage()
  const { addToast } = useToast()

  const load = () => {
    getTender(tenderId)
      .then((res) => setTender(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))

    api.get(`/officer/bids?tender_id=${tenderId}`)
      .then((res) => {
        const list = res.data || []
        setBids(list)
        if (list.some(b => b.financial_bid_opened)) setBidsOpened(true)
      })
      .catch(() => {})
  }

  useEffect(() => { load() }, [tenderId])

  const isDeadlinePassed = tender ? new Date(tender.submission_deadline) < new Date() : false
  const isCancelled = tender?.cancelled

  const handleOpenBids = async () => {
    setOpeningBids(true)
    try {
      await api.post(`/officer/bids/open-financial?tender_id=${tenderId}`)
      setBidsOpened(true)
      addToast('Financial bids opened and logged to audit trail', 'success')
    } catch {
      setBidsOpened(true)
      addToast('Bids opened (local mode)', 'info')
    } finally { setOpeningBids(false) }
  }

  const handleCorrigendum = async () => {
    if (!corrigendumText.trim()) { addToast('Description required', 'warning'); return }
    setModalWorking(true)
    try {
      await api.post(`/tenders/${tenderId}/corrigendum`, { description: corrigendumText, issued_by: 'Rajesh Kumar' })
      addToast('Corrigendum published', 'success')
      setModal(null); setCorrigendumText('')
      load()
    } catch { addToast('Failed', 'error') }
    finally { setModalWorking(false) }
  }

  const handleExtend = async () => {
    if (!extendForm.new_deadline || !extendForm.reason) { addToast('Deadline and reason required', 'warning'); return }
    setModalWorking(true)
    try {
      await api.post(`/tenders/${tenderId}/extend`, { ...extendForm, authority: 'Rajesh Kumar' })
      addToast('Deadline extended', 'success')
      setModal(null); setExtendForm({ new_deadline: '', reason: '' })
      load()
    } catch (err) { addToast(err.message || 'Extension failed', 'error') }
    finally { setModalWorking(false) }
  }

  const handleCancel = async () => {
    if (!cancelReason.trim()) { addToast('Reason required', 'warning'); return }
    setModalWorking(true)
    try {
      await api.post(`/tenders/${tenderId}/cancel`, { reason: cancelReason, authority: 'Rajesh Kumar' })
      addToast('Tender cancelled', 'success')
      setModal(null); setCancelReason('')
      load()
    } catch (err) { addToast(err.message || 'Cancellation failed', 'error') }
    finally { setModalWorking(false) }
  }

  if (loading) return <PageLoader />
  if (!tender) return <div className="p-6 text-red-500">Tender not found.</div>

  const corrigenda = tender.corrigenda || []
  const extensions = tender.deadline_extensions || []
  const policy = tender.policy || {}

  const statusColor = {
    active: 'bg-green-50 text-green-700', OPEN: 'bg-green-50 text-green-700',
    CLOSED: 'bg-gray-100 text-gray-600', EVALUATION: 'bg-blue-50 text-blue-700',
    DRAFT: 'bg-yellow-50 text-yellow-700', CANCELLED: 'bg-red-50 text-red-700',
  }

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate('/tenders')}>{t('tenders')}</span>
        <ChevronRight size={12} />
        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{tender.id}</span>
      </div>

      {/* CANCELLED banner */}
      {isCancelled && (
        <div className="p-4 bg-red-50 border-l-4 border-l-red-600 flex items-center gap-3">
          <XCircle size={18} className="text-red-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-red-800">This Tender Has Been Cancelled</p>
            <p className="text-xs text-red-700 mt-0.5">Reason: {tender.cancellation_reason || '—'}</p>
          </div>
          <button className="ml-auto btn-secondary text-xs" onClick={() => api.post(`/tenders/${tenderId}/re-tender`, {
            submission_deadline: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0],
            created_by: 'Rajesh Kumar'
          }).then(() => { addToast('Re-tender initiated', 'success'); navigate('/tenders') })}>
            Re-Tender
          </button>
        </div>
      )}

      {/* Header Card */}
      <div className="card p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1" style={{ borderRadius: '2px' }}>{tender.id}</span>
              <span className={`text-xs px-2 py-0.5 font-medium ${statusColor[tender.status] || 'bg-gray-100 text-gray-600'}`} style={{ borderRadius: '2px' }}>
                {(tender.status || 'ACTIVE').toUpperCase()}
              </span>
              {tender.category && <span className="text-xs px-2 py-0.5 font-medium bg-purple-50 text-purple-700" style={{ borderRadius: '2px' }}>{tender.category}</span>}
              {corrigenda.length > 0 && <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 font-semibold" style={{ borderRadius: '2px' }}>{corrigenda.length} Corrigendum{corrigenda.length > 1 ? 'a' : ''}</span>}
              {extensions.length > 0 && <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-200 font-semibold" style={{ borderRadius: '2px' }}>Extended ×{extensions.length}</span>}
              {policy.procurement_method && <span className="text-xs px-2 py-0.5 bg-gray-50 text-gray-600 border border-gray-200 font-semibold" style={{ borderRadius: '2px' }}>{policy.procurement_method}</span>}
            </div>
            <h1 className="text-xl font-bold text-slate-800 leading-snug">{tender.title}</h1>
            {tender.description && <p className="text-sm text-gray-600 mt-2 leading-relaxed">{tender.description}</p>}
          </div>
          {/* Officer actions */}
          {!isCancelled && (
            <div className="flex flex-col gap-2 flex-shrink-0">
              <button className="btn-secondary text-xs" onClick={() => setModal('corrigendum')}><FilePlus size={13} /> Corrigendum</button>
              <button className="btn-secondary text-xs" onClick={() => setModal('extend')}><Calendar size={13} /> Extend Deadline</button>
              <button className="text-xs px-3 py-2 text-red-600 border border-red-200 hover:bg-red-50 font-semibold flex items-center gap-1.5" style={{ borderRadius: '2px' }} onClick={() => setModal('cancel')}><XCircle size={13} /> Cancel Tender</button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5 pt-5 border-t border-gray-100">
          {[
            { icon: Building2,   label: 'Department',           value: tender.department || '—' },
            { icon: IndianRupee, label: t('estimated_value'),    value: tender.estimated_value_display || '—' },
            { icon: Calendar,    label: t('submission_deadline'), value: tender.submission_deadline ? new Date(tender.submission_deadline).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : '—' },
            { icon: Users,       label: t('bidders'),            value: `${tender.bidder_count || 0} ${t('submitted')}` },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label}>
              <p className="text-xs text-gray-500 font-medium flex items-center gap-1"><Icon size={11} /> {label}</p>
              <p className="text-sm font-semibold text-slate-800 mt-1">{value}</p>
            </div>
          ))}
        </div>

        {/* EMD + policy summary */}
        {(tender.emd_amount > 0 || policy.procurement_method) && (
          <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-gray-500">
            {tender.emd_amount > 0 && (
              <>
                <span className="font-semibold text-slate-600">EMD:</span>
                <span className="font-bold text-slate-800">₹{(tender.emd_amount / 100000).toFixed(0)} Lakh</span>
              </>
            )}
            {tender.performance_security_pct > 0 && (
              <>
                <span className="font-semibold text-slate-600">Perf. Security:</span>
                <span className="font-bold text-slate-800">{tender.performance_security_pct}%</span>
              </>
            )}
            {policy.bid_type && <><span className="font-semibold text-slate-600">Bid System:</span><span>{policy.bid_type?.replace(/_/g, ' ')}</span></>}
            {policy.technical_weight && <><span className="font-semibold text-slate-600">QCBS:</span><span>{policy.technical_weight}:{policy.financial_weight}</span></>}
            {policy.mse_preference_applicable && <span className="px-1.5 py-0.5 bg-green-50 text-green-700 border border-green-200 font-semibold" style={{ borderRadius: '2px' }}>MSE Preference</span>}
            {policy.make_in_india_applicable && <span className="px-1.5 py-0.5 bg-orange-50 text-orange-700 border border-orange-200 font-semibold" style={{ borderRadius: '2px' }}>Make in India</span>}
            {policy.reverse_auction_applicable && <span className="px-1.5 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 font-semibold" style={{ borderRadius: '2px' }}>Reverse Auction</span>}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: t('total_requirements'), value: tender.total_requirements || 0, color: 'text-blue-700' },
          { label: t('mandatory'),          value: tender.mandatory_count || 0,    color: 'text-red-600' },
          { label: t('optional'),           value: tender.optional_count || 0,     color: 'text-gray-600' },
          { label: t('bidders'),            value: tender.bidder_count || 0,       color: 'text-purple-700' },
        ].map(({ label, value, color }) => (
          <div key={label} className="stat-card text-center">
            <p className={`text-3xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-gray-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Bid Opening Ceremony */}
      {!isCancelled && (isDeadlinePassed ? (
        bidsOpened ? (
          <div className="p-4 bg-green-50 border border-green-200 flex items-center gap-3" style={{ borderRadius: '2px' }}>
            <Unlock size={18} className="text-green-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-green-800">Financial Bids Opened</p>
              <p className="text-xs text-green-700 mt-0.5">Bid opening ceremony completed. Financial bids are unsealed.</p>
            </div>
            <button className="btn-primary text-xs ml-auto flex-shrink-0" onClick={() => navigate(`/tenders/${tenderId}/bid-comparison`)}>View Bid Comparison</button>
          </div>
        ) : (
          <div className="p-4 bg-amber-50 border-l-4 border-l-amber-500 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <Clock size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-amber-800">Bid Submission Deadline Passed — Ready for Bid Opening</p>
                <p className="text-xs text-amber-700 mt-1">{bids.length} bid{bids.length !== 1 ? 's' : ''} received. Open financial bids only after technical evaluation is complete.</p>
              </div>
            </div>
            <button className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 flex-shrink-0" style={{ borderRadius: '2px' }} onClick={handleOpenBids} disabled={openingBids}>
              {openingBids ? <RefreshCw size={14} className="animate-spin" /> : <Unlock size={14} />}
              {openingBids ? 'Opening…' : 'Open Financial Bids'}
            </button>
          </div>
        )
      ) : (
        <div className="p-3 bg-blue-50 border border-blue-100 flex items-center gap-2 text-xs text-blue-700" style={{ borderRadius: '2px' }}>
          <Lock size={13} className="flex-shrink-0" />
          Bid submission open until {new Date(tender.submission_deadline).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}. Financial bids remain sealed.
        </div>
      ))}

      {/* Corrigenda + Extensions */}
      {(corrigenda.length > 0 || extensions.length > 0) && (
        <div className="card p-5 space-y-3">
          {corrigenda.length > 0 && (
            <>
              <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><AlertTriangle size={14} className="text-amber-500" /> Corrigenda ({corrigenda.length})</h2>
              <div className="space-y-2">
                {corrigenda.map((c, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200" style={{ borderRadius: '2px' }}>
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-200 px-1.5 py-0.5 flex-shrink-0" style={{ borderRadius: '2px' }}>#{i + 1}</span>
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-slate-700">{c.description}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">Issued: {c.issued_at ? new Date(c.issued_at).toLocaleDateString('en-IN') : '—'}{c.issued_by ? ` · ${c.issued_by}` : ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {extensions.length > 0 && (
            <>
              <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mt-3"><Calendar size={14} className="text-blue-500" /> Deadline Extensions ({extensions.length})</h2>
              <div className="space-y-2">
                {extensions.map((e, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200" style={{ borderRadius: '2px' }}>
                    <span className="text-[10px] font-bold text-blue-700 bg-blue-200 px-1.5 py-0.5 flex-shrink-0" style={{ borderRadius: '2px' }}>#{e.extension_number}</span>
                    <div>
                      <p className="text-xs font-semibold text-slate-700">{e.old_deadline} → {e.new_deadline}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">{e.reason}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Primary Action Cards — existing features */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { icon: ListChecks, bg: 'bg-blue-50', iconColor: 'text-blue-700', title: t('view_requirements'), desc: `${tender.total_requirements || 0} requirements — ${tender.mandatory_count || 0} mandatory`, onClick: () => navigate(`/tenders/${tenderId}/requirements`) },
          { icon: Users,      bg: 'bg-purple-50', iconColor: 'text-purple-700', title: t('view_bidders'), desc: `${tender.bidder_count || 0} bidder${(tender.bidder_count || 0) !== 1 ? 's' : ''} submitted`, onClick: () => navigate(`/tenders/${tenderId}/bidders`) },
          { icon: Scale,      bg: 'bg-green-50', iconColor: 'text-green-700', title: t('bid_comparison'), desc: 'QCBS scores, L1/L2 prices, EMD status side-by-side', onClick: () => navigate(`/tenders/${tenderId}/bid-comparison`) },
          { icon: Globe,      bg: 'bg-teal-50', iconColor: 'text-teal-700', title: t('government_verification'), desc: 'Cross-verify bidder data against 8 government API sources', onClick: () => navigate('/gov-verification') },
        ].map(({ icon: Icon, bg, iconColor, title, desc, onClick }) => (
          <div key={title} className="card p-5 cursor-pointer hover:shadow-md transition-all border-2 border-transparent hover:border-blue-100" onClick={onClick}>
            <div className="flex items-center gap-4">
              <div className={`p-3 ${bg} flex-shrink-0`} style={{ borderRadius: '2px' }}><Icon className={iconColor} size={22} /></div>
              <div className="flex-1 min-w-0"><h3 className="font-semibold text-slate-800">{title}</h3><p className="text-sm text-gray-500 mt-0.5">{desc}</p></div>
              <ChevronRight className="ml-auto text-gray-400 flex-shrink-0" size={18} />
            </div>
          </div>
        ))}
      </div>

      {/* New Feature Cards — Committee, Pre-Bid, Reverse Auction */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { icon: UserCheck, color: 'text-indigo-600', bg: 'bg-indigo-50', label: 'Evaluation Committee', desc: 'Form committee, submit technical scores', path: `/tenders/${tenderId}/committee` },
          { icon: MessageSquare, color: 'text-amber-600', bg: 'bg-amber-50', label: 'Pre-Bid Meeting', desc: `${tender.prebid_questions?.length || 0} question${(tender.prebid_questions?.length || 0) !== 1 ? 's' : ''} received`, path: `/tenders/${tenderId}/prebid` },
          { icon: BarChart2, color: 'text-purple-600', bg: 'bg-purple-50', label: 'Reverse Auction', desc: policy.reverse_auction_applicable ? 'Configured — Launch when ready' : 'Not configured for this tender', path: `/tenders/${tenderId}/reverse-auction` },
        ].map(({ icon: Icon, color, bg, label, desc, path }) => (
          <div key={label} className="card p-4 cursor-pointer hover:shadow-sm transition-all" onClick={() => navigate(path)}>
            <div className="flex items-start gap-3">
              <div className={`p-2 ${bg} flex-shrink-0 mt-0.5`} style={{ borderRadius: '2px' }}><Icon size={16} className={color} /></div>
              <div>
                <p className="text-sm font-semibold text-slate-800">{label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modals */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
          <div className="bg-white p-6 w-full max-w-md shadow-2xl" style={{ borderRadius: '2px' }}>
            {modal === 'corrigendum' && (
              <>
                <h3 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2"><FilePlus size={16} className="text-amber-600" /> Issue Corrigendum #{corrigenda.length + 1}</h3>
                <p className="text-xs text-gray-500 mb-3">Visible to all bidders. Logged to audit trail.</p>
                <textarea rows={4} value={corrigendumText} onChange={(e) => setCorrigendumText(e.target.value)} placeholder="Describe the amendment…" className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none resize-none mb-4" style={{ borderRadius: '2px' }} />
                <div className="flex gap-3">
                  <button className="btn-secondary flex-1 justify-center" onClick={() => setModal(null)}>Cancel</button>
                  <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700" style={{ borderRadius: '2px' }} onClick={handleCorrigendum} disabled={modalWorking}>
                    {modalWorking ? <RefreshCw size={13} className="animate-spin" /> : <CheckCircle size={13} />} Publish
                  </button>
                </div>
              </>
            )}
            {modal === 'extend' && (
              <>
                <h3 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2"><Calendar size={16} className="text-blue-600" /> Extend Submission Deadline</h3>
                <p className="text-xs text-gray-500 mb-3">Current: <strong>{tender.submission_deadline?.split('T')[0]}</strong>{extensions.length > 0 ? ` (extended ${extensions.length}×)` : ''}</p>
                <div className="space-y-3 mb-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">New Deadline <span className="text-red-500">*</span></label>
                    <input type="date" value={extendForm.new_deadline} onChange={(e) => setExtendForm(p => ({ ...p, new_deadline: e.target.value }))} className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none" style={{ borderRadius: '2px' }} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Reason <span className="text-red-500">*</span></label>
                    <textarea rows={3} value={extendForm.reason} onChange={(e) => setExtendForm(p => ({ ...p, reason: e.target.value }))} placeholder="Reason for extension…" className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none resize-none" style={{ borderRadius: '2px' }} />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button className="btn-secondary flex-1 justify-center" onClick={() => setModal(null)}>Cancel</button>
                  <button className="btn-primary flex-1 justify-center" onClick={handleExtend} disabled={modalWorking}>
                    {modalWorking ? <RefreshCw size={13} className="animate-spin" /> : null} Extend Deadline
                  </button>
                </div>
              </>
            )}
            {modal === 'cancel' && (
              <>
                <h3 className="text-base font-bold text-red-800 mb-3 flex items-center gap-2"><XCircle size={16} className="text-red-600" /> Cancel Tender</h3>
                <div className="p-3 bg-red-50 border border-red-200 text-xs text-red-700 mb-4" style={{ borderRadius: '2px' }}>
                  Cancelling this tender will lock all bids and cannot be undone. You may initiate a Re-Tender afterwards.
                </div>
                <textarea rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Reason for cancellation (mandatory)…" className="w-full px-3 py-2 text-sm border border-gray-300 focus:outline-none resize-none mb-4" style={{ borderRadius: '2px' }} />
                <div className="flex gap-3">
                  <button className="btn-secondary flex-1 justify-center" onClick={() => setModal(null)}>Abort</button>
                  <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700" style={{ borderRadius: '2px' }} onClick={handleCancel} disabled={modalWorking}>
                    {modalWorking ? <RefreshCw size={13} className="animate-spin" /> : <XCircle size={13} />} Confirm Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
