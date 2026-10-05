/**
 * RejectionFeedbackDashboard — Officer View
 *
 * Lists every bidder that has been disqualified and shows the full rejection
 * record (category, stage, reason). The officer can optionally send an
 * additional personalised feedback message to help the bidder understand
 * what to improve for future tenders.
 *
 * Route: /rejection-feedback
 */
import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  XCircle, ChevronRight, Send, RefreshCw, CheckCircle,
  AlertTriangle, Tag, Layers, Calendar, User,
  MessageSquare, Shield, FileText, Mail, Eye,
} from 'lucide-react'
import api from '../../services/api.js'
import { PageLoader } from '../../components/LoadingSkeleton.jsx'
import { useToast } from '../../components/Toast.jsx'
import { useLanguage } from '../../context/LanguageContext.jsx'

const CATEGORY_COLORS = {
  'Eligibility Criteria Not Met':        'bg-red-100 text-red-800 border-red-200',
  'Required Documents Missing':          'bg-orange-100 text-orange-800 border-orange-200',
  'Technical Requirements Not Met':      'bg-purple-100 text-purple-800 border-purple-200',
  'Financial Evaluation':                'bg-blue-100 text-blue-800 border-blue-200',
  'Non-Compliance with Tender Conditions': 'bg-amber-100 text-amber-800 border-amber-200',
  'Late Submission':                     'bg-slate-100 text-slate-800 border-slate-200',
  'Invalid/Incomplete Information':      'bg-rose-100 text-rose-800 border-rose-200',
  'Other':                               'bg-gray-100 text-gray-700 border-gray-200',
}

function fmt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function RejectionFeedbackDashboard() {
  const navigate = useNavigate()
  const { addToast } = useToast()
  const { t } = useLanguage()

  const [records, setRecords]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [composing, setComposing] = useState(null)   // fb_id currently open
  const [msgText, setMsgText]     = useState('')
  const [sending, setSending]     = useState(false)
  const [filter, setFilter]       = useState('all')  // all | unsent | sent
  const [tenderFilter, setTenderFilter] = useState('all')

  const load = useCallback(() => {
    setLoading(true)
    api.get('/rejection-feedback')
      .then(res => setRecords(res.data || []))
      .catch(() => addToast('Failed to load rejection records', 'error'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const handleSend = async (fb_id) => {
    if (!msgText.trim()) { addToast('Please write a feedback message first', 'warning'); return }
    setSending(true)
    try {
      await api.post(`/rejection-feedback/${fb_id}/send`, {
        additional_feedback: msgText.trim(),
        officer: 'Rajesh Kumar',
      })
      addToast('Feedback sent to bidder', 'success')
      setComposing(null)
      setMsgText('')
      load()
    } catch (err) {
      addToast(err.message || 'Failed to send feedback', 'error')
    } finally {
      setSending(false)
    }
  }

  const tenderIds = ['all', ...new Set(records.map(r => r.tender_id).filter(Boolean))]

  const filtered = records.filter(r => {
    if (filter === 'unsent' && r.additional_feedback) return false
    if (filter === 'sent'   && !r.additional_feedback) return false
    if (tenderFilter !== 'all' && r.tender_id !== tenderFilter) return false
    return true
  })

  const unsentCount  = records.filter(r => !r.additional_feedback).length
  const sentCount    = records.filter(r =>  r.additional_feedback).length

  if (loading) return <PageLoader />

  return (
    <div className="p-6 space-y-5 max-w-4xl">

      {/* ── Breadcrumb ──────────────────────────────────────── */}
      <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
        <span className="hover:text-blue-600 cursor-pointer" onClick={() => navigate('/')}>
          {t('dashboard')}
        </span>
        <ChevronRight size={12} />
        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
          {t('rejection_feedback_title')}
        </span>
      </div>

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-red-100" style={{ borderRadius: '2px' }}>
            <XCircle size={20} className="text-red-600" />
          </div>
          <div>
            <h1 className="page-title">{t('rejection_feedback_title')}</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {t('rejection_feedback_subtitle')}
            </p>
          </div>
        </div>
        <button className="btn-secondary text-xs" onClick={load}>
          <RefreshCw size={13} /> {t('refresh')}
        </button>
      </div>

      {/* ── Summary strip ───────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: t('total_disqualified'),    value: records.length,  color: 'text-slate-700', bg: 'bg-slate-50',  border: 'border-slate-200' },
          { label: t('feedback_pending_send'), value: unsentCount,     color: 'text-amber-700', bg: 'bg-amber-50',  border: 'border-amber-200' },
          { label: t('feedback_sent'),         value: sentCount,       color: 'text-green-700', bg: 'bg-green-50',  border: 'border-green-200' },
        ].map(({ label, value, color, bg, border }) => (
          <div key={label} className={`border ${border} ${bg} p-4 text-center`} style={{ borderRadius: '2px' }}>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* ── Advisory notice ─────────────────────────────────── */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200" style={{ borderRadius: '2px' }}>
        <Shield size={15} className="text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-bold text-blue-800 uppercase tracking-wide">
            {t('feedback_advisory_heading')}
          </p>
          <p className="text-xs text-blue-700 mt-0.5 leading-relaxed">
            {t('feedback_advisory_body')}
          </p>
        </div>
      </div>

      {/* ── Filters ─────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1.5">
          {[
            { key: 'all',    label: `${t('filter_all')} (${records.length})` },
            { key: 'unsent', label: `${t('feedback_not_sent')} (${unsentCount})` },
            { key: 'sent',   label: `${t('feedback_sent')} (${sentCount})` },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`text-xs px-3 py-1.5 font-medium transition-colors ${
                filter === key ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              style={{ borderRadius: '2px' }}
            >
              {label}
            </button>
          ))}
        </div>
        {tenderIds.length > 2 && (
          <select
            value={tenderFilter}
            onChange={e => setTenderFilter(e.target.value)}
            className="ml-auto text-xs border border-gray-300 px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            style={{ borderRadius: '2px' }}
          >
            <option value="all">{t('filter_all')} {t('tenders')}</option>
            {tenderIds.filter(id => id !== 'all').map(id => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
        )}
      </div>

      {/* ── Empty state ──────────────────────────────────────── */}
      {filtered.length === 0 && (
        <div className="card p-12 text-center">
          <CheckCircle size={36} className="mx-auto mb-3 text-green-400 opacity-60" />
          <p className="text-sm font-semibold text-slate-600">
            {records.length === 0 ? t('no_disqualified_bidders') : t('no_records_match_filter')}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {records.length === 0 ? t('no_disqualified_desc') : t('try_different_filter')}
          </p>
        </div>
      )}

      {/* ── Records ─────────────────────────────────────────── */}
      <div className="space-y-4">
        {filtered.map(rec => {
          const isComposing  = composing === rec.id
          const feedbackSent = !!rec.additional_feedback
          const catColor     = CATEGORY_COLORS[rec.rejection_category] || CATEGORY_COLORS['Other']

          return (
            <div
              key={rec.id}
              className="card overflow-hidden"
              style={{ borderLeft: '4px solid #ef4444' }}
            >
              {/* ── Card header ─────────────────────────────── */}
              <div className="flex items-start justify-between gap-4 p-5">
                <div className="flex-1 min-w-0">
                  {/* Bidder name + ID */}
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-bold text-slate-800 truncate">
                      {rec.bidder_name || rec.bidder_id}
                    </span>
                    <span className="text-[10px] font-mono text-gray-400">{rec.bidder_id}</span>
                    {feedbackSent
                      ? <span className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 font-semibold border border-green-200" style={{ borderRadius: '2px' }}>
                          ✓ {t('feedback_sent')}
                        </span>
                      : <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 font-semibold border border-amber-200" style={{ borderRadius: '2px' }}>
                          ⚠ {t('feedback_not_sent')}
                        </span>
                    }
                  </div>

                  {/* Tender reference */}
                  {rec.tender_id && (
                    <button
                      className="text-[11px] text-blue-700 font-semibold bg-blue-50 border border-blue-200 px-2 py-0.5 mb-2 hover:bg-blue-100 transition-colors"
                      style={{ borderRadius: '2px' }}
                      onClick={() => navigate(`/tenders/${rec.tender_id}`)}
                    >
                      {rec.tender_id}
                    </button>
                  )}

                  {/* Meta row */}
                  <div className="flex items-center gap-4 text-[10px] text-gray-400 flex-wrap">
                    <span className="flex items-center gap-1">
                      <User size={10} /> {rec.officer}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar size={10} /> {fmt(rec.created_at)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Layers size={10} /> {rec.rejection_stage}
                    </span>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    className="btn-secondary text-xs py-1.5"
                    onClick={() => navigate(`/bidders/${rec.bidder_id}`)}
                    title={t('view_bidder')}
                  >
                    <Eye size={12} /> {t('view')}
                  </button>
                  {!feedbackSent && (
                    <button
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors"
                      style={{ borderRadius: '2px' }}
                      onClick={() => { setComposing(isComposing ? null : rec.id); setMsgText('') }}
                    >
                      <Send size={12} /> {t('send_feedback')}
                    </button>
                  )}
                </div>
              </div>

              {/* ── Rejection record ───────────────────────── */}
              <div className="px-5 pb-4 space-y-3">
                {/* Category badge */}
                <div className="flex items-center gap-2">
                  <Tag size={12} className="text-gray-400 flex-shrink-0" />
                  <span className={`text-[11px] font-semibold px-2.5 py-1 border ${catColor}`} style={{ borderRadius: '2px' }}>
                    {rec.rejection_category}
                  </span>
                </div>

                {/* Rejection reason */}
                <div className="bg-red-50 border border-red-200 px-4 py-3" style={{ borderRadius: '2px' }}>
                  <p className="text-[10px] uppercase font-bold text-red-600 tracking-wide mb-1">
                    {t('detailed_justification')}
                  </p>
                  <p className="text-xs text-red-900 leading-relaxed">"{rec.rejection_reason}"</p>
                </div>

                {/* Officer remarks (if any) */}
                {rec.officer_remarks && (
                  <div className="bg-gray-50 border border-gray-200 px-4 py-2.5" style={{ borderRadius: '2px' }}>
                    <p className="text-[10px] uppercase font-bold text-gray-500 tracking-wide mb-1">
                      {t('officer_remarks')}
                    </p>
                    <p className="text-xs text-slate-600 leading-relaxed">{rec.officer_remarks}</p>
                  </div>
                )}

                {/* Already-sent additional feedback */}
                {feedbackSent && (
                  <div className="bg-green-50 border border-green-200 px-4 py-3" style={{ borderRadius: '2px' }}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] uppercase font-bold text-green-700 tracking-wide flex items-center gap-1">
                        <Mail size={10} /> {t('feedback_sent_to_bidder')}
                      </p>
                      <span className="text-[10px] text-green-500">{fmt(rec.feedback_sent_at)}</span>
                    </div>
                    <p className="text-xs text-green-900 leading-relaxed">"{rec.additional_feedback}"</p>
                  </div>
                )}

                {/* ── Compose form ────────────────────────── */}
                {isComposing && (
                  <div className="border-2 border-blue-300 bg-blue-50 p-4 space-y-3" style={{ borderRadius: '2px' }}>
                    <div>
                      <p className="text-xs font-bold text-blue-800 mb-1.5">
                        {t('compose_feedback_heading')} — {rec.bidder_name}
                      </p>
                      <p className="text-[11px] text-blue-600 mb-2 leading-relaxed">
                        {t('compose_feedback_hint')}
                      </p>
                      <textarea
                        rows={4}
                        value={msgText}
                        onChange={e => setMsgText(e.target.value)}
                        placeholder={t('compose_feedback_placeholder')}
                        className="w-full px-3 py-2.5 text-sm border border-blue-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        style={{ borderRadius: '2px' }}
                        autoFocus
                      />
                      <p className={`text-[10px] text-right mt-0.5 ${msgText.trim().length === 0 ? 'text-gray-400' : msgText.trim().length < 20 ? 'text-red-500' : 'text-green-600'}`}>
                        {msgText.trim().length} {t('chars')}
                      </p>
                    </div>

                    {/* Feedback tips */}
                    <div className="bg-white border border-blue-200 px-3 py-2.5" style={{ borderRadius: '2px' }}>
                      <p className="text-[10px] uppercase font-semibold text-blue-600 mb-1">{t('feedback_tips_heading')}</p>
                      <ul className="text-[11px] text-slate-600 space-y-0.5 list-disc list-inside">
                        {[t('tip_1'), t('tip_2'), t('tip_3')].map((tip, i) => (
                          <li key={i}>{tip}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="flex gap-2">
                      <button
                        className="btn-secondary text-xs py-2 flex-1 justify-center"
                        onClick={() => { setComposing(null); setMsgText('') }}
                      >
                        {t('cancel')}
                      </button>
                      <button
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold text-white transition-colors ${
                          msgText.trim().length >= 20
                            ? 'bg-blue-700 hover:bg-blue-800'
                            : 'bg-gray-300 cursor-not-allowed'
                        }`}
                        style={{ borderRadius: '2px' }}
                        onClick={() => handleSend(rec.id)}
                        disabled={sending || msgText.trim().length < 20}
                      >
                        {sending
                          ? <><RefreshCw size={12} className="animate-spin" /> {t('sending')}…</>
                          : <><Send size={12} /> {t('send_feedback_btn')}</>
                        }
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
